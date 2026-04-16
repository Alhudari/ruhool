import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';

export interface PrivacyRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

/**
 * Privacy mode settings.
 */
export function registerPrivacyRoutes(app: Hono, deps: PrivacyRoutesDeps): void {
  const { getStore, saveStore } = deps;

  app.get('/api/settings/privacy', (c) => {
    const store = getStore();
    return c.json({ privacyMode: store.privacyMode || 'balanced' });
  });

  app.put('/api/settings/privacy', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ privacyMode: string }>();
    const valid = ['strict', 'balanced', 'open'];
    if (!valid.includes(body.privacyMode)) return c.json({ error: 'Invalid privacy mode' }, 400);
    store.privacyMode = body.privacyMode as 'strict' | 'balanced' | 'open';
    saveStore();
    return c.json({ privacyMode: store.privacyMode });
  });
}
