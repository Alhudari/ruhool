// Agent Run Loop — executes a goal as a sequence of agent steps until done or
// budget exceeded. Each step invokes the main chat pipeline by POSTing to the
// local /api/chat endpoint and consuming its SSE. The runner lives in-process
// and records a trace on store.agentRuns.

import { logger } from './server/logging.js';

export interface RunOptions {
  conversationId: string;
  goal: string;
  rootAgent: string;
  maxSteps?: number;
  maxTokens?: number;
  onStep?: (step: { stepNumber: number; agentId: string; summary: string; tokensUsed: number }) => void | Promise<void>;
}

export interface RunResult {
  runId: string;
  status: 'done' | 'failed' | 'budget_exceeded' | 'waiting_user' | 'aborted';
  stepCount: number;
  tokensUsed: number;
  finalAgent: string;
  needsInputPrompt?: string;
  error?: string;
}

export interface AgentRunRecordLike {
  id: string;
  conversationId: string;
  rootTaskId?: string;
  agentId: string;
  status: RunResult['status'] | 'running';
  stepCount: number;
  maxSteps: number;
  tokensUsed: number;
  maxTokens: number;
  startedAt: string;
  endedAt?: string;
  lastStepAt?: string;
  trace?: Array<{ stepNumber: number; agentId: string; summary: string; tokensUsed: number; at: string }>;
}

export interface RunnerStoreLike {
  agentRuns?: AgentRunRecordLike[];
}

interface RunnerDeps {
  store: RunnerStoreLike;
  saveStore: () => void;
  /**
   * Invoke one turn of the chat handler locally (in-process preferred, but we
   * call the HTTP endpoint for simplicity). Returns the final assistant text,
   * the next agent (if explicitly handed off), and token usage.
   */
  runOneStep: (args: {
    conversationId: string;
    message: string;
    agentId: string;
    chainDepth: number;
    skipPlayMaker?: boolean;
  }) => Promise<{
    text: string;
    nextAgent?: string | null;
    tokensUsed: number;
    needsInput?: string;
    done?: boolean;
  }>;
}

export async function runAgentLoop(opts: RunOptions, deps: RunnerDeps): Promise<RunResult> {
  const runId = crypto.randomUUID();
  const maxSteps = opts.maxSteps ?? 10;
  const maxTokens = opts.maxTokens ?? 60000;
  const record: AgentRunRecordLike = {
    id: runId,
    conversationId: opts.conversationId,
    agentId: opts.rootAgent,
    status: 'running',
    stepCount: 0,
    maxSteps,
    tokensUsed: 0,
    maxTokens,
    startedAt: new Date().toISOString(),
    trace: [],
  };
  if (!deps.store.agentRuns) deps.store.agentRuns = [];
  deps.store.agentRuns.unshift(record);
  deps.saveStore();

  let currentAgent = opts.rootAgent;
  let currentMessage = opts.goal;
  let step = 0;

  try {
    while (true) {
      if (step >= maxSteps) {
        record.status = 'budget_exceeded';
        break;
      }
      if (record.tokensUsed >= maxTokens) {
        record.status = 'budget_exceeded';
        break;
      }
      step++;
      record.stepCount = step;
      record.lastStepAt = new Date().toISOString();

      const result = await deps.runOneStep({
        conversationId: opts.conversationId,
        message: currentMessage,
        agentId: currentAgent,
        chainDepth: step - 1,
        skipPlayMaker: step > 1, // first step respects playmaker; later steps are explicit
      });

      record.tokensUsed += result.tokensUsed;
      record.trace!.push({
        stepNumber: step,
        agentId: currentAgent,
        summary: result.text.slice(0, 200),
        tokensUsed: result.tokensUsed,
        at: new Date().toISOString(),
      });
      if (opts.onStep) {
        try {
          await opts.onStep({ stepNumber: step, agentId: currentAgent, summary: result.text.slice(0, 200), tokensUsed: result.tokensUsed });
        } catch { /* ignore callback errors */ }
      }

      if (result.needsInput) {
        record.status = 'waiting_user';
        record.agentId = currentAgent;
        const res: RunResult = { runId, status: 'waiting_user', stepCount: step, tokensUsed: record.tokensUsed, finalAgent: currentAgent, needsInputPrompt: result.needsInput };
        finalize(record, deps);
        return res;
      }
      if (result.done) {
        record.status = 'done';
        break;
      }
      // Determine who runs next. Priority:
      //   1. Explicit [RUN:NEXT_AGENT:id] handoff from the agent
      //   2. Any directive @mention the agent used (already surfaced via nextAgent)
      //   3. Root agent re-checks progress (multi-turn planning)
      // We do NOT stop silently — the point of a run is to push toward completion.
      if (result.nextAgent && result.nextAgent !== currentAgent) {
        currentAgent = result.nextAgent;
        currentMessage = `[نداء داخلي — سلسلة الوكلاء]
أنت الآن الوكيل المسؤول عن المتابعة. الهدف الأصلي كان: "${opts.goal.slice(0, 400)}"
راجع آخر ردود في هذه المحادثة، نفّذ دورك فقط، ولا تتقمّص شخصية وكيل آخر.
عند إنهاء دورك: استخدم \`[RUN:NEXT_AGENT:id]\` لتسليم لوكيل آخر، أو \`[RUN:DONE]\` عند الاكتمال الكلي، أو \`[RUN:NEEDS_INPUT:سؤال]\` لو احتجت المستخدم.`;
        continue;
      }
      // No explicit handoff — ask the ROOT agent (usually the manager) to decide
      // next action. This prevents early silent termination.
      if (currentAgent !== opts.rootAgent && step < maxSteps) {
        currentAgent = opts.rootAgent;
        currentMessage = `[نداء داخلي — تقييم التقدم]
أنت المنسّق. الوكيل السابق ${result.text ? 'قدّم نتيجة.' : 'لم يقدّم نتيجة واضحة.'} راجع الهدف الأصلي: "${opts.goal.slice(0, 400)}"
قرّر: هل نحتاج وكيلاً آخر؟ استخدم \`[RUN:NEXT_AGENT:id]\`. هل اكتمل الهدف؟ \`[RUN:DONE]\`. هل نحتاج المستخدم؟ \`[RUN:NEEDS_INPUT:سؤال]\`.
لا تعطي رداً طويلاً — قرار فقط.`;
        continue;
      }
      // Root agent also didn't hand off and we're at same agent → done
      record.status = 'done';
      break;
    }
  } catch (err: unknown) {
    record.status = 'failed';
    logger.error({ err }, '[runner] step failed');
    finalize(record, deps);
    return { runId, status: 'failed', stepCount: step, tokensUsed: record.tokensUsed, finalAgent: currentAgent, error: err instanceof Error ? err.message : 'Step failed' };
  }

  finalize(record, deps);
  return {
    runId,
    status: record.status as RunResult['status'],
    stepCount: step,
    tokensUsed: record.tokensUsed,
    finalAgent: currentAgent,
  };
}

function finalize(record: AgentRunRecordLike, deps: RunnerDeps) {
  record.endedAt = new Date().toISOString();
  deps.saveStore();
}
