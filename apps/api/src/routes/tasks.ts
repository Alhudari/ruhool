import type { Hono } from 'hono';
import crypto from 'node:crypto';
import type { StoreData, TaskItem, ActivityRecord } from '../store/types.js';

export interface TasksRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  logActivity: (
    type: ActivityRecord['type'],
    action: string,
    details: string,
    opts?: { agentId?: string; metadata?: Record<string, unknown>; requestId?: string | null }
  ) => ActivityRecord;
}

/**
 * User-tasks CRUD + task-lists + task-prefs routes (REL-01 stage 2d).
 *
 * NOTE: index.ts also registers GET /api/tasks + GET /api/tasks/:id for the
 * background research taskStore singleton. Those are separate from these
 * user-tasks routes. Registration order preserves Hono's first-match semantics.
 */
export function registerTasksRoutes(app: Hono, deps: TasksRoutesDeps): void {
  const { getStore, saveStore, logActivity } = deps;

  app.get('/api/tasks', (c) => {
    const store = getStore();
    if (!store.tasks) store.tasks = [];
    let tasks = [...store.tasks];
    const list = c.req.query('list');
    const completed = c.req.query('completed');
    const priority = c.req.query('priority');
    const tag = c.req.query('tag');
    const pinned = c.req.query('pinned');
    if (list) tasks = tasks.filter(t => t.list === list);
    if (completed !== undefined) tasks = tasks.filter(t => t.completed === (completed === 'true'));
    if (priority) tasks = tasks.filter(t => t.priority === priority);
    if (tag) tasks = tasks.filter(t => t.tags.includes(tag));
    if (pinned !== undefined) tasks = tasks.filter(t => t.pinned === (pinned === 'true'));
    tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return c.json(tasks);
  });

  app.post('/api/tasks', async (c) => {
    const store = getStore();
    if (!store.tasks) store.tasks = [];
    const body = await c.req.json<Partial<TaskItem>>();
    const now = new Date().toISOString();
    const task: TaskItem = {
      id: crypto.randomUUID(),
      title: body.title || '',
      notes: body.notes || '',
      completed: false,
      priority: body.priority || 'none',
      dueDate: body.dueDate || null,
      dueTime: body.dueTime || null,
      list: body.list || '\u0639\u0627\u0645',
      tags: body.tags || [],
      color: body.color || 'none',
      pinned: body.pinned || false,
      checklist: body.checklist || [],
      reminder: body.reminder || null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    store.tasks.push(task);
    logActivity('task', `Task created: ${task.title}`, task.notes || '', { agentId: 'tasks-agent', metadata: { taskId: task.id } });
    saveStore();
    return c.json(task, 201);
  });

  app.put('/api/tasks/:id', async (c) => {
    const store = getStore();
    if (!store.tasks) store.tasks = [];
    const id = c.req.param('id');
    const task = store.tasks.find(t => t.id === id);
    if (!task) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<Partial<TaskItem>>();
    Object.assign(task, body, { updatedAt: new Date().toISOString() });
    if (body.completed === true && !task.completedAt) task.completedAt = new Date().toISOString();
    if (body.completed === false) task.completedAt = null;
    saveStore();
    return c.json(task);
  });

  app.delete('/api/tasks/:id', (c) => {
    const store = getStore();
    if (!store.tasks) store.tasks = [];
    const id = c.req.param('id');
    const idx = store.tasks.findIndex(t => t.id === id);
    if (idx === -1) return c.json({ error: 'Not found' }, 404);
    const deleted = store.tasks.splice(idx, 1)[0];
    logActivity('task', `Task deleted: ${deleted.title}`, '', { agentId: 'tasks-agent', metadata: { taskId: deleted.id } });
    saveStore();
    return c.json({ ok: true });
  });

  app.put('/api/tasks/:id/toggle', (c) => {
    const store = getStore();
    if (!store.tasks) store.tasks = [];
    const id = c.req.param('id');
    const task = store.tasks.find(t => t.id === id);
    if (!task) return c.json({ error: 'Not found' }, 404);
    task.completed = !task.completed;
    task.updatedAt = new Date().toISOString();
    task.completedAt = task.completed ? new Date().toISOString() : null;
    saveStore();
    return c.json(task);
  });

  app.put('/api/tasks/:id/pin', (c) => {
    const store = getStore();
    if (!store.tasks) store.tasks = [];
    const id = c.req.param('id');
    const task = store.tasks.find(t => t.id === id);
    if (!task) return c.json({ error: 'Not found' }, 404);
    task.pinned = !task.pinned;
    task.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(task);
  });

  app.get('/api/tasks/lists', (c) => {
    const store = getStore();
    if (!store.taskLists) store.taskLists = ['\u0639\u0627\u0645', '\u0627\u0644\u062f\u0643\u062a\u0648\u0631\u0627\u0647', '\u062c\u0645\u0639\u064a\u0629 \u0627\u0644\u0645\u0647\u0646\u062f\u0633\u064a\u0646', '\u0627\u0644\u0645\u062d\u062a\u0648\u0649', '\u0627\u0644\u0645\u0634\u0627\u0631\u064a\u0639'];
    return c.json(store.taskLists);
  });

  app.post('/api/tasks/lists', async (c) => {
    const store = getStore();
    if (!store.taskLists) store.taskLists = [];
    const body = await c.req.json<{ name: string }>();
    if (!body.name) return c.json({ error: 'name required' }, 400);
    if (store.taskLists.includes(body.name)) return c.json({ error: 'List already exists' }, 409);
    store.taskLists.push(body.name);
    saveStore();
    return c.json({ ok: true, lists: store.taskLists }, 201);
  });

  app.delete('/api/tasks/lists/:name', (c) => {
    const store = getStore();
    if (!store.taskLists) store.taskLists = [];
    const name = decodeURIComponent(c.req.param('name'));
    const idx = store.taskLists.indexOf(name);
    if (idx === -1) return c.json({ error: 'Not found' }, 404);
    store.taskLists.splice(idx, 1);
    if (store.tasks) {
      for (const task of store.tasks) {
        if (task.list === name) task.list = '\u0639\u0627\u0645';
      }
    }
    saveStore();
    return c.json({ ok: true, lists: store.taskLists });
  });

  app.put('/api/tasks/reorder', async (c) => {
    const store = getStore();
    if (!store.tasks) store.tasks = [];
    const body = await c.req.json<{ orderedIds: string[]; list?: string }>();
    if (!body?.orderedIds) return c.json({ error: 'orderedIds required' }, 400);
    body.orderedIds.forEach((id, i) => {
      const t = store.tasks!.find(x => x.id === id);
      if (t) {
        t.order = i;
        if (body.list && t.list !== body.list) t.list = body.list;
        t.updatedAt = new Date().toISOString();
      }
    });
    saveStore();
    return c.json({ ok: true });
  });

  // Task prefs
  app.get('/api/task-prefs', (c) => {
    const store = getStore();
    return c.json(store.taskPrefs || {});
  });

  app.put('/api/task-prefs', async (c) => {
    const store = getStore();
    const body = await c.req.json<StoreData['taskPrefs']>();
    store.taskPrefs = { ...(store.taskPrefs || {}), ...(body || {}) };
    saveStore();
    return c.json(store.taskPrefs);
  });
}
