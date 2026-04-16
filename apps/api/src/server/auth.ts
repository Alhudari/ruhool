import type { Hono } from 'hono';
import { logger } from './logging.js';

/**
 * Bearer-token auth middleware (SEC-02).
 * If RUHOOL_API_TOKEN is unset, runs in dev mode (no auth).
 * /api/health is always open.
 */
export function registerBearerAuth(app: Hono): void {
  const RUHOOL_API_TOKEN = process.env.RUHOOL_API_TOKEN || '';
  if (!RUHOOL_API_TOKEN) {
    logger.warn('RUHOOL_API_TOKEN is NOT set — API is unauthenticated. OK for local dev only; set RUHOOL_API_TOKEN in .env for prod.');
  }
  app.use('/api/*', async (c, next) => {
    if (!RUHOOL_API_TOKEN) return next();
    if (c.req.path === '/api/health') return next();
    const auth = c.req.header('authorization') || '';
    const expected = `Bearer ${RUHOOL_API_TOKEN}`;
    if (auth !== expected) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    return next();
  });
}
