import type { Hono } from 'hono';
import crypto from 'node:crypto';
import { CronExpressionParser } from 'cron-parser';
import type { StoreData, ActivityRecord, ScheduleRecord } from '../store/types.js';

export interface SchedulesRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  logActivity: (
    type: ActivityRecord['type'],
    action: string,
    details: string,
    opts?: { agentId?: string; metadata?: Record<string, unknown>; requestId?: string | null }
  ) => ActivityRecord;
  runSchedule: (schedule: ScheduleRecord) => Promise<void>;
}

export function computeNextRun(cronExpr: string): string | null {
  try {
    const interval = CronExpressionParser.parse(cronExpr);
    return interval.next().toISOString();
  } catch {
    return null;
  }
}

/**
 * Schedules CRUD + manual-run routes.
 */
export function registerSchedulesRoutes(app: Hono, deps: SchedulesRoutesDeps): void {
  const { getStore, saveStore, logActivity, runSchedule } = deps;

  app.get('/api/schedules', (c) => {
    const store = getStore();
    if (!store.schedules) store.schedules = [];
    const includeArchived = c.req.query('archived') === 'true';
    const list = store.schedules.filter((s) => includeArchived || !s.archived);
    return c.json(list);
  });

  app.put('/api/schedules/:id/archive', async (c) => {
    const store = getStore();
    if (!store.schedules) store.schedules = [];
    const schedule = store.schedules.find((s) => s.id === c.req.param('id'));
    if (!schedule) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json().catch(() => ({}));
    schedule.archived = body.archived !== false;
    if (schedule.archived) {
      schedule.enabled = false;
      schedule.nextRunAt = null;
    }
    saveStore();
    return c.json({ ok: true });
  });

  app.post('/api/schedules', async (c) => {
    const store = getStore();
    if (!store.schedules) store.schedules = [];
    const body = await c.req.json();
    const schedule: ScheduleRecord = {
      id: crypto.randomUUID(),
      name: body.name || { en: 'Unnamed', ar: 'بدون اسم' },
      agentId: body.agentId || 'manager',
      prompt: body.prompt || '',
      cron: body.cron || '0 9 * * *',
      enabled: body.enabled !== false,
      lastRunAt: null,
      nextRunAt: computeNextRun(body.cron || '0 9 * * *'),
      lastResult: null,
      createdAt: new Date().toISOString(),
    };
    store.schedules.push(schedule);
    saveStore();
    logActivity('system', 'Schedule created', `${schedule.name.en}: ${schedule.cron}`, { metadata: { scheduleId: schedule.id } });
    return c.json(schedule, 201);
  });

  app.put('/api/schedules/:id', async (c) => {
    const store = getStore();
    if (!store.schedules) store.schedules = [];
    const id = c.req.param('id');
    const schedule = store.schedules.find((s) => s.id === id);
    if (!schedule) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json();
    if (body.name) schedule.name = body.name;
    if (body.agentId) schedule.agentId = body.agentId;
    if (body.prompt !== undefined) schedule.prompt = body.prompt;
    if (body.cron) {
      schedule.cron = body.cron;
      schedule.nextRunAt = schedule.enabled ? computeNextRun(body.cron) : null;
    }
    if (body.enabled !== undefined) {
      schedule.enabled = body.enabled;
      schedule.nextRunAt = body.enabled ? computeNextRun(schedule.cron) : null;
    }
    saveStore();
    return c.json(schedule);
  });

  app.delete('/api/schedules/:id', (c) => {
    const store = getStore();
    if (!store.schedules) store.schedules = [];
    const id = c.req.param('id');
    const idx = store.schedules.findIndex((s) => s.id === id);
    if (idx < 0) return c.json({ error: 'Not found' }, 404);
    store.schedules.splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });

  app.post('/api/schedules/:id/run', async (c) => {
    const store = getStore();
    if (!store.schedules) store.schedules = [];
    const id = c.req.param('id');
    const schedule = store.schedules.find((s) => s.id === id);
    if (!schedule) return c.json({ error: 'Not found' }, 404);
    await runSchedule(schedule);
    return c.json(schedule);
  });
}
