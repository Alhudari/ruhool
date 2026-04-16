/**
 * Shared lazy Drizzle client handle.
 *
 * `getRepoDb()` returns the Drizzle instance iff `DATABASE_URL` is set and the
 * postgres-js driver can connect. Otherwise returns `null` and callers fall back
 * to the JSON store.
 *
 * This is the single place the API depends on `@ruhool/db`. Keeping it isolated
 * makes it trivial to swap engines or mock in tests later.
 */
import type { Database } from '@ruhool/db';
import { logger } from '../../server/logging.js';

let cached: Database | null | undefined;

export function getRepoDb(): Database | null {
  if (cached !== undefined) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('[db] NODE_ENV=production but DATABASE_URL is unset — falling back to JSON store');
    }
    cached = null;
    return null;
  }
  try {
    // Dynamic require to avoid failing at import time when DB deps are absent.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getDb } = require('@ruhool/db') as typeof import('@ruhool/db');
    cached = getDb(url);
    return cached;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, '[db] failed to init Drizzle client — falling back to JSON store');
    cached = null;
    return null;
  }
}

export function hasDb(): boolean {
  return getRepoDb() !== null;
}
