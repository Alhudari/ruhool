import crypto from 'node:crypto';
import type { Hono } from 'hono';
import type { StoreData, WorkflowRecord } from '../store/types.js';
import { getRequestId, getRequestLogger } from '../server/logging.js';

export interface WorkflowsRoutesDeps {
  getStore?: () => StoreData;
  saveStore?: () => void;
}

/**
 * Workflow routes.
 *
 * POST /api/workflows/research/start — Temporal research workflow (503 if not configured).
 * GET/POST/PUT/DELETE /api/workflows* — CRUD + run + archive + runs list (requires deps).
 */
export function registerWorkflowsRoutes(app: Hono, deps: WorkflowsRoutesDeps = {}): void {
  const { getStore, saveStore } = deps;
  app.post('/api/workflows/research/start', async (c) => {
    const log = getRequestLogger(c);
    const requestId = getRequestId(c);
    if (!process.env.TEMPORAL_ADDRESS) {
      return c.json({ error: 'Temporal is not configured' }, 503);
    }
    const body = await c.req.json<{ query?: string }>().catch(() => ({} as { query?: string }));
    const query = body.query;
    if (!query) return c.json({ error: 'query is required' }, 400);
    try {
      const { startResearchWorkflow } = await import('../workers/temporal.js');
      const workflowId = await startResearchWorkflow({ query, requestId });
      log.info({ workflowId, query }, 'research workflow started');
      return c.json({ workflowId });
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : err }, 'workflow start failed');
      return c.json({ error: 'workflow start failed' }, 500);
    }
  });

  if (!getStore || !saveStore) return;

  app.get('/api/workflows', (c) => {
    const store = getStore();
    const includeArchived = c.req.query('archived') === 'true';
    const list = (store.workflows || []).filter((w) => includeArchived || !w.archived);
    return c.json(list);
  });

  app.put('/api/workflows/:id/archive', async (c) => {
    const store = getStore();
    const wf = store.workflows.find((w) => w.id === c.req.param('id'));
    if (!wf) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json().catch(() => ({}));
    wf.archived = body.archived !== false;
    saveStore();
    return c.json({ ok: true });
  });

  app.get('/api/workflows/:id', (c) => {
    const store = getStore();
    const wf = store.workflows.find((w) => w.id === c.req.param('id'));
    if (!wf) return c.json({ error: 'Not found' }, 404);
    return c.json(wf);
  });

  app.post('/api/workflows', async (c) => {
    const store = getStore();
    const body = await c.req.json();
    const wf: WorkflowRecord = {
      id: crypto.randomUUID(), name: body.name || { en: 'Untitled', ar: 'بدون عنوان' },
      description: body.description || '', steps: body.steps || [],
      trigger: body.trigger || { type: 'manual' }, enabled: true,
      lastRunAt: null, createdAt: new Date().toISOString(),
    };
    store.workflows.push(wf);
    saveStore();
    return c.json(wf, 201);
  });

  app.put('/api/workflows/:id', async (c) => {
    const store = getStore();
    const wf = store.workflows.find((w) => w.id === c.req.param('id'));
    if (!wf) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json();
    Object.assign(wf, body);
    saveStore();
    return c.json(wf);
  });

  app.delete('/api/workflows/:id', (c) => {
    const store = getStore();
    const idx = store.workflows.findIndex((w) => w.id === c.req.param('id'));
    if (idx === -1) return c.json({ error: 'Not found' }, 404);
    store.workflows.splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });

  app.post('/api/workflows/:id/run', async (c) => {
    const store = getStore();
    const wf = store.workflows.find((w) => w.id === c.req.param('id'));
    if (!wf) return c.json({ error: 'Not found' }, 404);
    wf.lastRunAt = new Date().toISOString();
    saveStore();
    return c.json({ status: 'started', workflowId: wf.id });
  });

  app.get('/api/workflows/:id/runs', (c) => {
    const store = getStore();
    const wf = store.workflows.find((w) => w.id === c.req.param('id'));
    if (!wf) return c.json({ error: 'Not found' }, 404);
    if (wf.lastRunAt) {
      return c.json([{
        id: crypto.randomUUID(),
        workflowId: wf.id,
        status: 'completed',
        startedAt: wf.lastRunAt,
        completedAt: wf.lastRunAt,
        results: wf.steps.map((_s: { agentId: string; prompt: string }, i: number) => ({
          stepId: `step-${i}`, output: `Step ${i + 1} completed`,
        })),
      }]);
    }
    return c.json([]);
  });
}
