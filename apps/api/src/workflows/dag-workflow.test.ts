/**
 * Phase 3 tests for the Temporal DAG workflow.
 *
 * `@temporalio/testing` is not a dependency of this workspace, so these tests
 * exercise the `createWorkflowActivities` factory and the orchestrator's
 * durable fallback path directly. They do NOT run the Temporal workflow
 * function inside a test environment — that is left to integration runs.
 */
import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';

import { createWorkflowActivities } from './activities/workflow-activities.js';
import { createWorkflowOrchestrator, type SpecialistsDispatcher } from '../services/workflow/orchestrator.js';
import type { StoreData, WorkflowStepRecord } from '../store/types.js';

function makeStore(): StoreData {
  return {
    providers: [], conversations: [], messages: [], usage: [], customAgents: [],
    memories: [], papers: [], notes: [], workflows: [], tools: [],
    approvals: [], activityLog: [], schedules: [], tasks: [], taskLists: [],
    workflowRuns: [], workflowSteps: [],
  } as unknown as StoreData;
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('Phase 3 — dag-workflow activities', () => {
  it('executeWorkflowStep delegates to orchestrator and returns completed status', async () => {
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

    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-5',
    });

    const acts = createWorkflowActivities({
      getStore: () => store,
      orchestrator: orch,
      logger: makeLogger(),
    });

    const result = await acts.executeWorkflowStep({ runId, stepId: step.id });
    expect(result.status).toBe('completed');
    expect(result.output).toBe('ok');
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('markRunStatus updates run status and error', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    store.workflowRuns = [{
      id: runId, title: 't', status: 'running', currentStepIndex: 0,
      totalCostUsd: 0, createdAt: now, updatedAt: now,
    }];

    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: vi.fn() as unknown as SpecialistsDispatcher,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-5',
    });
    const acts = createWorkflowActivities({
      getStore: () => store,
      orchestrator: orch,
    });

    await acts.markRunStatus({ runId, status: 'failed', error: 'boom' });
    expect(store.workflowRuns![0].status).toBe('failed');
    expect(store.workflowRuns![0].error).toBe('boom');
    expect(store.workflowRuns![0].completedAt).toBeTruthy();
  });

  it('orchestrator.startRunDurable falls back to BullMQ/inproc when TEMPORAL_ADDRESS unset', async () => {
    const prev = process.env.TEMPORAL_ADDRESS;
    delete process.env.TEMPORAL_ADDRESS;
    try {
      const store = makeStore();
      const runId = crypto.randomUUID();
      const now = new Date().toISOString();
      store.workflowRuns = [{
        id: runId, title: 't', status: 'pending', currentStepIndex: 0,
        totalCostUsd: 0, createdAt: now, updatedAt: now,
      }];
      store.workflowSteps = [{
        id: crypto.randomUUID(), runId, stepIndex: 0, specialist: 'عبدان',
        task: 't', status: 'pending', createdAt: now, updatedAt: now,
      }];

      const dispatch: SpecialistsDispatcher = vi.fn(async () => ({
        output: 'ok',
        usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
        durationMs: 1,
      }));
      const orch = createWorkflowOrchestrator({
        getStore: () => store,
        logger: makeLogger(),
        specialistsDispatch: dispatch,
        plannerProvider: null,
        plannerModel: 'claude-sonnet-4-5',
        getQueue: () => null,
      });

      const handle = await orch.startRunDurable!(runId);
      expect(handle.mode === 'inproc' || handle.mode === 'bullmq').toBe(true);
      expect(store.workflowRuns![0].status).toBe('running');
    } finally {
      if (prev !== undefined) process.env.TEMPORAL_ADDRESS = prev;
    }
  });

  it('getRunHandle reports inproc when no temporal metadata', async () => {
    const prev = process.env.TEMPORAL_ADDRESS;
    delete process.env.TEMPORAL_ADDRESS;
    try {
      const store = makeStore();
      const runId = crypto.randomUUID();
      const now = new Date().toISOString();
      store.workflowRuns = [{
        id: runId, title: 't', status: 'running', currentStepIndex: 0,
        totalCostUsd: 0, createdAt: now, updatedAt: now,
      }];
      const orch = createWorkflowOrchestrator({
        getStore: () => store,
        logger: makeLogger(),
        specialistsDispatch: vi.fn() as unknown as SpecialistsDispatcher,
        plannerProvider: null,
        plannerModel: 'claude-sonnet-4-5',
        getQueue: () => null,
      });

      const handle = await orch.getRunHandle!(runId);
      expect(handle.mode).toBe('inproc');
      expect(handle.status).toBe('running');
    } finally {
      if (prev !== undefined) process.env.TEMPORAL_ADDRESS = prev;
    }
  });
});
