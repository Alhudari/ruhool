/**
 * Workflow orchestrator — Phase 2 (Workflow DAG + async handoff).
 *
 * Factory-based, dependency-injected service that:
 *   1. Plans a workflow from a free-form user request (via الراعي + tool_use).
 *   2. Persists workflow_runs + workflow_steps rows.
 *   3. Executes steps sequentially. Each step receives the prior steps' outputs
 *      as `priorMessages` (same shape as Phase 1 in-turn handoff).
 *   4. Emits SSE events on a `workflow-runs:<id>` channel plus a global channel.
 *
 * Execution engine: BullMQ when available, otherwise in-process setImmediate
 * loop so `pnpm dev` works without Redis.
 *
 * IMPORTANT: no Arabic identifiers (الراعي, عبدان, ...) are translated — they
 * flow through the dispatcher as-is.
 */
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import type { Queue } from 'bullmq';

import type {
  StoreData,
  WorkflowRunRecord,
  WorkflowStepRecord,
  WorkflowStepArtifact,
} from '../../store/types.js';
import type { DispatchResult, PriorMessage } from '../agents/specialists.js';
import type { Channel } from '../../sse/broadcast.js';
import * as runsRepo from '../../store/repositories/workflow-runs.repo.js';
import * as stepsRepo from '../../store/repositories/workflow-steps.repo.js';

export interface OrchestratorLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn?: (obj: Record<string, unknown>, msg?: string) => void;
  error?: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface SpecialistsDispatcher {
  (params: {
    specialist: string;
    task: string;
    context?: string;
    priorMessages?: PriorMessage[];
    roundNumber?: number;
    deps: unknown;
  }): Promise<DispatchResult & { artifacts?: WorkflowStepArtifact[] }>;
}

export type WorkflowEvent =
  | { type: 'workflow-run-started'; runId: string }
  | { type: 'workflow-step-started'; runId: string; stepId: string; stepIndex: number; specialist: string; attemptCount?: number; maxAttempts?: number; timeoutMs?: number }
  | { type: 'workflow-step-update'; runId: string; stepId: string; stepIndex: number; specialist: string; attemptCount: number; maxAttempts: number }
  | { type: 'workflow-step-completed'; runId: string; stepId: string; stepIndex: number; specialist: string; output: string; costUsd?: number; totalCostUsd?: number }
  | { type: 'workflow-step-failed'; runId: string; stepId: string; stepIndex: number; specialist: string; error: string; attemptCount?: number; maxAttempts?: number; costUsd?: number; totalCostUsd?: number }
  | { type: 'workflow-run-completed'; runId: string }
  | { type: 'workflow-run-failed'; runId: string; error: string }
  | { type: 'workflow-run-paused'; runId: string }
  | { type: 'workflow-run-canceled'; runId: string };

export interface PlannedStep {
  specialist: string;
  task: string;
  expectedOutput?: string;
}

export interface PlannedWorkflow {
  title: string;
  steps: PlannedStep[];
}

