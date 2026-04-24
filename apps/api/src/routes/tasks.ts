import type { Hono } from 'hono';
import crypto from 'node:crypto';
import type { StoreData, TaskItem, ActivityRecord } from '../store/types.js';
import { spawnHabitsForToday, shouldSpawnForDate, todayIsoDate } from '../services/habit-spawner.js';
import { triggerGoogleTasksSync } from '../services/google-tasks-trigger.js';

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
    // Exclude soft-deleted by default
    const showTrash = c.req.query('trash') === 'true';
    if (!showTrash) tasks = tasks.filter(t => !(t as { deletedAt?: string }).deletedAt);
    const list = c.req.query('list');
    const completed = c.req.query('completed');
    const priority = c.req.query('priority');
    const tag = c.req.query('tag');
    const pinned = c.req.query('pinned');
    const quickNotes = c.req.query('quickNotes');
    if (list) tasks = tasks.filter(t => t.list === list);
    if (completed !== undefined) tasks = tasks.filter(t => t.completed === (completed === 'true'));
    if (priority) tasks = tasks.filter(t => t.priority === priority);
    if (tag) tasks = tasks.filter(t => t.tags.includes(tag));
    if (pinned !== undefined) tasks = tasks.filter(t => t.pinned === (pinned === 'true'));
    if (quickNotes === 'true') tasks = tasks.filter(t => (t as { isQuickNote?: boolean }).isQuickNote);
    tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    c.header('Cache-Control', 'private, max-age=30');
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
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      allDay: body.allDay ?? false,
      workspaceId: body.workspaceId,
      crossWorkspace: body.crossWorkspace ?? false,
      isToday: body.isToday ?? false,
      scheduledFor: body.scheduledFor ?? null,
      isHabit: body.isHabit ?? false,
      habitFrequency: body.habitFrequency,
      habitDays: body.habitDays,
      habitTemplateId: body.habitTemplateId,
      durationMinutes: body.durationMinutes,
      habitStartDate: body.habitStartDate ?? null,
      habitEndDate: body.habitEndDate ?? null,
      isQuickNote: body.isQuickNote ?? false,
      noteColor: body.noteColor ?? (body.isQuickNote ? '#fef08a' : undefined),
      categoryEn: body.categoryEn,
      categoryAr: body.categoryAr,
      meetingSourceId: body.meetingSourceId,
      meetingSourceNo: body.meetingSourceNo,
    };
    store.tasks.push(task);
    logActivity('task', `Task created: ${task.title}`, task.notes || '', { agentId: 'tasks-agent', metadata: { taskId: task.id } });
    saveStore();
    triggerGoogleTasksSync();
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
    triggerGoogleTasksSync();
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
    triggerGoogleTasksSync();
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
    triggerGoogleTasksSync();
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

  // R17 — per-workspace task lists. Query `?workspaceId=phd|life|...`
  // returns that workspace's categories. No query → legacy flat array
  // (kept for backward compat with older UI versions).
  app.get('/api/tasks/lists', (c) => {
    const store = getStore();
    const workspaceId = c.req.query('workspaceId');
    const byWs = (store as { taskListsByWorkspace?: Record<string, string[]> }).taskListsByWorkspace;
    if (workspaceId) {
      if (!byWs) return c.json([]);
      return c.json(byWs[workspaceId] ?? []);
    }
    if (!store.taskLists) store.taskLists = ['عام'];
    c.header('Cache-Control', 'private, max-age=300');
    return c.json(store.taskLists);
  });

  app.post('/api/tasks/lists', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ name: string; workspaceId?: string }>();
    if (!body.name) return c.json({ error: 'name required' }, 400);
    const wsId = body.workspaceId;
    if (wsId) {
      const s = store as unknown as { taskListsByWorkspace?: Record<string, string[]> };
      if (!s.taskListsByWorkspace) s.taskListsByWorkspace = {};
      if (!s.taskListsByWorkspace[wsId]) s.taskListsByWorkspace[wsId] = [];
      if (s.taskListsByWorkspace[wsId].includes(body.name)) return c.json({ error: 'List already exists' }, 409);
      s.taskListsByWorkspace[wsId].push(body.name);
      saveStore();
      return c.json({ ok: true, workspaceId: wsId, lists: s.taskListsByWorkspace[wsId] }, 201);
    }
    if (!store.taskLists) store.taskLists = [];
    if (store.taskLists.includes(body.name)) return c.json({ error: 'List already exists' }, 409);
    store.taskLists.push(body.name);
    saveStore();
    return c.json({ ok: true, lists: store.taskLists }, 201);
  });

  app.delete('/api/tasks/lists/:name', (c) => {
    const store = getStore();
    const name = decodeURIComponent(c.req.param('name'));
    const wsId = c.req.query('workspaceId');
    if (wsId) {
      const s = store as unknown as { taskListsByWorkspace?: Record<string, string[]> };
      const list = s.taskListsByWorkspace?.[wsId];
      if (!list) return c.json({ error: 'workspace has no lists' }, 404);
      const idx = list.indexOf(name);
      if (idx === -1) return c.json({ error: 'Not found' }, 404);
      list.splice(idx, 1);
      if (store.tasks) {
        for (const task of store.tasks) {
          if ((task as { workspaceId?: string }).workspaceId === wsId && task.list === name) task.list = 'عام';
        }
      }
      saveStore();
      return c.json({ ok: true, workspaceId: wsId, lists: list });
    }
    if (!store.taskLists) store.taskLists = [];
    const idx = store.taskLists.indexOf(name);
    if (idx === -1) return c.json({ error: 'Not found' }, 404);
    store.taskLists.splice(idx, 1);
    if (store.tasks) {
      for (const task of store.tasks) {
        if (task.list === name) task.list = 'عام';
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

  // ── Round 6 — Habits + Today + Progress ─────────────────────────
  // Spawn logic lives in services/habit-spawner.ts so the hourly
  // worker and this endpoint stay in lockstep.

  // GET /api/tasks/today — tasks due today + scheduled today + flagged
  // today across all workspaces. Habits themselves are not returned;
  // their dated instances are.
  app.get('/api/tasks/today', (c) => {
    const store = getStore();
    if (!store.tasks) store.tasks = [];
    const today = todayIsoDate();
    const rows = store.tasks.filter((t) => {
      if (t.isHabit) return false;
      if (t.completed && t.completedAt && t.completedAt.slice(0, 10) !== today) return false;
      if (t.isToday) return true;
      if (t.scheduledFor === today) return true;
      if (t.dueDate === today) return true;
      return false;
    });
    c.header('Cache-Control', 'private, max-age=30');
    return c.json(rows);
  });

  // POST /api/tasks/habits/spawn-due — idempotently spawns today's
  // instance of every habit that needs one. Called manually by the UI
  // or by the hourly scheduler tick.
  app.post('/api/tasks/habits/spawn-due', (c) => {
    const store = getStore();
    const created = spawnHabitsForToday(store);
    if (created.length > 0) saveStore();
    return c.json({ created: created.length, instances: created });
  });

  // GET /api/tasks/habits/:id/stats — progress figures for a habit.
  // Returns streak, completion rate, and a 30-day history grid.
  app.get('/api/tasks/habits/:id/stats', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const habit = (store.tasks ?? []).find((t) => t.id === id && t.isHabit);
    if (!habit) return c.json({ error: 'habit not found' }, 404);

    const instances = (store.tasks ?? []).filter((t) => t.habitTemplateId === id);
    const completedByDate = new Map<string, boolean>();
    for (const inst of instances) {
      const d = inst.scheduledFor ?? inst.completedAt?.slice(0, 10);
      if (d) completedByDate.set(d, inst.completed);
    }

    // 30-day history (oldest → newest).
    const history: Array<{ date: string; done: boolean; expected: boolean }> = [];
    const today = new Date();
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const iso = d.toISOString().slice(0, 10);
      const expected = shouldSpawnForDate(habit, iso);
      const done = completedByDate.get(iso) ?? false;
      history.push({ date: iso, done, expected });
    }

    // Current streak: walk back from today over EXPECTED days until a miss.
    let currentStreak = 0;
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const h = history[i];
      if (!h.expected) continue;
      if (h.done) currentStreak += 1;
      else break;
    }

    // Longest streak in the 30-day window.
    let longestStreak = 0;
    let run = 0;
    for (const h of history) {
      if (!h.expected) continue;
      if (h.done) { run += 1; longestStreak = Math.max(longestStreak, run); }
      else run = 0;
    }

    const expectedDays = history.filter((h) => h.expected).length;
    const completedDays = history.filter((h) => h.expected && h.done).length;
    const completionRate = expectedDays > 0 ? completedDays / expectedDays : 0;

    c.header('Cache-Control', 'private, max-age=300');
    return c.json({
      habitId: id,
      totalInstances: instances.length,
      completedDays,
      expectedDays,
      completionRate: Number(completionRate.toFixed(3)),
      currentStreak,
      longestStreak,
      history,
    });
  });
}
