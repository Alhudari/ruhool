/**
 * Cost rollup — workflow_runs.totalCostUsd aggregates step usage.costUsd.
 */
import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';

import { createWorkflowOrchestrator, type SpecialistsDispatcher } from './orchestrator.js';
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

describe('workflow cost rollup', () => {
  it('aggregates step usage.costUsd into run.totalCostUsd across 3 steps', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();

    store.workflowRuns = [{
      id: runId, title: 't', status: 'running', currentStepIndex: 0,
      totalCostUsd: 0, createdAt: now, updatedAt: now,
    }];

    const stepIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const steps: WorkflowStepRecord[] = stepIds.map((id, i) => ({
      id, runId, stepIndex: i, specialist: 'الباحث', task: `t${i}`,
      status: 'pending', timeoutMs: 5000, maxAttempts: 3, attemptCount: 0,
      createdAt: now, updatedAt: now,
    }));
    store.workflowSteps = steps;

    const costs = [0.05, 0.10, 0.03];
    let callIdx = 0;
    const dispatch: SpecialistsDispatcher = vi.fn(async () => {
      const costUsd = costs[callIdx++];
      return {
        output: 'ok',
        usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0, costUsd },
        durationMs: 1,
        model: 'claude-sonnet-4-5',
      };
    });

    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-5',
    });

    for (const id of stepIds) {
      await orch.executeStep(id);
    }

    const run = store.workflowRuns!.find((r) => r.id === runId)!;
    expect(run.totalCostUsd).toBeCloseTo(0.18, 5);

    // Each step has its per-step cost persisted.
    for (let i = 0; i < stepIds.length; i++) {
      const s = store.workflowSteps!.find((x) => x.id === stepIds[i])!;
      expect(s.status).toBe('completed');
      expect(s.usage?.costUsd).toBeCloseTo(costs[i], 5);
    }
  });

  it('rolls up partial usage on step failure', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    const stepId = crypto.randomUUID();

    store.workflowRuns = [{
      id: runId, title: 't', status: 'running', currentStepIndex: 0,
      totalCostUsd: 0, createdAt: now, updatedAt: now,
    }];
    store.workflowSteps = [{
      id: stepId, runId, stepIndex: 0, specialist: 'الباحث', task: 't',
      status: 'pending', timeoutMs: 5000, maxAttempts: 3, attemptCount: 0,
      createdAt: now, updatedAt: now,
    }];

    const dispatch: SpecialistsDispatcher = vi.fn(async () => {
      const err = new Error('boom') as Error & { partialUsage?: { costUsd: number } };
      err.partialUsage = { costUsd: 0.02 };
      throw err;
    });

    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-5',
    });

    await orch.executeStep(stepId);
    const run = store.workflowRuns!.find((r) => r.id === runId)!;
    expect(run.totalCostUsd).toBeCloseTo(0.02, 5);
  });
});
