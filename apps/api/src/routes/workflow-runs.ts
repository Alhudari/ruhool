/**
 * Workflow runs routes — Phase 2.
 *
 * New namespace `/api/workflow-runs` — the legacy `/api/workflows` routes are
 * preserved verbatim elsewhere for zero-behavior on existing clients.
 */
import crypto from 'node:crypto';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import type { StoreData, WorkflowRunRecord, WorkflowStepRecord, WorkflowRunStatus } from '../store/types.js';
import type { WorkflowOrchestrator, WorkflowEvent, PlannedStep } from '../services/workflow/orchestrator.js';
import { createChannel, type Channel } from '../sse/broadcast.js';
import * as runsRepo from '../store/repositories/workflow-runs.repo.js';
import * as stepsRepo from '../store/repositories/workflow-steps.repo.js';

export interface WorkflowRunsRoutesDeps {
  getStore: () => StoreData;
  orchestrator: WorkflowOrchestrator;
  /** Channel registry (returns per-run channel, created on demand). */
  getRunChannel: (runId: string) => Channel<WorkflowEvent>;
}

/**
 * Factory for a channel registry so index.ts can share the same map across
 * orchestrator + routes.
 */
export function createRunChannelRegistry(): {
  getRunChannel: (runId: string) => Channel<WorkflowEvent>;
  channels: Map<string, Channel<WorkflowEvent>>;
} {
  const channels = new Map<string, Channel<WorkflowEvent>>();
  return {
    channels,
    getRunChannel(runId: string) {
      let ch = channels.get(runId);
      if (!ch) {
        ch = createChannel<WorkflowEvent>(`workflow-runs:${runId}`);
        channels.set(runId, ch);
      }
      return ch;
    },
  };
}

