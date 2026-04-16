/**
 * Audit-pass regression tests:
 *   - G3: usage.model is forwarded from the dispatcher to the persisted
 *     step record (instead of the legacy hardcoded 'unknown').
 *   - G5: artifacts returned by the dispatcher are persisted to the step.
 *   - G6: a step whose status is already `completed` is NOT re-dispatched
 *     when `executeStep` fires again (e.g. Temporal activity retry).
 */
import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';

import { createWorkflowOrchestrator } from './orchestrator.js';
import type { SpecialistsDispatcher } from './orchestrator.js';
import type { StoreData, WorkflowStepRecord } from '../../store/types.js';

function makeStore(): StoreData {
  return {
    providers: [], conversations: [], messages: [], usage: [],
    customAgents: [], memories: [], papers: [], notes: [],
    workflows: [], tools: [], approvals: [], activityLog: [],
    schedules: [], tasks: [], taskLists: [],
    workflowRuns: [], workflowSteps: [],
  } as unknown as StoreData;
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('workflow orchestrator — audit fixes', () => {
  it('G3: persists usage.model from DispatchResult.model', async () => {
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
      usage: { inputTokens: 5, outputTokens: 10, cachedTokens: 0 },
      durationMs: 1,
      model: 'claude-sonnet-4-5',
    }));
    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-5',
    });
    await orch.executeStep(step.id);
    const updated = store.workflowSteps!.find((s) => s.id === step.id)!;
    expect(updated.usage?.model).toBe('claude-sonnet-4-5');
  });

  it('G5: persists artifacts from DispatchResult.artifacts', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    const step: WorkflowStepRecord = {
      id: crypto.randomUUID(), runId, stepIndex: 0, specialist: 'المصمم',
      task: 'draw diagram', status: 'pending', createdAt: now, updatedAt: now,
    };
    store.workflowRuns = [{
      id: runId, title: 't', status: 'running', currentStepIndex: 0,
      totalCostUsd: 0, createdAt: now, updatedAt: now,
    }];
    store.workflowSteps = [step];

    const dispatch: SpecialistsDispatcher = vi.fn(async () => ({
      output: 'done',
      usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
      durationMs: 1,
      artifacts: [{ type: 'image' as const, url: '/api/images/x.png' }],
    }));
    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-5',
    });
    await orch.executeStep(step.id);
    const updated = store.workflowSteps!.find((s) => s.id === step.id)!;
    expect(updated.artifacts).toEqual([
      { type: 'image', url: '/api/images/x.png' },
    ]);
  });

  it('G6: executeStep on already-completed step is a no-op (no re-dispatch)', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    const step: WorkflowStepRecord = {
      id: crypto.randomUUID(), runId, stepIndex: 0, specialist: 'عبدان',
      task: 't', status: 'completed',
      output: 'preserved', completedAt: now,
      createdAt: now, updatedAt: now,
    };
    store.workflowRuns = [{
      id: runId, title: 't', status: 'running', currentStepIndex: 0,
      totalCostUsd: 0, createdAt: now, updatedAt: now,
    }];
    store.workflowSteps = [step];

    const dispatch: SpecialistsDispatcher = vi.fn(async () => ({
      output: 'SHOULD NOT BE CALLED',
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      durationMs: 0,
    }));
    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-5',
    });
    await orch.executeStep(step.id);
    expect(dispatch).not.toHaveBeenCalled();
    const still = store.workflowSteps!.find((s) => s.id === step.id)!;
    expect(still.output).toBe('preserved');
    expect(still.status).toBe('completed');
  });
});
