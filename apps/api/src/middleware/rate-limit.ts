import type { MiddlewareHandler } from 'hono';

/**
 * In-memory token-bucket rate limiter. Per-IP by default; pass `keyFn` to
 * bucket by something else (user id, route, etc.).
 *
 * Not for multi-instance deployments — memory is per-process. For the
 * single-box Ruhool setup this is a sensible guard against an accidental
 * client loop hammering upstream (Scopus, Zotero).
 *
 * F-016: bucket cap + TTL eviction + proxy-trust gate.
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
const MAX_BUCKETS = 10_000;
const BUCKET_TTL_MS = 60 * 60_000; // 1 hour

function evictStaleBuckets(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  // Remove buckets that haven't been refilled in TTL window
  for (const [key, b] of buckets) {
    if (now - b.lastRefillMs > BUCKET_TTL_MS) {
      buckets.delete(key);
    }
  }
  // If still over cap (heavy churn), drop oldest by lastRefillMs
  if (buckets.size >= MAX_BUCKETS) {
    const sorted = [...buckets.entries()].sort((a, b) => a[1].lastRefillMs - b[1].lastRefillMs);
    const toRemove = sorted.slice(0, Math.floor(MAX_BUCKETS * 0.1));
    for (const [key] of toRemove) buckets.delete(key);
  }
}

function take(key: string, opts: RateLimitOpts): boolean {
  const now = Date.now();
  evictStaleBuckets(now);
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

// F-016: only trust X-Forwarded-For if explicitly behind a known proxy
const TRUST_PROXY = process.env.RUHOOL_TRUST_PROXY === 'true';

function clientIp(headers: Headers, fallback?: string): string {
  if (TRUST_PROXY) {
    const xff = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (xff) return xff;
    const xri = headers.get('x-real-ip');
    if (xri) return xri;
  }
  // Default: use socket IP from fallback (Hono provides via c.env or remoteAddr)
  return fallback || '127.0.0.1';
}

export function rateLimit(opts: RateLimitOpts): MiddlewareHandler {
  return async (c, next) => {
    // Hono on Node: try to get socket IP via the underlying request
    type CtxWithRemoteIp = { env?: { incoming?: { socket?: { remoteAddress?: string } } } };
    const ctx = c as unknown as CtxWithRemoteIp;
    const remoteAddr = ctx.env?.incoming?.socket?.remoteAddress;
    const ip = clientIp(c.req.raw.headers, remoteAddr);
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

/** Test-only: clear all buckets. */
export function _resetRateLimitBuckets(): void {
  buckets.clear();
}
