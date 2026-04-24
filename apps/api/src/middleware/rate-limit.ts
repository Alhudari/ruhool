import type { MiddlewareHandler } from 'hono';

/**
 * In-memory token-bucket rate limiter. Per-IP by default; pass `keyFn` to
 * bucket by something else (user id, route, etc.).
 *
 * Not for multi-instance deployments — memory is per-process. For the
 * single-box Ruhool setup this is a sensible guard against an accidental
 * client loop hammering upstream (Scopus, Zotero).
 */
export interface RateLimitOpts {
  capacity: number;             // burst size
  refillPerSec: number;         // tokens added per second
  keyFn?: (ip: string, path: string) => string;
  onLimited?: (key: string) => void;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();

function take(key: string, opts: RateLimitOpts): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: opts.capacity, lastRefillMs: now };
  const elapsedSec = (now - b.lastRefillMs) / 1000;
  b.tokens = Math.min(opts.capacity, b.tokens + elapsedSec * opts.refillPerSec);
  b.lastRefillMs = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

function clientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headers.get('x-real-ip')
    || '127.0.0.1'
  );
}

export function rateLimit(opts: RateLimitOpts): MiddlewareHandler {
  return async (c, next) => {
    const ip = clientIp(c.req.raw.headers);
    const key = opts.keyFn ? opts.keyFn(ip, c.req.path) : `${ip}:${c.req.path}`;
    if (!take(key, opts)) {
      opts.onLimited?.(key);
      return c.json(
        {
          error: 'rate_limited',
          message: 'Too many requests — please wait a moment before retrying.',
          messageAr: 'طلبات كثيرة جداً — يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
        },
        429,
      );
    }
    await next();
  };
}
