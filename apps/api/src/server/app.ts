import { Hono } from 'hono';
import { registerCors } from './cors.js';
import { registerBearerAuth } from './auth.js';
import { registerRequestLogger } from './logging.js';

/**
 * Create a fresh Hono app with CORS + request logging + bearer auth wired.
 * Used by `src/index.ts` for the runtime server and by tests.
 *
 * Route registration stays in `src/index.ts` today; extracted `registerXxxRoutes`
 * modules may be attached here in future stages (REL-01 stage 2+).
 */
export function createApp(): Hono {
  const app = new Hono();
  registerCors(app);
  registerRequestLogger(app);
  registerBearerAuth(app);
  return app;
}
