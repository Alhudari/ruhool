/**
 * Phase 2 tests: orchestrator plan + execute + failure semantics.
 *
 * All I/O is mocked — no Redis, no DB, no network.
 */
import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';

import { createWorkflowOrchestrator } from './orchestrator.js';
import type { SpecialistsDispatcher } from './orchestrator.js';
import type { StoreData, WorkflowStepRecord } from '../../store/types.js';
import { createChannel } from '../../sse/broadcast.js';

function makeStore(): StoreData {
  // Minimal StoreData with the fields touched by the repos.
  return {
    providers: [],
    conversations: [],
    messages: [],
    usage: [],
    customAgents: [],
    memories: [],
    papers: [],
    notes: [],
    workflows: [],
    tools: [],
    approvals: [],
    activityLog: [],
    schedules: [],
    tasks: [],
    taskLists: [],
    workflowRuns: [],
    workflowSteps: [],
  } as unknown as StoreData;
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makePlannerProvider(tool_use: { title: string; steps: Array<{ specialist: string; task: string; expectedOutput?: string }> } | null) {
  return {
    chat: vi.fn(async function* () {
      if (tool_use) {
        yield {
          type: 'tool_use' as const,
          name: 'plan_workflow',
          input: tool_use,
          id: 'tu_1',
        };
      }
      yield { type: 'done' as const };
    }),
  };
}

describe('workflow orchestrator', () => {
  it('plans a workflow via planner tool_use and creates run + steps', async () => {
    const store = makeStore();
    const dispatch: SpecialistsDispatcher = vi.fn(async () => ({
      output: 'unused',
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      durationMs: 1,
    }));
    const planner = makePlannerProvider({
      title: 'بحث وتقرير',
      steps: [
        { specialist: 'عبدان', task: 'ابحث عن BIM' },
        { specialist: 'الدبسا', task: 'اكتب تقرير' },
      ],
    });
    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: planner,
      plannerModel: 'claude-sonnet-4-6',
    });
    const plan = await orch.planWorkflow({ userRequest: 'ابحث ثم اكتب' });
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].specialist).toBe('عبدان');
    const { run, steps } = await orch.createRunFromPlan({ plan });
    expect(run.status).toBe('pending');
    expect(steps).toHaveLength(2);
    expect(steps[0].task).toBe('ابحث عن BIM');
    expect(store.workflowRuns).toHaveLength(1);
    expect(store.workflowSteps).toHaveLength(2);
  });

  it('executes steps sequentially with handoff priorMessages', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    const step1: WorkflowStepRecord = {
      id: crypto.randomUUID(), runId, stepIndex: 0, specialist: 'عبدان',
      task: 'task-1', status: 'pending', createdAt: now, updatedAt: now,
    };
    const step2: WorkflowStepRecord = {
      id: crypto.randomUUID(), runId, stepIndex: 1, specialist: 'الدبسا',
      task: 'task-2', status: 'pending', createdAt: now, updatedAt: now,
    };
    store.workflowRuns = [{
      id: runId, title: 't', status: 'pending', currentStepIndex: 0,
      totalCostUsd: 0, createdAt: now, updatedAt: now,
    }];
    store.workflowSteps = [step1, step2];

    const seenPriors: Array<number> = [];
    const dispatch: SpecialistsDispatcher = vi.fn(async (p) => {
      seenPriors.push(p.priorMessages?.length ?? 0);
      return {
        output: `output-for-${p.specialist}`,
        usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
        durationMs: 1,
      };
    });

    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-6',
      // no queue → in-process setImmediate, but we call executeStep directly
      getQueue: () => null,
    });

    await orch.executeStep(step1.id);
    expect(seenPriors[0]).toBe(0);
    const updated1 = store.workflowSteps!.find((s) => s.id === step1.id)!;
    expect(updated1.status).toBe('completed');
    expect(updated1.output).toBe('output-for-عبدان');

    // Step 2 was enqueued via setImmediate; flush it by calling directly.
    await orch.executeStep(step2.id);
    expect(seenPriors[1]).toBe(1);
    const updated2 = store.workflowSteps!.find((s) => s.id === step2.id)!;
    expect(updated2.status).toBe('completed');

    const runFinal = store.workflowRuns!.find((r) => r.id === runId)!;
    expect(runFinal.status).toBe('completed');
  });

  it('marks step + run failed when dispatcher throws', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    const step: WorkflowStepRecord = {
      id: crypto.randomUUID(), runId, stepIndex: 0, specialist: 'عبدان',
      task: 't', status: 'pending', createdAt: now, updatedAt: now,
    };
    store.workflowRuns = [{
      id: runId, title: 't', status: 'running', currentStepIndex: 0,
      totalCostUsd: 0, createdAt: now, updatedAt: now,
    }];
    store.workflowSteps = [step];

    const dispatch: SpecialistsDispatcher = vi.fn(async () => { throw new Error('boom'); });
    const events: string[] = [];
    const ch = createChannel<import('./orchestrator.js').WorkflowEvent>();
    ch.subscribe((e) => events.push(e.type));

    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-6',
      sseBroadcast: ch,
    });

    await orch.executeStep(step.id);
    const updatedStep = store.workflowSteps!.find((s) => s.id === step.id)!;
    expect(updatedStep.status).toBe('failed');
    expect(updatedStep.error).toBe('boom');
    const run = store.workflowRuns!.find((r) => r.id === runId)!;
    expect(run.status).toBe('failed');
    expect(events).toContain('workflow-step-failed');
    expect(events).toContain('workflow-run-failed');
  });
});

