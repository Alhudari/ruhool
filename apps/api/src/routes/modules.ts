import type { Hono } from 'hono';
import { moduleRegistry } from '../modules/loader.js';

/**
 * GET /api/modules — returns loaded module manifests (redacted: no entry path).
 */
export function registerModulesRoutes(app: Hono): void {
  app.get('/api/modules', (c) => {
    return c.json({
      modules: moduleRegistry.redactedManifests(),
      count: moduleRegistry.all().length,
    });
  });
}
