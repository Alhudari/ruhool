/**
 * Phase 5 — orchestrator residuals (G7, G8).
 *   - G7: per-step timeoutMs is honored (step fails with a timeout error).
 *   - G8: attemptCount increments on executeStep entry and is surfaced on
 *         the `workflow-step-started` event.
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

describe('orchestrator residuals — G7 + G8', () => {
  it('G7: per-step timeoutMs is honored', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    const step: WorkflowStepRecord = {
      id: crypto.randomUUID(), runId, stepIndex: 0, specialist: 'الباحث',
      task: 't', status: 'pending', timeoutMs: 50, maxAttempts: 3, attemptCount: 0,
      createdAt: now, updatedAt: now,
    };
    store.workflowRuns = [{ id: runId, title: 't', status: 'running', currentStepIndex: 0, totalCostUsd: 0, createdAt: now, updatedAt: now }];
    store.workflowSteps = [step];

    // Dispatcher that never resolves within the timeout window.
    const dispatch: SpecialistsDispatcher = vi.fn(
      () => new Promise<{ output: string; usage: { inputTokens: number; outputTokens: number; cachedTokens: number }; durationMs: number; model: string }>((resolve) => setTimeout(() => resolve({
        output: 'late',
        usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
        durationMs: 1000,
        model: 'claude-sonnet-4-5',
      }), 500)),
    );
    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-5',
    });
    await orch.executeStep(step.id);
    const updated = store.workflowSteps!.find((s) => s.id === step.id)!;
    expect(updated.status).toBe('failed');
    expect(updated.error).toMatch(/timeout/i);
  });

  it('G8: attemptCount increments on each executeStep entry', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    const step: WorkflowStepRecord = {
      id: crypto.randomUUID(), runId, stepIndex: 0, specialist: 'الباحث',
      task: 't', status: 'pending', timeoutMs: 5000, maxAttempts: 3, attemptCount: 0,
      createdAt: now, updatedAt: now,
    };
    store.workflowRuns = [{ id: runId, title: 't', status: 'running', currentStepIndex: 0, totalCostUsd: 0, createdAt: now, updatedAt: now }];
    store.workflowSteps = [step];

    // Fail on first attempt so we can reset + retry.
    let invocations = 0;
    const dispatch: SpecialistsDispatcher = vi.fn(async () => {
      invocations += 1;
      if (invocations === 1) throw new Error('boom');
      return { output: 'ok', usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 }, durationMs: 1, model: 'm' };
    });

    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-5',
    });

    await orch.executeStep(step.id);
    let updated = store.workflowSteps!.find((s) => s.id === step.id)!;
    expect(updated.attemptCount).toBe(1);
    expect(updated.status).toBe('failed');

    // Reset the step to pending so a retry can proceed (simulates Temporal retry).
    updated.status = 'pending';
    store.workflowRuns![0].status = 'running';

    await orch.executeStep(step.id);
    updated = store.workflowSteps!.find((s) => s.id === step.id)!;
    expect(updated.attemptCount).toBe(2);
    expect(updated.status).toBe('completed');
  });
});