describe('workflow orchestrator — conversation bridge (Wave C)', () => {
  it('posts progress + completion bubbles into the originating conversation', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const convId = 'conv-x';
    const now = new Date().toISOString();
    const s1: WorkflowStepRecord = {
      id: crypto.randomUUID(), runId, stepIndex: 0, specialist: 'عبدان',
      task: 'ابحث عن BIM', status: 'pending', createdAt: now, updatedAt: now,
    };
    const s2: WorkflowStepRecord = {
      id: crypto.randomUUID(), runId, stepIndex: 1, specialist: 'الدبسا',
      task: 'اكتب تقرير', status: 'pending', createdAt: now, updatedAt: now,
    };
    store.workflowRuns = [{
      id: runId, title: 'بحث وتقرير', status: 'running', currentStepIndex: 0,
      totalCostUsd: 0, createdAt: now, updatedAt: now,
      createdByConversationId: convId,
    }];
    store.workflowSteps = [s1, s2];

    const dispatch: SpecialistsDispatcher = vi.fn(async (p) => ({
      output: `output-for-${p.specialist}`,
      usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
      durationMs: 1,
    }));

    const poster = vi.fn(async () => {});
    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-6',
      conversationPoster: poster,
    });

    await orch.executeStep(s1.id);
    await orch.executeStep(s2.id);

    expect(poster).toHaveBeenCalledTimes(4);
    const calls = (poster.mock.calls as unknown as Array<Array<{ conversationId: string; kind: string; agentId: string; content: string; workflowStepId?: string }>>).map((c) => c[0]);

    // Call 1: step-1 started (progress).
    expect(calls[0]).toMatchObject({
      conversationId: convId, kind: 'progress', agentId: 'عبدان', workflowStepId: s1.id,
    });
    expect(calls[0].content.startsWith('بديت:')).toBe(true);

    // Call 2: step-1 completed (text).
    expect(calls[1]).toMatchObject({
      conversationId: convId, kind: 'text', agentId: 'عبدان', workflowStepId: s1.id,
      content: 'output-for-عبدان',
    });

    // Call 3: step-2 started.
    expect(calls[2]).toMatchObject({
      conversationId: convId, kind: 'progress', agentId: 'الدبسا', workflowStepId: s2.id,
    });
    // Call 4: step-2 completed.
    expect(calls[3]).toMatchObject({
      conversationId: convId, kind: 'text', agentId: 'الدبسا', workflowStepId: s2.id,
    });
  });

  it('posts a failure progress bubble when a step errors', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const convId = 'conv-y';
    const now = new Date().toISOString();
    const step: WorkflowStepRecord = {
      id: crypto.randomUUID(), runId, stepIndex: 0, specialist: 'عبدان',
      task: 't', status: 'pending', createdAt: now, updatedAt: now,
    };
    store.workflowRuns = [{
      id: runId, title: 't', status: 'running', currentStepIndex: 0,
      totalCostUsd: 0, createdAt: now, updatedAt: now,
      createdByConversationId: convId,
    }];
    store.workflowSteps = [step];

    const dispatch: SpecialistsDispatcher = vi.fn(async () => { throw new Error('boom'); });
    const poster = vi.fn(async () => {});
    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-6',
      conversationPoster: poster,
    });

    await orch.executeStep(step.id);
    expect(poster).toHaveBeenCalledTimes(2);
    const call2 = (poster.mock.calls as unknown as Array<[{ kind: string; content: string }]>)[1][0];
    expect(call2.kind).toBe('progress');
    expect(call2.content.startsWith('فشلت:')).toBe(true);
    expect(call2.content).toContain('boom');
  });

  it('never calls poster when run has no createdByConversationId', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    const step: WorkflowStepRecord = {
      id: crypto.randomUUID(), runId, stepIndex: 0, specialist: 'عبدان',
      task: 't', status: 'pending', createdAt: now, updatedAt: now,
    };
    store.workflowRuns = [{
      id: runId, title: 't', status: 'running', currentStepIndex: 0,
      totalCostUsd: 0, createdAt: now, updatedAt: now,
    }];
    store.workflowSteps = [step];

    const dispatch: SpecialistsDispatcher = vi.fn(async () => ({
      output: 'ok',
      usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
      durationMs: 1,
    }));
    const poster = vi.fn(async () => {});
    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-6',
      conversationPoster: poster,
    });
    await orch.executeStep(step.id);
    expect(poster).not.toHaveBeenCalled();
  });
});
