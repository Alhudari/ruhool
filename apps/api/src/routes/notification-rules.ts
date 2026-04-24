/**
 * Phase 6 — Notification Rules system.
 *
 * GET    /api/notifications/rules          — list all rules
 * POST   /api/notifications/rules          — create rule
 * PATCH  /api/notifications/rules/:id      — update rule
 * DELETE /api/notifications/rules/:id      — delete rule
 * POST   /api/notifications/rules/:id/snooze — snooze rule
 * POST   /api/notifications/rules/seed     — seed built-in rules (idempotent)
 */
import crypto from 'node:crypto';
import type { Hono } from 'hono';
import type { StoreData, NotificationRule } from '../store/types.js';

export interface NotificationRulesRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

const BUILT_IN_RULES: Omit<NotificationRule, 'id' | 'createdAt'>[] = [
  {
    titleEn: 'GRS2 Monthly Reminder',
    titleAr: 'تذكير GRS2 الشهري',
    trigger: { type: 'cron', cronExpression: '0 8 24 * *' },
    condition: { type: 'grs2-not-submitted' },
    messageTemplate: {
      en: 'GRS2 report for this month has not been submitted yet. 7 days left.',
      ar: 'لم يُقدَّم تقرير GRS2 لهذا الشهر بعد. 7 أيام متبقية.',
    },
    linkTo: '/phd?tab=grs2',
    agentId: 'manager',
    enabled: true,
    isBuiltIn: true,
  },
  {
    titleEn: 'Meeting Reminder — 24h',
    titleAr: 'تذكير الاجتماع — 24 ساعة',
    trigger: { type: 'time-before', offsetHours: 24 },
    condition: { type: 'meeting-upcoming' },
    messageTemplate: {
      en: 'Your next supervision meeting is tomorrow. Prepare your notes.',
      ar: 'اجتماعك القادم غداً. جهّز ملاحظاتك.',
    },
    linkTo: '/meetings',
    agentId: 'manager',
    enabled: true,
    isBuiltIn: true,
  },
  {
    titleEn: 'Meeting Reminder — 1h',
    titleAr: 'تذكير الاجتماع — ساعة',
    trigger: { type: 'time-before', offsetHours: 1 },
    condition: { type: 'meeting-upcoming' },
    messageTemplate: {
      en: 'Your supervision meeting starts in 1 hour.',
      ar: 'اجتماعك القادم بعد ساعة واحدة.',
    },
    linkTo: '/meetings',
    agentId: 'manager',
    enabled: true,
    isBuiltIn: true,
  },
  {
    titleEn: 'Morning Task Summary',
    titleAr: 'ملخص المهام الصباحي',
    trigger: { type: 'daily-morning', timeOfDay: '08:00' },
    messageTemplate: {
      en: 'Good morning! Review your pending tasks for today.',
      ar: 'صباح الخير! راجع مهامك المعلّقة لهذا اليوم.',
    },
    linkTo: '/tasks',
    agentId: 'tasks-agent',
    enabled: true,
    isBuiltIn: true,
  },
  {
    titleEn: 'Evening Preview',
    titleAr: 'معاينة المساء',
    trigger: { type: 'daily-evening', timeOfDay: '21:00' },
    messageTemplate: {
      en: 'Review tomorrow\'s meetings and tasks before you rest.',
      ar: 'راجع اجتماعات ومهام الغد قبل النوم.',
    },
    linkTo: '/phd',
    agentId: 'tasks-agent',
    enabled: true,
    isBuiltIn: true,
  },
  {
    titleEn: 'Task Due Reminder — 24h',
    titleAr: 'تذكير استحقاق المهمة — 24 ساعة',
    trigger: { type: 'time-before', offsetHours: 24 },
    condition: { type: 'task-overdue' },
    messageTemplate: {
      en: 'A task is due tomorrow. Don\'t miss it.',
      ar: 'مهمة مستحقة غداً. لا تفوّتها.',
    },
    linkTo: '/tasks',
    agentId: 'tasks-agent',
    enabled: true,
    isBuiltIn: true,
  },
];

function getRules(store: StoreData): NotificationRule[] {
  if (!store.notificationRules) store.notificationRules = [];
  return store.notificationRules;
}

export function seedBuiltInRules(store: StoreData): boolean {
  const rules = getRules(store);
  const existingBuiltIn = new Set(rules.filter(r => r.isBuiltIn).map(r => r.titleEn));
  let changed = false;
  const now = new Date().toISOString();
  for (const def of BUILT_IN_RULES) {
    if (!existingBuiltIn.has(def.titleEn)) {
      rules.push({ ...def, id: crypto.randomUUID(), createdAt: now });
      changed = true;
    }
  }
  return changed;
}

export function registerNotificationRulesRoutes(app: Hono, deps: NotificationRulesRoutesDeps): void {
  const { getStore, saveStore } = deps;

  app.get('/api/notifications/rules', (c) => {
    const store = getStore();
    const rules = getRules(store).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    c.header('Cache-Control', 'private, max-age=300');
    return c.json(rules);
  });

  app.post('/api/notifications/rules', async (c) => {
    const store = getStore();
    const body = await c.req.json<Partial<NotificationRule>>();
    const now = new Date().toISOString();
    const rule: NotificationRule = {
      id: crypto.randomUUID(),
      titleEn: body.titleEn ?? 'Untitled Rule',
      titleAr: body.titleAr ?? 'قاعدة بلا اسم',
      trigger: body.trigger ?? { type: 'daily-morning', timeOfDay: '08:00' },
      condition: body.condition,
      messageTemplate: body.messageTemplate ?? { en: '', ar: '' },
      linkTo: body.linkTo,
      agentId: body.agentId,
      enabled: body.enabled ?? true,
      isBuiltIn: false,
      snoozedUntil: body.snoozedUntil,
      createdAt: now,
    };
    getRules(store).push(rule);
    saveStore();
    return c.json(rule, 201);
  });

  app.patch('/api/notifications/rules/:id', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const rule = getRules(store).find(r => r.id === id);
    if (!rule) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<Partial<NotificationRule>>();
    const { id: _id, createdAt: _c, isBuiltIn: _b, ...editable } = body;
    Object.assign(rule, editable);
    saveStore();
    return c.json(rule);
  });

  app.delete('/api/notifications/rules/:id', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const rules = getRules(store);
    const idx = rules.findIndex(r => r.id === id);
    if (idx === -1) return c.json({ error: 'Not found' }, 404);
    if (rules[idx].isBuiltIn) {
      rules[idx].enabled = false;
      saveStore();
      return c.json({ ok: true, disabled: true });
    }
    rules.splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });

  app.post('/api/notifications/rules/:id/snooze', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const rule = getRules(store).find(r => r.id === id);
    if (!rule) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<{ until?: string; hours?: number }>().catch(() => ({ until: undefined, hours: undefined }));
    if (body?.until) {
      rule.snoozedUntil = body.until;
    } else {
      const h = body?.hours ?? 24;
      rule.snoozedUntil = new Date(Date.now() + h * 3600000).toISOString();
    }
    saveStore();
    return c.json(rule);
  });

  app.post('/api/notifications/rules/seed', (c) => {
    const store = getStore();
    const changed = seedBuiltInRules(store);
    if (changed) saveStore();
    return c.json({ ok: true, seeded: changed, count: getRules(store).length });
  });
}