export function registerWorkflowRunsRoutes(app: Hono, deps: WorkflowRunsRoutesDeps): void {
  const { getStore, orchestrator, getRunChannel } = deps;

  // POST /api/workflow-runs — create run + steps (pending)
  app.post('/api/workflow-runs', async (c) => {
    const body = await c.req.json<{
      title?: string;
      steps?: Array<PlannedStep & { timeoutMs?: number; maxAttempts?: number }>;
      conversationId?: string;
    }>().catch(() => null);
    if (!body || !body.steps || !Array.isArray(body.steps) || body.steps.length === 0) {
      return c.json({ error: 'steps is required' }, 400);
    }
    const store = getStore();
    const now = new Date().toISOString();
    const run: WorkflowRunRecord = {
      id: crypto.randomUUID(),
      title: body.title || 'Workflow',
      createdByConversationId: body.conversationId ?? null,
      status: 'pending',
      currentStepIndex: 0,
      totalCostUsd: 0,
      createdAt: now,
      updatedAt: now,
    };
    await runsRepo.createRun(store, run);
    const steps: WorkflowStepRecord[] = [];
    for (let i = 0; i < body.steps.length; i++) {
      const ps = body.steps[i];
      if (!ps.specialist || !ps.task) continue;
      const step: WorkflowStepRecord = {
        id: crypto.randomUUID(),
        runId: run.id,
        stepIndex: i,
        specialist: ps.specialist,
        task: ps.task,
        expectedOutput: ps.expectedOutput ?? null,
        status: 'pending',
        timeoutMs: typeof ps.timeoutMs === 'number' ? ps.timeoutMs : 3_600_000,
        maxAttempts: typeof ps.maxAttempts === 'number' ? ps.maxAttempts : 3,
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      await stepsRepo.createStep(store, step);
      steps.push(step);
    }
    return c.json({ runId: run.id, run, steps }, 201);
  });

  // POST /api/workflow-runs/plan — plan via الراعي + tool_use
  app.post('/api/workflow-runs/plan', async (c) => {
    const body = await c.req.json<{ userRequest?: string; conversationId?: string; title?: string }>().catch(() => null);
    if (!body || !body.userRequest) return c.json({ error: 'userRequest is required' }, 400);
    try {
      const plan = await orchestrator.planWorkflow({
        userRequest: body.userRequest,
        conversationId: body.conversationId ?? null,
        title: body.title,
      });
      const { run, steps } = await orchestrator.createRunFromPlan({
        plan,
        conversationId: body.conversationId ?? null,
      });
      return c.json({ runId: run.id, run, steps }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'plan failed' }, 500);
    }
  });

  // POST /api/workflow-runs/:id/start
  // Phase 3: accept `?durable=true|false`. Default is durable when TEMPORAL_ADDRESS
  // is set, non-durable otherwise. Falls back gracefully in both cases.
  app.post('/api/workflow-runs/:id/start', async (c) => {
    try {
      const id = c.req.param('id');
      const durableQ = c.req.query('durable');
      const defaultDurable = !!process.env.TEMPORAL_ADDRESS;
      const durable =
        durableQ === 'true' ? true :
        durableQ === 'false' ? false :
        defaultDurable;
      if (durable && orchestrator.startRunDurable) {
        const handle = await orchestrator.startRunDurable(id);
        return c.json({ ok: true, handle });
      }
      await orchestrator.startRun(id);
      return c.json({ ok: true, handle: { mode: 'bullmq' } });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'start failed' }, 400);
    }
  });

  // POST /api/workflow-runs/:id/pause
  app.post('/api/workflow-runs/:id/pause', async (c) => {
    try {
      await orchestrator.pauseRun(c.req.param('id'));
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'pause failed' }, 400);
    }
  });

  // POST /api/workflow-runs/:id/resume — Phase 3
  app.post('/api/workflow-runs/:id/resume', async (c) => {
    try {
      if (!orchestrator.resumeRun) {
        return c.json({ error: 'resume not supported' }, 501);
      }
      await orchestrator.resumeRun(c.req.param('id'));
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'resume failed' }, 400);
    }
  });

  // POST /api/workflow-runs/:id/cancel
  app.post('/api/workflow-runs/:id/cancel', async (c) => {
    try {
      await orchestrator.cancelRun(c.req.param('id'));
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'cancel failed' }, 400);
    }
  });

  // GET /api/workflow-runs/:id/handle — Phase 3 execution mode metadata
  app.get('/api/workflow-runs/:id/handle', async (c) => {
    try {
      if (!orchestrator.getRunHandle) {
        return c.json({ mode: 'unknown' });
      }
      const handle = await orchestrator.getRunHandle(c.req.param('id'));
      return c.json(handle);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'handle failed' }, 400);
    }
  });

  // GET /api/workflow-runs — list
  app.get('/api/workflow-runs', async (c) => {
    const store = getStore();
    const status = c.req.query('status') as WorkflowRunStatus | undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;
    const runs = await runsRepo.listRuns(store, { status, limit });
    return c.json(runs);
  });

  // GET /api/workflow-runs/:id — full run with steps
  app.get('/api/workflow-runs/:id', async (c) => {
    const store = getStore();
    const run = await runsRepo.getRun(store, c.req.param('id'));
    if (!run) return c.json({ error: 'Not found' }, 404);
    const steps = await stepsRepo.listStepsForRun(store, run.id);
    return c.json({ ...run, steps });
  });

  // GET /api/workflow-runs/:id/events — SSE
  app.get('/api/workflow-runs/:id/events', (c) => {
    const id = c.req.param('id');
    return streamSSE(c, async (stream) => {
      // Fix G2: emit an initial `run.snapshot` so the UI has a baseline before
      // any live event arrives. Otherwise the dashboard would sit at
      // status='unknown' until the next orchestrator emit.
      try {
        const store = getStore();
        const run = await runsRepo.getRun(store, id);
        if (run) {
          const steps = await stepsRepo.listStepsForRun(store, id);
          await stream.writeSSE({
            event: 'run.snapshot',
            data: JSON.stringify({ run: { ...run, steps }, steps }),
          });
        }
      } catch {
        /* snapshot is best-effort */
      }

      const ch = getRunChannel(id);
      const listener = async (ev: WorkflowEvent) => {
        try {
          await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
        } catch {
          /* disconnected */
        }
      };
      const unsub = ch.subscribe(listener);
      const heartbeat = setInterval(async () => {
        try {
          await stream.writeSSE({ event: 'heartbeat', data: JSON.stringify({ t: Date.now() }) });
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      // Keep the stream open until client disconnect.
      await new Promise<void>((resolve) => {
        const onAbort = () => {
          clearInterval(heartbeat);
          unsub();
          resolve();
        };
        c.req.raw.signal.addEventListener('abort', onAbort, { once: true });
      });
    });
  });
}
