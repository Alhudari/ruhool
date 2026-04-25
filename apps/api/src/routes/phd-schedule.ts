/**
 * PhD working schedule — shared across all research agents.
 *
 *   GET  /api/phd-schedule          — returns the schedule (creates default if missing)
 *   PUT  /api/phd-schedule          — replace the schedule
 *   POST /api/phd-schedule/override — set a one-day override
 *   DELETE /api/phd-schedule/override — clear today's override
 */
import type { Hono } from 'hono';
import type { StoreData, PhDSchedule } from '../store/types.js';

interface Deps {
  getStore: () => StoreData;
  saveStore: () => void;
}

const DEFAULT_SCHEDULE: PhDSchedule = {
  workStart: '09:00',
  workEnd: '17:00',
  breakStart: '13:00',
  breakDurationMinutes: 60,
  timezone: 'Europe/London',
  workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  todayOverride: null,
  todayOverrideDate: null,
  updatedAt: new Date().toISOString(),
};

export function getOrCreateSchedule(store: StoreData): PhDSchedule {
  if (!store.phdSchedule) {
    store.phdSchedule = { ...DEFAULT_SCHEDULE };
  }
  // Auto-clear stale override (more than 1 day old)
  const today = new Date().toISOString().slice(0, 10);
  if (store.phdSchedule.todayOverride && store.phdSchedule.todayOverrideDate !== today) {
    store.phdSchedule.todayOverride = null;
    store.phdSchedule.todayOverrideDate = null;
  }
  return store.phdSchedule;
}

// Build a markdown context block to inject into agent prompts
export function buildScheduleContext(schedule: PhDSchedule): string {
  const days: Record<string, string> = {
    mon: 'الإثنين', tue: 'الثلاثاء', wed: 'الأربعاء', thu: 'الخميس',
    fri: 'الجمعة', sat: 'السبت', sun: 'الأحد',
  };
  const workingDaysAr = schedule.workingDays.map((d) => days[d] ?? d).join('، ');

  let ctx = `\n\n## جدول عمل الدكتوراه (محدث: ${schedule.updatedAt.slice(0, 10)})\n\n`;
  ctx += `- **ساعات العمل**: ${schedule.workStart} – ${schedule.workEnd} (${schedule.timezone})\n`;
  ctx += `- **استراحة**: ${schedule.breakStart} لمدة ${schedule.breakDurationMinutes} دقيقة\n`;
  ctx += `- **أيام العمل**: ${workingDaysAr}\n`;

  if (schedule.todayOverride) {
    ctx += `\n⚠️ **تعديل لليوم (${schedule.todayOverrideDate})**: ${schedule.todayOverride}\n`;
  }

  ctx += `\nاستخدم هذا الجدول لاقتراح أوقات اجتماعات وتذكيرات مناسبة.\n`;
  return ctx;
}

// Parse [PHD_SCHEDULE] action tags from manager responses.
// Format: [PHD_SCHEDULE]{json}[/PHD_SCHEDULE]
//   { workStart?, workEnd?, breakStart?, breakDurationMinutes?, timezone?, workingDays?, todayOverride? }
export function parsePhdScheduleActions(text: string): Partial<PhDSchedule>[] {
  const out: Partial<PhDSchedule>[] = [];
  const regex = /\[PHD_SCHEDULE\]\s*(\{[\s\S]*?\})\s*\[\/PHD_SCHEDULE\]/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      out.push(data);
    } catch { /* skip bad json */ }
  }
  return out;
}

export function applyScheduleUpdate(store: StoreData, update: Partial<PhDSchedule>): PhDSchedule {
  const current = getOrCreateSchedule(store);
  const today = new Date().toISOString().slice(0, 10);
  const next: PhDSchedule = {
    ...current,
    ...update,
    updatedAt: new Date().toISOString(),
  };
  // If override was set, stamp today's date
  if (update.todayOverride !== undefined) {
    next.todayOverrideDate = update.todayOverride ? today : null;
  }
  store.phdSchedule = next;
  return next;
}

export function registerPhdScheduleRoutes(app: Hono, { getStore, saveStore }: Deps): void {
  app.get('/api/phd-schedule', (c) => {
    const s = getOrCreateSchedule(getStore());
    return c.json(s);
  });

  app.put('/api/phd-schedule', async (c) => {
    const body = await c.req.json<Partial<PhDSchedule>>();
    const next = applyScheduleUpdate(getStore(), body);
    saveStore();
    return c.json(next);
  });

  app.post('/api/phd-schedule/override', async (c) => {
    const body = await c.req.json<{ override: string }>();
    if (!body.override) return c.json({ error: 'override required' }, 400);
    const next = applyScheduleUpdate(getStore(), { todayOverride: body.override });
    saveStore();
    return c.json(next);
  });

  app.delete('/api/phd-schedule/override', (c) => {
    const next = applyScheduleUpdate(getStore(), { todayOverride: null });
    saveStore();
    return c.json(next);
  });
}
