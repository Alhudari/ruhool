import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';
import type { Phase2StoreLike, WatcherAlert } from '../phase2.js';

export interface WatcherRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  scanForAlerts: (store: Phase2StoreLike) => WatcherAlert[];
  resolveAlert: (store: Phase2StoreLike, id: string, dismissed: boolean) => boolean;
}

/**
 * Watcher alert API routes (list/scan/resolve). Background watcher worker
 * stays inline in index.ts.
 */
export function registerWatcherRoutes(app: Hono, deps: WatcherRoutesDeps): void {
  const { getStore, saveStore, scanForAlerts, resolveAlert } = deps;

  app.get('/api/watcher/alerts', (c) => {
    const store = getStore();
    const showResolved = c.req.query('all') === 'true';
    const list = (store.watcherAlerts || []).filter((a) => showResolved || !a.resolvedAt);
    return c.json({ alerts: list.slice(-50).reverse() });
  });

  app.post('/api/watcher/scan', (c) => {
    const store = getStore();
    const created = scanForAlerts(store as unknown as Phase2StoreLike);
    saveStore();
    return c.json({ created: created.length, alerts: created });
  });

  app.post('/api/watcher/alerts/:id/resolve', (c) => {
    const store = getStore();
    const ok = resolveAlert(store as unknown as Phase2StoreLike, c.req.param('id'), false);
    if (!ok) return c.json({ error: 'not found' }, 404);
    saveStore();
    return c.json({ ok: true });
  });
}
