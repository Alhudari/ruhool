/**
 * Postgres-backed store primitives — load/save the entire StoreData JSONB
 * row from a single table called `app_state`.
 *
 * Drop-in for Neon (and Supabase, since both speak vanilla Postgres). The
 * connection lifecycle is per-call: each load/save opens a tiny connection,
 * runs one query, closes it. Vercel Functions are short-lived anyway, and
 * Neon's pooler handles the open/close cheaply.
 *
 * Wiring lives in `store/index.ts` — this file knows nothing about the
 * singleton or the encryption layer. Encryption happens at the index.ts
 * boundary in both modes (file + DB) so the on-disk and in-DB ciphertexts
 * are interchangeable.
 *
 * Usage:
 *   - `STORE_BACKEND=postgres` env activates DB mode. (NOT `STORAGE_PROVIDER`
 *     — that one already controls the file-storage adapter in
 *     packages/core/src/storage and would collide.)
 *   - `DATABASE_URL` env is required in DB mode (Neon's connection string).
 *   - The DB must already contain the `app_state` table with a row keyed
 *     `'main'`. See `db-schema.sql` for the one-time setup.
 */
import type { StoreData } from './types.js';
import { logger } from '../server/logging.js';

let _dbUrl: string | null = null;
let _poolerWarnedFor: string | null = null;

function getDbUrl(): string {
  if (!_dbUrl) {
    _dbUrl = process.env.DATABASE_URL || '';
    if (!_dbUrl) throw new Error('DATABASE_URL required when STORE_BACKEND=postgres');
    // M4: warn once if the URL points at Neon without the pooler endpoint.
    // Vercel Functions cold-start storms can exhaust direct-connection slots
    // (~100 on free tier); the pooler URL is mandatory at scale, even if
    // single-user usage works fine without it.
    if (_dbUrl.includes('neon.tech') && !_dbUrl.includes('-pooler') && _poolerWarnedFor !== _dbUrl) {
      _poolerWarnedFor = _dbUrl;
      logger.warn(
        '[store] DATABASE_URL points at Neon without the -pooler endpoint. Cold-start storms may exhaust connections. Switch to the pooler URL in your Neon dashboard.',
      );
    }
  }
  return _dbUrl;
}

/** Test-only: clear the cached URL so changing `process.env.DATABASE_URL`
 *  between tests actually takes effect. */
export function _resetDbUrlCacheForTests(): void {
  _dbUrl = null;
  _poolerWarnedFor = null;
}

/** Single-use connection per query. Vercel Functions are short-lived; the
 *  Neon pooler makes this near-free. Keeps the runtime simple — no client
 *  caching, no leaks. */
async function withClient<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { default: postgres } = await import('postgres');
  const sql_client = postgres(getDbUrl(), {
    ssl: getDbUrl().includes('neon.tech') || getDbUrl().includes('supabase.co') ? 'require' : false,
    max: 1,
    idle_timeout: 5,
  });
  try {
    return await fn(sql_client);
  } finally {
    await sql_client.end();
  }
}

/** Read the JSONB row at `app_state.id='main'`. Returns null if no row.
 *  Raw — caller is responsible for merging with defaults / running migrations. */
export async function loadStoreFromDb(): Promise<StoreData | null> {
  return withClient(async (sql) => {
    const rows = await sql<{ data: StoreData }[]>`SELECT data FROM app_state WHERE id = ${'main'}`;
    if (rows.length === 0) return null;
    return rows[0].data ?? null;
  });
}

/** Upsert the whole store as JSONB. The `sql.json()` helper signals to the
 *  driver that the value is a JSON object (single-encoded into JSONB on the
 *  wire); using a plain string here would cause double-encoding (every char
 *  becomes a property of an outer object). Idempotent — runs on every save. */
export async function saveStoreToDb(store: StoreData): Promise<void> {
  await withClient(async (sql) => {
    // sql.json() expects the lib's `JSONValue` shape — our StoreData fits at
    // runtime but uses `unknown` in a few places that the strict JSONValue
    // recursion rejects. Round-trip through JSON.parse(JSON.stringify(...))
    // strips any non-serializable junk and produces a plain JSON tree.
    const safe = JSON.parse(JSON.stringify(store)) as Parameters<typeof sql.json>[0];
    await sql`
      INSERT INTO app_state (id, data, updated_at)
      VALUES (${'main'}, ${sql.json(safe)}, now())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
    `;
  });
}

export function isPostgresMode(): boolean {
  return process.env.STORE_BACKEND === 'postgres';
}
