import crypto from 'node:crypto';
import type { Hono } from 'hono';
import type { StoreData, AgentTaskRecord, AgentTaskStatus } from '../store/types.js';
import { parseNaturalTime } from '../services/natural-time.js';

export type AgentTasksDeps = {
  getStore: () => StoreData;
  saveStore: () => void;
};

export function registerAgentTasksRoutes(app: Hono, deps: AgentTasksDeps): void {
  const { getStore, saveStore } = deps;

  // GET /api/agent-tasks — list (filter: status, agentId, limit, offset)
  app.get('/api/agent-tasks', (c) => {
    const store = getStore();
    const tasks = store.agentTasks ?? [];
    const statusFilter = c.req.query('status');
    const agentIdFilter = c.req.query('agentId');
    const limit = parseInt(c.req.query('limit') ?? '50', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    const statusSet = statusFilter
      ? new Set(statusFilter.split(',') as AgentTaskStatus[])
      : null;

    const filtered = tasks
      .filter((t) => !t.deletedAt)
      .filter((t) => !statusSet || statusSet.has(t.status))
      .filter((t) => !agentIdFilter || t.agentId === agentIdFilter)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const page = filtered.slice(offset, offset + limit);

    c.header('Cache-Control', 'private, max-age=10');
    return c.json({ tasks: page, total: filtered.length });
  });

  // POST /api/agent-tasks — create
  app.post('/api/agent-tasks', async (c) => {
    const store = getStore();
    const body = await c.req.json<{
      agentId: string;
      prompt: string;
      scheduledFor?: string | null;
      scheduleText?: string;
      label?: string;
      reportOnComplete?: boolean;
      conversationId?: string;
    }>();

    if (!body.agentId || !body.prompt) {
      return c.json({ error: 'agentId and prompt are required' }, 400);
    }

    const scheduledFor = body.scheduleText
      ? parseNaturalTime(body.scheduleText)
      : (body.scheduledFor ?? null);

    const now = new Date().toISOString();
    const task: AgentTaskRecord = {
      id: crypto.randomUUID(),
      agentId: body.agentId,
      prompt: body.prompt,
      status: 'queued',
      scheduledFor,
      startedAt: null,
      completedAt: null,
      result: null,
      conversationId: body.conversationId ?? null,
      pipelineId: null,
      pipelineStepIndex: null,
      createdBy: 'user',
      label: body.label ?? null,
      reportOnComplete: body.reportOnComplete ?? false,
      createdAt: now,
      updatedAt: now,
    };

    if (!store.agentTasks) store.agentTasks = [];
    store.agentTasks.push(task);
    saveStore();

    return c.json({ task }, 201);
  });

  // GET /api/agent-tasks/:id — details
  app.get('/api/agent-tasks/:id', (c) => {
    const store = getStore();
    const task = (store.agentTasks ?? []).find(
      (t) => t.id === c.req.param('id') && !t.deletedAt
    );
    if (!task) return c.json({ error: 'Not found' }, 404);
    return c.json({ task });
  });

  // PATCH /api/agent-tasks/:id — update status, result, label
  app.patch('/api/agent-tasks/:id', async (c) => {
    const store = getStore();
    const task = (store.agentTasks ?? []).find(
      (t) => t.id === c.req.param('id') && !t.deletedAt
    );
    if (!task) return c.json({ error: 'Not found' }, 404);

    const body = await c.req.json<Partial<Pick<AgentTaskRecord, 'status' | 'result' | 'label'>>>();
    if (body.status !== undefined) task.status = body.status;
    if (body.result !== undefined) task.result = body.result;
    if (body.label !== undefined) task.label = body.label;
    task.updatedAt = new Date().toISOString();
    saveStore();

    return c.json({ task });
  });

  // DELETE /api/agent-tasks/:id — soft delete
  app.delete('/api/agent-tasks/:id', (c) => {
    const store = getStore();
    const permanent = c.req.query('permanent') === 'true';
    const idx = (store.agentTasks ?? []).findIndex(
      (t) => t.id === c.req.param('id')
    );
    if (idx === -1) return c.json({ error: 'Not found' }, 404);

    if (permanent) {
      store.agentTasks!.splice(idx, 1);
    } else {
      store.agentTasks![idx].deletedAt = new Date().toISOString();
      store.agentTasks![idx].updatedAt = new Date().toISOString();
    }
    saveStore();

    return c.json({ ok: true });
  });

  // POST /api/agent-tasks/:id/cancel
  app.post('/api/agent-tasks/:id/cancel', (c) => {
    const store = getStore();
    const task = (store.agentTasks ?? []).find(
      (t) => t.id === c.req.param('id') && !t.deletedAt
    );
    if (!task) return c.json({ error: 'Not found' }, 404);
    if (task.status !== 'queued' && task.status !== 'running') {
      return c.json({ error: `Cannot cancel task in status '${task.status}'` }, 409);
    }

    task.status = 'cancelled';
    task.updatedAt = new Date().toISOString();
    saveStore();

    return c.json({ task });
  });

  // POST /api/agent-tasks/:id/retry — failed → queued
  app.post('/api/agent-tasks/:id/retry', (c) => {
    const store = getStore();
    const task = (store.agentTasks ?? []).find(
      (t) => t.id === c.req.param('id') && !t.deletedAt
    );
    if (!task) return c.json({ error: 'Not found' }, 404);
    if (task.status !== 'failed') {
      return c.json({ error: `Only failed tasks can be retried (current: '${task.status}')` }, 409);
    }

    task.status = 'queued';
    task.startedAt = null;
    task.completedAt = null;
    task.result = null;
    task.updatedAt = new Date().toISOString();
    saveStore();

    return c.json({ task });
  });
}