export interface OrchestratorDeps {
  getStore: () => StoreData;
  logger: OrchestratorLogger;
  /** The Phase 1 dispatcher — already threaded with a provider + model. */
  specialistsDispatch: SpecialistsDispatcher;
  /** The Anthropic provider used to call الراعي for planning. */
  plannerProvider: {
    chat: (params: {
      model: string;
      systemPrompt?: string;
      messages: Array<{ role: string; content: string }>;
      tools?: Anthropic.Tool[];
      maxTokens?: number;
    }) => AsyncGenerator<{ type: string; content?: string; name?: string; input?: unknown; id?: string }, void, unknown>;
  } | null;
  plannerModel: string;
  /** Global SSE broadcast — one listener gets every run's events. */
  sseBroadcast?: Channel<WorkflowEvent>;
  /** Per-run SSE channel factory (keyed by runId). */
  getRunChannel?: (runId: string) => Channel<WorkflowEvent>;
  logActivity?: (
    type: string,
    action: string,
    details: string,
    opts?: { agentId?: string; metadata?: Record<string, unknown> }
  ) => void;
  /** BullMQ queue (or null for in-process fallback). */
  getQueue?: () => Queue | null;
  /**
   * CHAT_V2 P2 — workflow ↔ conversation bridge.
   *
   * When a run was triggered from a chat (`run.createdByConversationId` set),
   * `executeStep` calls this hook before/after each step so the orchestrator's
   * progress events surface as live bubbles inside the chat (WhatsApp-group
   * feel). Implementation is expected to:
   *   1. Persist a new `messages` row with {agentId, kind, workflowStepId}.
   *   2. Fan-out on the per-conversation SSE channel so mounted chat-views
   *      update in real time.
   *
   * Optional: when absent, the orchestrator behaves exactly as before.
   */
  conversationPoster?: (msg: {
    conversationId: string;
    agentId: string;
    kind: 'progress' | 'text' | 'artifact';
    content: string;
    workflowRunId: string;
    workflowStepId?: string;
    artifacts?: WorkflowStepArtifact[];
  }) => Promise<void> | void;
}

export type RunHandleMode = 'temporal' | 'bullmq' | 'inproc' | 'unknown';

export interface RunHandle {
  mode: RunHandleMode;
  workflowId?: string;
  jobIds?: string[];
  status?: string;
}

export interface WorkflowOrchestrator {
  planWorkflow(params: {
    userRequest: string;
    conversationId?: string | null;
    title?: string;
  }): Promise<PlannedWorkflow>;
  createRunFromPlan(params: {
    plan: PlannedWorkflow;
    conversationId?: string | null;
  }): Promise<{ run: WorkflowRunRecord; steps: WorkflowStepRecord[] }>;
  startRun(runId: string): Promise<void>;
  /**
   * Phase 3: durable start. Uses Temporal when `TEMPORAL_ADDRESS` is set and
   * the connection succeeds. Falls back to `startRun` otherwise.
   */
  startRunDurable?(runId: string): Promise<RunHandle>;
  executeStep(stepId: string): Promise<void>;
  pauseRun(runId: string): Promise<void>;
  resumeRun?(runId: string): Promise<void>;
  cancelRun(runId: string): Promise<void>;
  getRunHandle?(runId: string): Promise<RunHandle>;
  listRunEvents?: () => void; // placeholder for future
}

// ─── Planner system prompt ───
const PLANNER_SYSTEM_PROMPT = `أنت الراعي، منسق الوكلاء. مهمتك الآن: تخطيط workflow متعدد الخطوات.

استقبل طلب المستخدم، وقسّمه إلى خطوات متسلسلة، كل خطوة يقوم بها متخصّص واحد.

المتخصصون المتاحون:
- الباحث: بحث واستقصاء
- المُلخِّص: قراءة ومساعدة فهم نصوص
- المُقارِن: مقارنات
- الناقد: نقد كتابي
- المصمم: معماري/تخطيط
- السارد: صنع محتوى
- المبدع: أفكار إبداعية
- مهام: مهام ومتابعة
- المحلل: تحليل
- المنظّم: تنظيم
- المشخّص: تشخيص مشاكل

استخدم أداة plan_workflow لإعادة الخطة. كل خطوة تحتاج specialist + task (بالعربية) + expectedOutput اختياري.
الحد الأقصى: 6 خطوات.`;

function planWorkflowTool(): Anthropic.Tool {
  return {
    name: 'plan_workflow',
    description: 'Return a structured workflow plan. Call this tool exactly once.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short Arabic title for the workflow.' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              specialist: { type: 'string', description: 'Arabic canonical name or English id.' },
              task: { type: 'string' },
              expectedOutput: { type: 'string' },
            },
            required: ['specialist', 'task'],
          },
        },
      },
      required: ['title', 'steps'],
    },
  };
}

