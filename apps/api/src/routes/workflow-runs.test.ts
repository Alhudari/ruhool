/**
 * Phase 2 routes test: /api/workflow-runs — plan, get, SSE events.
 *
 * Uses a full Hono app with a mocked orchestrator so we exercise the route
 * layer end-to-end without Redis / Anthropic / Postgres.
 */
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import crypto from 'node:crypto';

import {
  registerWorkflowRunsRoutes,
  createRunChannelRegistry,
} from './workflow-runs.js';
import type {
  WorkflowOrchestrator,
  PlannedWorkflow,
  WorkflowEvent,
} from '../services/workflow/orchestrator.js';
import type { StoreData, WorkflowRunRecord, WorkflowStepRecord } from '../store/types.js';

function makeStore(): StoreData {
  return {
    providers: [], conversations: [], messages: [], usage: [], customAgents: [],
    memories: [], papers: [], notes: [], workflows: [], tools: [],
    approvals: [], activityLog: [], schedules: [], tasks: [], taskLists: [],
    workflowRuns: [], workflowSteps: [],
  } as unknown as StoreData;
}

describe('workflow-runs routes', () => {
  it('POST /api/workflow-runs/plan creates a run (mocked orchestrator)', async () => {
    const store = makeStore();
    const now = new Date().toISOString();
    const run: WorkflowRunRecord = {
      id: crypto.randomUUID(), title: 'خطة', status: 'pending', currentStepIndex: 0,
      totalCostUsd: 0, createdAt: now, updatedAt: now,
    };
    const steps: WorkflowStepRecord[] = [{
      id: crypto.randomUUID(), runId: run.id, stepIndex: 0, specialist: 'الباحث',
      task: 'ابحث', status: 'pending', createdAt: now, updatedAt: now,
    }];
    const orchestrator: WorkflowOrchestrator = {
      planWorkflow: vi.fn(async () => ({ title: 'خطة', steps: [{ specialist: 'الباحث', task: 'ابحث' }] } as PlannedWorkflow)),
      createRunFromPlan: vi.fn(async () => ({ run, steps })),
      startRun: vi.fn(async () => {}),
      executeStep: vi.fn(async () => {}),
      pauseRun: vi.fn(async () => {}),
      cancelRun: vi.fn(async () => {}),
    };
    const registry = createRunChannelRegistry();
    const app = new Hono();
    registerWorkflowRunsRoutes(app, { getStore: () => store, orchestrator, getRunChannel: registry.getRunChannel });

    const res = await app.request('/api/workflow-runs/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userRequest: 'ابحث ثم اكتب' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { runId: string; steps: WorkflowStepRecord[] };
    expect(body.runId).toBe(run.id);
    expect(body.steps).toHaveLength(1);
    expect(orchestrator.planWorkflow).toHaveBeenCalledOnce();
  });

  it('GET /api/workflow-runs/:id returns run with steps', async () => {
    const store = makeStore();
    const now = new Date().toISOString();
    const runId = crypto.randomUUID();
    store.workflowRuns = [{
      id: runId, title: 't', status: 'pending', currentStepIndex: 0,
      totalCostUsd: 0, createdAt: now, updatedAt: now,
    }];
    store.workflowSteps = [{
      id: crypto.randomUUID(), runId, stepIndex: 0, specialist: 'الباحث',
      task: 'x', status: 'pending', createdAt: now, updatedAt: now,
    }];
    const orchestrator = {
      planWorkflow: vi.fn(), createRunFromPlan: vi.fn(), startRun: vi.fn(),
      executeStep: vi.fn(), pauseRun: vi.fn(), cancelRun: vi.fn(),
    } as unknown as WorkflowOrchestrator;
    const registry = createRunChannelRegistry();
    const app = new Hono();
    registerWorkflowRunsRoutes(app, { getStore: () => store, orchestrator, getRunChannel: registry.getRunChannel });

    const res = await app.request(`/api/workflow-runs/${runId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string; steps: unknown[] };
    expect(body.id).toBe(runId);
    expect(body.steps).toHaveLength(1);
  });

  it('SSE channel fires on step completion', async () => {
    const registry = createRunChannelRegistry();
    const runId = crypto.randomUUID();
    const ch = registry.getRunChannel(runId);
    const received: WorkflowEvent[] = [];
    ch.subscribe((e) => received.push(e));
    ch.publish({ type: 'workflow-step-completed', runId, stepId: 's1', stepIndex: 0, specialist: 'الباحث', output: 'done' });
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('workflow-step-completed');
  });

});
