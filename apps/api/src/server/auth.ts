import type { Hono } from 'hono';
import { logger } from './logging.js';

/**
 * Bearer-token auth middleware (SEC-02 + F-002 fail-closed).
 *
 * Rules:
 * - /api/health is always open.
 * - In production (NODE_ENV=production or RUHOOL_ENV=production):
 *   if RUHOOL_API_TOKEN is missing, REFUSE all /api/* requests with 503.
 *   The only escape hatch is RUHOOL_ALLOW_UNAUTHENTICATED_DEV=true (explicit opt-in).
 * - Outside production: missing token logs a warning and allows all requests.
 */
export function registerBearerAuth(app: Hono): void {
  const RUHOOL_API_TOKEN = process.env.RUHOOL_API_TOKEN || '';
  const isProd = (process.env.NODE_ENV === 'production') || (process.env.RUHOOL_ENV === 'production');
  const devEscape = process.env.RUHOOL_ALLOW_UNAUTHENTICATED_DEV === 'true';

  if (!RUHOOL_API_TOKEN) {
    if (isProd && !devEscape) {
      logger.error('RUHOOL_API_TOKEN is NOT set in production — refusing all /api/* requests. Set RUHOOL_API_TOKEN or RUHOOL_ALLOW_UNAUTHENTICATED_DEV=true (NOT recommended).');
    } else {
      logger.warn('RUHOOL_API_TOKEN is NOT set — API is unauthenticated. OK for local dev only.');
    }
  }

  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/health') return next();

    // F-002: production fail-closed
    if (!RUHOOL_API_TOKEN) {
      if (isProd && !devEscape) {
        return c.json({ error: 'Server misconfigured: API token not set' }, 503);
      }
      return next(); // dev mode without token
    }

    const auth = c.req.header('authorization') || '';
    const expected = `Bearer ${RUHOOL_API_TOKEN}`;
    if (auth !== expected) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    return next();
  });
}
