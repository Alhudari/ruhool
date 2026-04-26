/**
 * Tiny in-memory response cache for read-heavy vault endpoints.
 *
 * Usage:
 *   const cached = await withCache('atomic-notes', 60_000, async () => {
 *     // expensive work
 *     return data;
 *   });
 *
 * Caches kept by key. Auto-evict after `ttlMs`.
 * Call `invalidateCache('prefix')` after writes that affect cached reads.
 */
interface CacheEntry { value: unknown; expiresAt: number; }

const cache = new Map<string, CacheEntry>();

export async function withCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && entry.expiresAt > now) {
    return entry.value as T;
  }
  const value = await fn();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/**
 * Invalidate cache entries by prefix.
 *   invalidateCache('vault.')  → kills all vault.* entries
 *   invalidateCache()          → clears everything
 */
export function invalidateCache(prefix?: string): number {
  let count = 0;
  if (!prefix) {
    count = cache.size;
    cache.clear();
    return count;
  }
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) {
      cache.delete(k);
      count++;
    }
  }
  return count;
}

export function cacheStats(): { size: number; keys: string[] } {
  return { size: cache.size, keys: Array.from(cache.keys()) };
}