export function createWorkflowOrchestrator(deps: OrchestratorDeps): WorkflowOrchestrator {
  const channels = new Map<string, Channel<WorkflowEvent>>();

  function channelFor(runId: string): Channel<WorkflowEvent> | null {
    if (deps.getRunChannel) {
      let ch = channels.get(runId);
      if (!ch) {
        ch = deps.getRunChannel(runId);
        channels.set(runId, ch);
      }
      return ch;
    }
    return null;
  }

  function emit(ev: WorkflowEvent): void {
    try {
      deps.sseBroadcast?.publish(ev);
    } catch {
      /* ignore */
    }
    try {
      const ch = channelFor(ev.runId);
      ch?.publish(ev);
    } catch {
      /* ignore */
    }
  }

  async function planWorkflow(params: {
    userRequest: string;
    conversationId?: string | null;
    title?: string;
  }): Promise<PlannedWorkflow> {
    if (!deps.plannerProvider) {
      throw new Error('planner provider unavailable');
    }
    const tools = [planWorkflowTool()];
    let planned: PlannedWorkflow | null = null;
    for await (const chunk of deps.plannerProvider.chat({
      model: deps.plannerModel,
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: params.userRequest }],
      tools,
      maxTokens: 1024,
    })) {
      if (chunk.type === 'tool_use' && chunk.name === 'plan_workflow') {
        const inp = chunk.input as { title?: string; steps?: PlannedStep[] };
        if (inp?.title && Array.isArray(inp.steps) && inp.steps.length > 0) {
          planned = {
            title: params.title || inp.title,
            steps: inp.steps
              .filter((s) => s && typeof s.specialist === 'string' && typeof s.task === 'string')
              .slice(0, 6)
              .map((s) => ({
                specialist: s.specialist,
                task: s.task,
                expectedOutput: s.expectedOutput,
              })),
          };
        }
      }
    }
    if (!planned || planned.steps.length === 0) {
      throw new Error('planner did not return a valid plan');
    }
    return planned;
  }

  async function createRunFromPlan(params: {
    plan: PlannedWorkflow;
    conversationId?: string | null;
  }): Promise<{ run: WorkflowRunRecord; steps: WorkflowStepRecord[] }> {
    const store = deps.getStore();
    const now = new Date().toISOString();
    const run: WorkflowRunRecord = {
      id: crypto.randomUUID(),
      title: params.plan.title,
      createdByConversationId: params.conversationId ?? null,
      status: 'pending',
      currentStepIndex: 0,
      totalCostUsd: 0,
      createdAt: now,
      updatedAt: now,
    };
    await runsRepo.createRun(store, run);
    const steps: WorkflowStepRecord[] = [];
    for (let i = 0; i < params.plan.steps.length; i++) {
      const ps = params.plan.steps[i];
      const step: WorkflowStepRecord = {
        id: crypto.randomUUID(),
        runId: run.id,
        stepIndex: i,
        specialist: ps.specialist,
        task: ps.task,
        expectedOutput: ps.expectedOutput ?? null,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      await stepsRepo.createStep(store, step);
      steps.push(step);
    }
    deps.logger.info({ runId: run.id, stepCount: steps.length }, 'workflow.createRunFromPlan');
    return { run, steps };
  }

  async function enqueueStep(stepId: string): Promise<void> {
    const queue = deps.getQueue?.() ?? null;
    if (queue) {
      try {
        await queue.add('workflow-step', { stepId }, { removeOnComplete: 100, removeOnFail: 100 });
        return;
      } catch (err) {
        deps.logger.warn?.(
          { err: err instanceof Error ? err.message : err, stepId },
          'workflow.enqueueStep fallback to in-process',
        );
      }
    }
    // Fallback: in-process, next tick.
    setImmediate(() => {
      executeStep(stepId).catch((err) => {
        deps.logger.error?.({ err: err instanceof Error ? err.message : err, stepId }, 'workflow.executeStep error');
      });
    });
  }

  async function startRun(runId: string): Promise<void> {
    const store = deps.getStore();
    const run = await runsRepo.getRun(store, runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    if (run.status !== 'pending' && run.status !== 'paused') {
      throw new Error(`run ${runId} cannot be started from status=${run.status}`);
    }
    const steps = await stepsRepo.listStepsForRun(store, runId);
    const firstPending = steps.find((s) => s.status === 'pending');
    if (!firstPending) {
      // nothing to do — already complete
      await runsRepo.updateRun(store, runId, { status: 'completed', completedAt: new Date().toISOString() });
      emit({ type: 'workflow-run-completed', runId });
      return;
    }
    await runsRepo.updateRun(store, runId, {
      status: 'running',
      startedAt: run.startedAt || new Date().toISOString(),
    });
    emit({ type: 'workflow-run-started', runId });
    deps.logActivity?.('system', 'workflow-run-started', `run ${runId}: ${run.title}`, {
      metadata: { runId, title: run.title },
    });
    await enqueueStep(firstPending.id);
  }

  async function executeStep(stepId: string): Promise<void> {
    const store = deps.getStore();
    const step = await stepsRepo.getStep(store, stepId);
    if (!step) {
      deps.logger.warn?.({ stepId }, 'workflow.executeStep: step not found');
      return;
    }
    const run = await runsRepo.getRun(store, step.runId);
    if (!run) {
      deps.logger.warn?.({ stepId, runId: step.runId }, 'workflow.executeStep: run not found');
      return;
    }
    if (run.status === 'paused' || run.status === 'canceled' || run.status === 'failed') {
      deps.logger.info({ stepId, runId: run.id, status: run.status }, 'workflow.executeStep skipped');
      return;
    }

    // Fix G6: short-circuit on already-completed steps so a Temporal activity
    // retry does not re-dispatch the specialist (and double the token spend).
    if (step.status === 'completed') {
      deps.logger.info(
        { stepId, runId: run.id },
        'workflow.executeStep noop (already completed)',
      );
      return;
    }

    // Build prior context from completed earlier steps.
    const allSteps = await stepsRepo.listStepsForRun(store, run.id);
    const priorCompleted = allSteps.filter((s) => s.stepIndex < step.stepIndex && s.status === 'completed');
    const priorMessages: PriorMessage[] = priorCompleted.slice(-8).map((s) => ({
      role: 'assistant',
      content: s.output || '',
      agent: s.specialist,
      agentDisplay: s.specialist,
    }));
    const fullHistory = priorCompleted.map((s) => ({ specialist: s.specialist, output: s.output || '' }));
    const lastOutput = priorCompleted.length > 0 ? priorCompleted[priorCompleted.length - 1].output || '' : '';
    const handoffInput = {
      handoff: lastOutput.slice(0, 2000),
      fullHistory,
    };

    // G8: bump attempt counter. Fallbacks apply when persisted value is null
    // (legacy rows from before Phase 5).
    const priorAttempts = step.attemptCount ?? 0;
    const maxAttempts = step.maxAttempts ?? 3;
    const newAttemptCount = priorAttempts + 1;
    // G7: per-step timeout. Default is 1h, same ceiling as Temporal activity.
    const timeoutMs = step.timeoutMs ?? 3_600_000;

    await stepsRepo.updateStep(store, step.id, {
      status: 'running',
      startedAt: new Date().toISOString(),
      input: handoffInput,
      attemptCount: newAttemptCount,
      maxAttempts,
      timeoutMs,
    });
    emit({
      type: 'workflow-step-started',
      runId: run.id,
      stepId: step.id,
      stepIndex: step.stepIndex,
      specialist: step.specialist,
      attemptCount: newAttemptCount,
      maxAttempts,
      timeoutMs,
    });

    // CHAT_V2 P2 — bridge: post a live "started" progress bubble into the
    // originating conversation so the user watches the DAG unfold in-chat.
    if (deps.conversationPoster && run.createdByConversationId) {
      try {
        await deps.conversationPoster({
          conversationId: run.createdByConversationId,
          agentId: step.specialist,
          kind: 'progress',
          content: `بديت: ${step.task.slice(0, 200)}`,
          workflowRunId: run.id,
          workflowStepId: step.id,
        });
      } catch (err) {
        deps.logger.warn?.({ err: err instanceof Error ? err.message : err, stepId: step.id }, 'conversationPoster(start) failed');
      }
    }
    if (newAttemptCount > 1) {
      emit({
        type: 'workflow-step-update',
        runId: run.id,
        stepId: step.id,
        stepIndex: step.stepIndex,
        specialist: step.specialist,
        attemptCount: newAttemptCount,
        maxAttempts,
      });
    }

    const started = Date.now();
    try {
      // G7: enforce per-step timeout by racing the dispatch against a timer.
      const dispatchPromise = deps.specialistsDispatch({
        specialist: step.specialist,
        task: step.task,
        context: lastOutput ? `السياق من الخطوة السابقة:\n${lastOutput.slice(0, 2000)}` : undefined,
        priorMessages,
        roundNumber: step.stepIndex + 1,
        deps: {},
      });
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`step timeout after ${timeoutMs}ms`)), timeoutMs);
      });
      const result = (await Promise.race([dispatchPromise, timeoutPromise]).finally(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      })) as Awaited<typeof dispatchPromise>;
      const durationMs = Date.now() - started;

      const stepCostUsd = (result.usage as { costUsd?: number }).costUsd ?? 0;
      await stepsRepo.updateStep(store, step.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        output: result.output,
        artifacts: result.artifacts ?? null,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costUsd: stepCostUsd,
          model: (result as { model?: string }).model ?? 'unknown',
        },
        durationMs,
      });

      // Roll step cost up into the run's total.
      const currentRun = await runsRepo.getRun(store, run.id);
      const newTotalCostUsd = (currentRun?.totalCostUsd ?? 0) + stepCostUsd;
      if (stepCostUsd > 0) {
        await runsRepo.updateRun(store, run.id, { totalCostUsd: newTotalCostUsd });
      }

      emit({
        type: 'workflow-step-completed',
        runId: run.id,
        stepId: step.id,
        stepIndex: step.stepIndex,
        specialist: step.specialist,
        output: result.output,
        costUsd: stepCostUsd,
        totalCostUsd: newTotalCostUsd,
      });

      // CHAT_V2 P2 — bridge: post the step's final output back into the chat.
      if (deps.conversationPoster && run.createdByConversationId) {
        try {
          const preview = (result.output || '').slice(0, 500);
          await deps.conversationPoster({
            conversationId: run.createdByConversationId,
            agentId: step.specialist,
            kind: result.artifacts && result.artifacts.length > 0 ? 'artifact' : 'text',
            content: preview,
            workflowRunId: run.id,
            workflowStepId: step.id,
            artifacts: result.artifacts ?? undefined,
          });
        } catch (err) {
          deps.logger.warn?.({ err: err instanceof Error ? err.message : err, stepId: step.id }, 'conversationPoster(done) failed');
        }
      }

      // Advance run pointer
      const updatedSteps = await stepsRepo.listStepsForRun(store, run.id);
      const nextPending = updatedSteps.find((s) => s.status === 'pending');

      // Refresh run in case of external pause / cancel.
      const freshRun = await runsRepo.getRun(store, run.id);
      if (freshRun?.status === 'paused') {
        emit({ type: 'workflow-run-paused', runId: run.id });
        return;
      }
      if (freshRun?.status === 'canceled') {
        emit({ type: 'workflow-run-canceled', runId: run.id });
        return;
      }

      if (nextPending) {
        await runsRepo.updateRun(store, run.id, { currentStepIndex: nextPending.stepIndex });
        await enqueueStep(nextPending.id);
      } else {
        await runsRepo.updateRun(store, run.id, {
          status: 'completed',
          completedAt: new Date().toISOString(),
        });
        emit({ type: 'workflow-run-completed', runId: run.id });
        deps.logActivity?.('system', 'workflow-run-completed', `run ${run.id}`, {
          metadata: { runId: run.id, title: run.title },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      deps.logger.error?.({ err: msg, stepId: step.id }, 'workflow.executeStep failed');

      // Roll up partial usage if the error carries it (e.g. provider charged
      // for partial tokens before timing out).
      const partial = (err as { partialUsage?: { costUsd?: number } }).partialUsage;
      const partialCostUsd = partial?.costUsd ?? 0;
      let totalCostUsd: number | undefined;
      if (partialCostUsd > 0) {
        const currentRun = await runsRepo.getRun(store, run.id);
        totalCostUsd = (currentRun?.totalCostUsd ?? 0) + partialCostUsd;
        await runsRepo.updateRun(store, run.id, { totalCostUsd });
      }

      await stepsRepo.updateStep(store, step.id, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: msg,
        durationMs: Date.now() - started,
      });
      await runsRepo.updateRun(store, run.id, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: msg,
      });
      emit({
        type: 'workflow-step-failed',
        runId: run.id,
        stepId: step.id,
        stepIndex: step.stepIndex,
        specialist: step.specialist,
        error: msg,
        attemptCount: newAttemptCount,
        maxAttempts,
        costUsd: partialCostUsd || undefined,
        totalCostUsd,
      });

      // CHAT_V2 P2 — bridge: surface the failure in-chat as a progress bubble.
      if (deps.conversationPoster && run.createdByConversationId) {
        try {
          await deps.conversationPoster({
            conversationId: run.createdByConversationId,
            agentId: step.specialist,
            kind: 'progress',
            content: `فشلت: ${msg.slice(0, 200)}`,
            workflowRunId: run.id,
            workflowStepId: step.id,
          });
        } catch { /* ignore */ }
      }
      emit({ type: 'workflow-run-failed', runId: run.id, error: msg });
      deps.logActivity?.('error', 'workflow-run-failed', `run ${run.id}: ${msg}`, {
        metadata: { runId: run.id, stepId: step.id },
      });
    }
  }

  async function pauseRun(runId: string): Promise<void> {
    const store = deps.getStore();
    const run = await runsRepo.getRun(store, runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    if (run.status !== 'running' && run.status !== 'pending') return;
    await runsRepo.updateRun(store, runId, { status: 'paused' });
    // Signal Temporal if durable.
    try {
      const md = (run.metadata ?? {}) as { temporalWorkflowId?: string };
      if (md.temporalWorkflowId && process.env.TEMPORAL_ADDRESS) {
        const { signalDagWorkflow } = await import('../../workers/temporal.js');
        await signalDagWorkflow(runId, 'pauseRun');
      }
    } catch {
      /* best effort */
    }
    emit({ type: 'workflow-run-paused', runId });
  }

  async function resumeRun(runId: string): Promise<void> {
    const store = deps.getStore();
    const run = await runsRepo.getRun(store, runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    if (run.status !== 'paused') return;
    await runsRepo.updateRun(store, runId, { status: 'running' });

    const md = (run.metadata ?? {}) as { temporalWorkflowId?: string };
    if (md.temporalWorkflowId && process.env.TEMPORAL_ADDRESS) {
      try {
        const { signalDagWorkflow } = await import('../../workers/temporal.js');
        const ok = await signalDagWorkflow(runId, 'resumeRun');
        if (ok) {
          emit({ type: 'workflow-run-started', runId });
          return;
        }
      } catch {
        /* fall through to bullmq */
      }
    }

    // BullMQ / in-proc fallback: re-enqueue the next pending step.
    const steps = await stepsRepo.listStepsForRun(store, runId);
    const nextPending = steps.find((s) => s.status === 'pending');
    if (nextPending) await enqueueStep(nextPending.id);
    emit({ type: 'workflow-run-started', runId });
  }

  async function cancelRun(runId: string): Promise<void> {
    const store = deps.getStore();
    const run = await runsRepo.getRun(store, runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    if (run.status === 'completed' || run.status === 'failed') return;
    await runsRepo.updateRun(store, runId, {
      status: 'canceled',
      completedAt: new Date().toISOString(),
    });
    // Signal Temporal if durable.
    try {
      const md = (run.metadata ?? {}) as { temporalWorkflowId?: string };
      if (md.temporalWorkflowId && process.env.TEMPORAL_ADDRESS) {
        const { signalDagWorkflow } = await import('../../workers/temporal.js');
        await signalDagWorkflow(runId, 'cancelRun');
      }
    } catch {
      /* best effort */
    }
    emit({ type: 'workflow-run-canceled', runId });
  }

  async function startRunDurable(runId: string): Promise<RunHandle> {
    const store = deps.getStore();
    const run = await runsRepo.getRun(store, runId);
    if (!run) throw new Error(`run not found: ${runId}`);

    const address = process.env.TEMPORAL_ADDRESS;
    if (address) {
      try {
        const steps = await stepsRepo.listStepsForRun(store, runId);
        const pending = steps.filter((s) => s.status === 'pending' || s.status === 'running');
        if (pending.length === 0) {
          await startRun(runId);
          return { mode: 'inproc' };
        }
        const { startDagWorkflow } = await import('../../workers/temporal.js');
        const workflowId = await startDagWorkflow({
          runId,
          stepIds: pending.map((s) => s.id),
        });
        await runsRepo.updateRun(store, runId, {
          status: 'running',
          startedAt: run.startedAt || new Date().toISOString(),
          metadata: { ...(run.metadata ?? {}), temporalWorkflowId: workflowId, mode: 'temporal' },
        });
        emit({ type: 'workflow-run-started', runId });
        deps.logActivity?.('system', 'workflow-run-started', `run ${runId} (temporal)`, {
          metadata: { runId, title: run.title, mode: 'temporal', workflowId },
        });
        return { mode: 'temporal', workflowId };
      } catch (err) {
        deps.logger.warn?.(
          { err: err instanceof Error ? err.message : err, runId },
          'workflow.startRunDurable Temporal start failed — falling back to BullMQ',
        );
      }
    }

    await startRun(runId);
    const queue = deps.getQueue?.() ?? null;
    return { mode: queue ? 'bullmq' : 'inproc' };
  }

  async function getRunHandle(runId: string): Promise<RunHandle> {
    const store = deps.getStore();
    const run = await runsRepo.getRun(store, runId);
    if (!run) return { mode: 'unknown' };
    const md = (run.metadata ?? {}) as { temporalWorkflowId?: string; mode?: string };
    if (md.mode === 'temporal' && md.temporalWorkflowId) {
      if (process.env.TEMPORAL_ADDRESS) {
        try {
          const { describeDagWorkflow } = await import('../../workers/temporal.js');
          const d = await describeDagWorkflow(runId);
          if (d.found) {
            return { mode: 'temporal', workflowId: d.workflowId, status: d.status };
          }
        } catch {
          /* fall through */
        }
      }
      return { mode: 'temporal', workflowId: md.temporalWorkflowId, status: 'DISCONNECTED' };
    }
    const queue = deps.getQueue?.() ?? null;
    return { mode: queue ? 'bullmq' : 'inproc', status: run.status };
  }

  return {
    planWorkflow,
    createRunFromPlan,
    startRun,
    startRunDurable,
    executeStep,
    pauseRun,
    resumeRun,
    cancelRun,
    getRunHandle,
  };
}
