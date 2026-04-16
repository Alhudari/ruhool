import type { Hono } from 'hono';
import type { NotificationRecord, StoreData, AgentNotificationSettings } from '../store/types.js';

export interface NotificationRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  createNotification: (input: {
    agentId: string;
    title: string;
    message: string;
    type?: NotificationRecord['type'];
    link?: string;
    linkLabel?: string;
    priority?: NotificationRecord['priority'];
    relatedId?: string;
    metadata?: Record<string, unknown>;
    bypassSettings?: boolean;
  }) => NotificationRecord | null;
  getAgentNotificationSettings: (agentId: string) => AgentNotificationSettings;
}

/**
 * Notification CRUD routes (REL-01 stage 2d).
 *
 * GET    /api/notifications
 * POST   /api/notifications
 * GET    /api/notifications/unread-count
 * PUT    /api/notifications/read-all
 * DELETE /api/notifications
 * PUT    /api/notifications/:id/read
 * DELETE /api/notifications/:id
 * GET    /api/agents/:agentId/notification-settings
 * PUT    /api/agents/:agentId/notification-settings
 */
export function registerNotificationRoutes(app: Hono, deps: NotificationRoutesDeps): void {
  const { getStore, saveStore, createNotification, getAgentNotificationSettings } = deps;

  app.get('/api/notifications', (c) => {
    const store = getStore();
    const records = store.notificationRecords || [];
    const unread = c.req.query('unread');
    const agentId = c.req.query('agentId');
    const limit = parseInt(c.req.query('limit') || '100', 10);
    let result = [...records].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (unread === 'true') result = result.filter(r => !r.read);
    if (agentId) result = result.filter(r => r.agentId === agentId);
    return c.json(result.slice(0, limit));
  });

  app.post('/api/notifications', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.agentId || !body.title || !body.message) {
      return c.json({ error: 'agentId, title, message required' }, 400);
    }
    const rec = createNotification({
      agentId: body.agentId,
      title: body.title,
      message: body.message,
      type: body.type,
      link: body.link,
      linkLabel: body.linkLabel,
      priority: body.priority,
      relatedId: body.relatedId,
      metadata: body.metadata,
      bypassSettings: body.bypassSettings === true,
    });
    if (!rec) return c.json({ ok: false, reason: 'Blocked by agent settings or quiet hours' });
    return c.json(rec);
  });

  app.get('/api/notifications/unread-count', (c) => {
    const store = getStore();
    const count = (store.notificationRecords || []).filter(r => !r.read).length;
    return c.json({ count });
  });

  app.put('/api/notifications/read-all', (c) => {
    const store = getStore();
    if (!store.notificationRecords) store.notificationRecords = [];
    const now = new Date().toISOString();
    for (const r of store.notificationRecords) {
      if (!r.read) { r.read = true; r.readAt = now; }
    }
    saveStore();
    return c.json({ ok: true });
  });

  app.delete('/api/notifications', (c) => {
    const store = getStore();
    store.notificationRecords = [];
    saveStore();
    return c.json({ ok: true });
  });

  app.put('/api/notifications/:id/read', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const rec = (store.notificationRecords || []).find(r => r.id === id);
    if (!rec) return c.json({ error: 'Not found' }, 404);
    rec.read = true;
    rec.readAt = new Date().toISOString();
    saveStore();
    return c.json(rec);
  });

  app.delete('/api/notifications/:id', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    if (!store.notificationRecords) store.notificationRecords = [];
    const idx = store.notificationRecords.findIndex(r => r.id === id);
    if (idx === -1) return c.json({ error: 'Not found' }, 404);
    store.notificationRecords.splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });

  app.get('/api/agents/:agentId/notification-settings', (c) => {
    const agentId = c.req.param('agentId');
    const settings = getAgentNotificationSettings(agentId);
    saveStore();
    return c.json(settings);
  });

  app.put('/api/agents/:agentId/notification-settings', async (c) => {
    const agentId = c.req.param('agentId');
    const body = await c.req.json().catch(() => ({}));
    const current = getAgentNotificationSettings(agentId);
    if (typeof body.enabled === 'boolean') current.enabled = body.enabled;
    if (typeof body.instructions === 'string') current.instructions = body.instructions;
    if (typeof body.schedule === 'string') current.schedule = body.schedule;
    if (body.triggers && typeof body.triggers === 'object') current.triggers = { ...current.triggers, ...body.triggers };
    if ('dailyDigestTime' in body) current.dailyDigestTime = body.dailyDigestTime || undefined;
    if ('quietHoursStart' in body) current.quietHoursStart = body.quietHoursStart || undefined;
    if ('quietHoursEnd' in body) current.quietHoursEnd = body.quietHoursEnd || undefined;
    saveStore();
    return c.json(current);
  });
}
