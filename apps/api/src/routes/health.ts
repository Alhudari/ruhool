import type { Hono } from 'hono';

export interface HealthDeps {
  serviceHealth: Record<string, unknown>;
}

/**
 * GET /api/health — always open (no auth).
 */
export function registerHealthRoutes(app: Hono, deps: HealthDeps): void {
  app.get('/api/health', (c) =>
    c.json({
      status: 'ok',
      name: 'Ruhool',
      version: '0.2.0',
      services: deps.serviceHealth,
    })
  );
}
