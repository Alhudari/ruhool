/**
 * Response cache for chat replies.
 *
 * Extracted from index.ts (REL-01 stage 2d).
 * Pure leaf module — no store or logger dependencies. Preserves original
 * behavior exactly: sha256 hash keying on `message|agentId`, 1 hour TTL,
 * and an opt-out keyword list that suppresses both reads and writes.
 */
import crypto from 'node:crypto';

export interface CacheEntry {
  response: string;
  agentId: string;
  timestamp: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const NO_CACHE_KEYWORDS = ['new', 'update', 'latest', 'جديد', 'حدث'];

const responseCache = new Map<string, CacheEntry>();

export function getCacheKey(message: string, agentId: string): string {
  return crypto.createHash('sha256').update(message + '|' + agentId).digest('hex');
}

export function getCachedResponse(message: string, agentId: string): CacheEntry | null {
  const lower = message.toLowerCase();
  if (NO_CACHE_KEYWORDS.some((kw) => lower.includes(kw))) return null;

  const key = getCacheKey(message, agentId);
  const entry = responseCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return entry;
}

export function setCacheEntry(message: string, agentId: string, response: string): void {
  const lower = message.toLowerCase();
  if (NO_CACHE_KEYWORDS.some((kw) => lower.includes(kw))) return;

  const key = getCacheKey(message, agentId);
  responseCache.set(key, { response, agentId, timestamp: Date.now() });
}

/** For tests only. */
export function _clearCache(): void {
  responseCache.clear();
}
