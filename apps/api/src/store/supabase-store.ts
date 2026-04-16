/**
 * Supabase-backed store — drop-in replacement for the JSON file store.
 *
 * Stores the entire app state as a JSONB row in `app_state` table.
 * Same interface as the file-based store: getStore() / saveStore().
 *
 * Used when STORAGE_PROVIDER=supabase or when running on Vercel (no filesystem).
 */
import type { StoreData } from './types.js';

const DEFAULT_STORE: StoreData = {
  providers: [],
  conversations: [],
  messages: [],
  usage: [],
  customAgents: [],
  memories: [],
  papers: [],
  notes: [],
  workflows: [],
  tools: [],
  approvals: [],
  activityLog: [],
  schedules: [],
  tasks: [],
  taskLists: ['عام', 'الدكتوراه', 'جمعية المهندسين', 'المحتوى', 'المشاريع'],
  keepNotes: [],
};

let _store: StoreData | null = null;
let _dbUrl: string | null = null;

function getDbUrl(): string {
  if (!_dbUrl) {
    _dbUrl = process.env.DATABASE_URL || '';
    if (!_dbUrl) throw new Error('DATABASE_URL required for Supabase store');
  }
  return _dbUrl;
}

async function query(sql: string, params: unknown[] = []): Promise<unknown[]> {
  // Use the postgres client directly for simple queries
  const { default: postgres } = await import('postgres');
  const sql_client = postgres(getDbUrl(), {
    ssl: getDbUrl().includes('supabase.co') || getDbUrl().includes('neon.tech') ? 'require' : false,
    max: 1,
    idle_timeout: 5,
  });
  try {
    const result = await sql_client.unsafe(sql, params as any[]);
    return result as unknown[];
  } finally {
    await sql_client.end();
  }
}

export async function loadStoreFromDb(): Promise<StoreData> {
  try {
    const rows = await query('SELECT data FROM app_state WHERE id = $1', ['main']);
    if (rows.length > 0 && (rows[0] as { data: StoreData }).data) {
      const data = (rows[0] as { data: StoreData }).data;
      // Merge with defaults so new fields always exist
      return { ...DEFAULT_STORE, ...data };
    }
  } catch (err) {
    console.error('[supabase-store] Failed to load:', err);
  }
  return { ...DEFAULT_STORE };
}

export async function saveStoreToDb(store: StoreData): Promise<void> {
  try {
    await query(
      'UPDATE app_state SET data = $1::jsonb, updated_at = now() WHERE id = $2',
      [JSON.stringify(store), 'main']
    );
  } catch (err) {
    console.error('[supabase-store] Failed to save:', err);
    throw err;
  }
}

/**
 * Get the store singleton. First call loads from DB.
 * For serverless: call initStore() at handler start.
 */
export function getSupabaseStore(): StoreData | null {
  return _store;
}

export async function initStore(): Promise<StoreData> {
  if (!_store) {
    _store = await loadStoreFromDb();
  }
  return _store;
}

export async function saveSupabaseStore(): Promise<void> {
  if (_store) {
    await saveStoreToDb(_store);
  }
}

/** Reset singleton (for testing). */
export function resetStore(): void {
  _store = null;
}
