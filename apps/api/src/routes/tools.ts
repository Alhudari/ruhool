import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';

export interface ToolsRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

/**
 * Tools list + install/uninstall toggles.
 */
export function registerToolsRoutes(app: Hono, deps: ToolsRoutesDeps): void {
  const { getStore, saveStore } = deps;

  app.get('/api/tools', (c) => c.json(getStore().tools));

  app.post('/api/tools/:id/install', (c) => {
    const tool = getStore().tools.find((t) => t.id === c.req.param('id'));
    if (!tool) return c.json({ error: 'Not found' }, 404);
    tool.installed = true;
    saveStore();
    return c.json(tool);
  });

  app.post('/api/tools/:id/uninstall', (c) => {
    const tool = getStore().tools.find((t) => t.id === c.req.param('id'));
    if (!tool) return c.json({ error: 'Not found' }, 404);
    tool.installed = false;
    saveStore();
    return c.json(tool);
  });
}
