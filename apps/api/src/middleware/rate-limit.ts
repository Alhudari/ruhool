import type { MiddlewareHandler } from 'hono';

interface RateLimitOptions {
  capacity: number;
  refillPerSec: number;
}

/**
 * Token-bucket rate limiter middleware.
 * Single in-process bucket — resets on server restart.
 * Sufficient for Ruhool's local-first single-user model.
 */
export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  let tokens = opts.capacity;
  let lastRefill = Date.now();

  return async (c, next) => {
    const now = Date.now();
    const elapsed = (now - lastRefill) / 1000;
    tokens = Math.min(opts.capacity, tokens + elapsed * opts.refillPerSec);
    lastRefill = now;

    if (tokens < 1) {
      return c.json({ error: 'Too many requests — please wait a moment', code: 'RATE_LIMITED' }, 429);
    }

    tokens -= 1;
    await next();
  };
}
