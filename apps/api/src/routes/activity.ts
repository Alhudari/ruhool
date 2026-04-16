import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ActivityRecord, StoreData } from '../store/types.js';
import { subscribeActivity } from '../state/activity-channel.js';

export interface ActivityRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

/**
 * Activity-log routes (REL-01 stage 2d).
 *
 * GET    /api/activity       list recent activity with optional filters
 * DELETE /api/activity       clear the activity log
 * GET    /api/activity/live  SSE stream of new activity
 */
export function registerActivityRoutes(app: Hono, deps: ActivityRoutesDeps): void {
  const { getStore, saveStore } = deps;

  app.get('/api/activity', (c) => {
    const store = getStore();
    if (!store.activityLog) store.activityLog = [];
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const type = c.req.query('type');
    const agent = c.req.query('agent');
    let records = [...store.activityLog];
    if (type) records = records.filter((r) => r.type === type);
    if (agent) records = records.filter((r) => r.agentId === agent || r.agentName?.includes(agent));
    records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return c.json(records.slice(0, limit));
  });

  app.delete('/api/activity', (c) => {
    const store = getStore();
    store.activityLog = [];
    saveStore();
    return c.json({ ok: true });
  });

  app.get('/api/activity/live', (c) => {
    return streamSSE(c, async (stream) => {
      const store = getStore();
      const recent = (store.activityLog || []).slice(-20);
      for (const record of recent) {
        await stream.writeSSE({ event: 'activity', data: JSON.stringify(record) });
      }

      const listener = async (record: ActivityRecord) => {
        try {
          await stream.writeSSE({ event: 'activity', data: JSON.stringify(record) });
        } catch { /* client disconnected */ }
      };
      const unsubscribe = subscribeActivity(listener);

      const heartbeat = setInterval(async () => {
        try {
          await stream.writeSSE({ event: 'heartbeat', data: JSON.stringify({ time: new Date().toISOString() }) });
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      stream.onAbort(() => {
        clearInterval(heartbeat);
        unsubscribe();
      });

      await new Promise(() => {});
    });
  });
}
