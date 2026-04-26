/**
 * Store singleton + persistence — extracted from the god-file (index.ts) as part
 * of REL-01 stage 2b.
 *
 * - `loadStore()` reads the JSON store file and decrypts provider API keys.
 * - `saveStore()` serializes the current singleton, encrypts provider keys, and
 *   writes the file through a promise-chain mutex (`withLock`) so concurrent
 *   writers cannot corrupt the file.
 * - `getStore()` returns the singleton instance (lazy-initialized on first call).
 *
 * The mutex is deliberately minimal — no extra dependency needed. It serializes
 * all disk writes through a single promise chain, which is sufficient for the
 * single-process Node server. If we ever move to a multi-process layout, swap
 * this for `proper-lockfile` without touching callers.
 */
import fs from 'node:fs';
import { STORE_FILE, ensureDataDir } from '../config/paths.js';
import { encryptSecret, decryptSecret } from './encryption.js';
import type { StoreData } from './types.js';
import { runMigrations } from './migrations/index.js';
import { isPostgresMode, loadStoreFromDb, saveStoreToDb } from './supabase-store.js';

// ─── Promise-chain mutex (inline, no new dep) ───
let queue: Promise<unknown> = Promise.resolve();

export function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const run = queue.then(() => fn());
  queue = run.catch(() => {
    /* swallow — don't poison the chain for the next caller */
  });
  return run;
}

// ─── Persistence ───
// R14-#12 — fields encrypted at rest in addition to providers[].apiKey.
// Encryption is transparent: in-memory store always holds plaintext,
// disk always holds ciphertext (prefixed with `enc:v1:`).
type ResendSecrets = { apiKey?: string };
type GoogleTasksSecrets = { clientSecret?: string; refreshToken?: string; accessToken?: string };
type NotificationSecrets = { smtpPass?: string; slackWebhookUrl?: string };

function decryptSensitive(data: StoreData): void {
  if (Array.isArray(data.providers)) {
    for (const p of data.providers) {
      if (p.apiKey) p.apiKey = decryptSecret(p.apiKey) ?? p.apiKey;
    }
  }
  const r = (data as { resend?: ResendSecrets }).resend;
  if (r?.apiKey) r.apiKey = decryptSecret(r.apiKey) ?? r.apiKey;
  const g = (data as { googleTasks?: GoogleTasksSecrets }).googleTasks;
  if (g) {
    if (g.clientSecret) g.clientSecret = decryptSecret(g.clientSecret) ?? g.clientSecret;
    if (g.refreshToken) g.refreshToken = decryptSecret(g.refreshToken) ?? g.refreshToken;
    if (g.accessToken) g.accessToken = decryptSecret(g.accessToken) ?? g.accessToken;
  }
  const keys = (data as { apiKeys?: Record<string, string> }).apiKeys;
  if (keys) {
    for (const k of Object.keys(keys)) {
      const v = keys[k];
      if (v) keys[k] = decryptSecret(v) ?? v;
    }
  }
  const n = (data as { notifications?: NotificationSecrets }).notifications;
  if (n) {
    if (n.smtpPass) n.smtpPass = decryptSecret(n.smtpPass) ?? n.smtpPass;
    if (n.slackWebhookUrl) n.slackWebhookUrl = decryptSecret(n.slackWebhookUrl) ?? n.slackWebhookUrl;
  }
}

function emptyStore(): StoreData {
  return {
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
    taskLists: ['\u0639\u0627\u0645', '\u0627\u0644\u062f\u0643\u062a\u0648\u0631\u0627\u0647', '\u062c\u0645\u0639\u064a\u0629 \u0627\u0644\u0645\u0647\u0646\u062f\u0633\u064a\u0646', '\u0627\u0644\u0645\u062d\u062a\u0648\u0649', '\u0627\u0644\u0645\u0634\u0627\u0631\u064a\u0639'],
    keepNotes: [],
  };
}

export class StoreLoadError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'StoreLoadError';
  }
}

/**
 * F-001: load store with fail-closed semantics.
 * - Missing file \u2192 empty store (first boot)
 * - Empty file \u2192 empty store (was created but never written)
 * - Corrupt JSON \u2192 quarantine the file + throw StoreLoadError
 * - Decrypt failure on a field is non-fatal (decryptSecret returns null/original)
 */
export function loadStore(): StoreData {
  if (!fs.existsSync(STORE_FILE)) return emptyStore();

  let raw: string;
  try {
    raw = fs.readFileSync(STORE_FILE, 'utf-8');
  } catch (err) {
    throw new StoreLoadError(`Failed to read store file: ${STORE_FILE}`, err);
  }

  // Empty file is treated as fresh boot
  if (raw.trim().length === 0) return emptyStore();

  let data: StoreData;
  try {
    data = JSON.parse(raw) as StoreData;
  } catch (err) {
    // Quarantine the corrupt file so a save doesn't overwrite it
    try {
      const quarantine = `${STORE_FILE}.corrupt.${Date.now()}`;
      fs.copyFileSync(STORE_FILE, quarantine);
      // eslint-disable-next-line no-console
      console.error(`[store] CORRUPT JSON detected. Quarantined to ${quarantine}`);
    } catch { /* best effort */ }
    throw new StoreLoadError(`Store file has invalid JSON: ${STORE_FILE}`, err);
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new StoreLoadError(`Store file is not a valid object: ${STORE_FILE}`);
  }

  decryptSensitive(data);
  return data;
}

// ─── Singleton ───
let _store: StoreData | null = null;
// Promise cache so concurrent calls to `initializeStore()` (top-level await
// + early route hit during cold start) share a single load. Without this,
// each caller fires its own DB SELECT and races to set `_store`, last
// writer wins, migrations may run twice. (MVA finding #3.)
let _initPromise: Promise<void> | null = null;

/**
 * Async pre-warm — required when STORE_BACKEND=postgres so the singleton
 * is loaded from the DB before any sync `getStore()` call. JSON-file mode
 * doesn't need this (sync load works), but calling it is safe — it just
 * pre-warms the file path too.
 *
 * Call ONCE at process startup, before importing modules that touch the
 * store at top level. In `apps/api/src/index.ts` this happens via top-level
 * `await initializeStore()` before `getStore()` is called.
 *
 * Idempotent: if already initialized OR in-flight, returns the same promise.
 */
export function initializeStore(): Promise<void> {
  if (_store) return Promise.resolve();
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    if (isPostgresMode()) {
      const fromDb = await loadStoreFromDb();
      // Merge with emptyStore so a fresh DB row (`{}`) still gets the required
      // arrays (`providers: []`, `tasks: []`, etc.) — the runtime expects them
      // to be defined. Same semantics as loadStore() in JSON mode, which always
      // starts from emptyStore() before applying any persisted overrides.
      _store = { ...emptyStore(), ...(fromDb ?? {}) };
      if (fromDb) decryptSensitive(_store);
    } else {
      _store = loadStore();
    }
    const migrated = runMigrations(_store);
    // M7: flush immediately when migrations applied — otherwise a crash
    // before the first save would re-run them on the next cold start.
    if (migrated.applied.length > 0) {
      try {
        await saveStore();
      } catch (err) {
        // Don't fail boot on a flush error — log and continue. The next
        // legitimate save will retry persisting the migrated shape.
        // eslint-disable-next-line no-console
        console.error('[store] Failed to flush migrations after init:', err);
      }
    }
  })();
  return _initPromise;
}

/** Test-only: clear init state so changing STORE_BACKEND/DATABASE_URL across
 *  tests works correctly. */
export function _resetInitForTests(): void {
  _store = null;
  _initPromise = null;
}

export function getStore(): StoreData {
  if (!_store) {
    if (isPostgresMode()) {
      // In postgres mode the singleton must be pre-warmed by initializeStore().
      // Reaching here means the boot order is wrong — fail loud, not silent
      // (silent would risk writing an empty DEFAULT_STORE over a real DB row).
      throw new Error('Store not initialized: call initializeStore() before getStore() in STORE_BACKEND=postgres mode');
    }
    _store = loadStore();
    const migrated = runMigrations(_store);
    if (migrated.applied.length > 0) {
      // Persist the schema bump + any filled defaults on next saveStore().
      // We don't call saveStore() directly to keep getStore() sync-safe;
      // the first write after boot will flush the migrated shape.
    }
  }
  return _store;
}

/** Build the encrypted-at-rest shape used for both file-write and DB-write.
 *  Pulled out so the two persistence backends share identical ciphertext. */
function buildSerializable(store: StoreData): StoreData {
  const r = (store as { resend?: ResendSecrets }).resend;
  const g = (store as { googleTasks?: GoogleTasksSecrets }).googleTasks;
  const keys = (store as { apiKeys?: Record<string, string> }).apiKeys;
  const n = (store as { notifications?: NotificationSecrets & Record<string, unknown> }).notifications;
  return {
    ...store,
    providers: (store.providers || []).map((p) => ({
      ...p,
      apiKey: p.apiKey ? encryptSecret(p.apiKey) : p.apiKey,
    })),
    ...(r ? { resend: { ...r, apiKey: r.apiKey ? encryptSecret(r.apiKey) : r.apiKey } } : {}),
    ...(g ? {
      googleTasks: {
        ...g,
        clientSecret: g.clientSecret ? encryptSecret(g.clientSecret) : g.clientSecret,
        refreshToken: g.refreshToken ? encryptSecret(g.refreshToken) : g.refreshToken,
        accessToken: g.accessToken ? encryptSecret(g.accessToken) : g.accessToken,
      },
    } : {}),
    ...(keys ? { apiKeys: Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v ? encryptSecret(v) : v])) } : {}),
    ...(n ? {
      notifications: {
        ...n,
        smtpPass: n.smtpPass ? encryptSecret(n.smtpPass) : n.smtpPass,
        slackWebhookUrl: n.slackWebhookUrl ? encryptSecret(n.slackWebhookUrl) : n.slackWebhookUrl,
      },
    } : {}),
  };
}

/**
 * Write the current singleton to the active backend (JSON file OR Postgres),
 * serialized through the same promise-chain mutex so concurrent writers can't
 * corrupt either backend.
 *
 * Returns a promise that resolves when the write completes. Callers that
 * don't await still get safe serialized writes (just no backpressure).
 */
export function saveStore(): Promise<void> {
  return withLock(async () => {
    const store = getStore();
    const serializable = buildSerializable(store);

    if (isPostgresMode()) {
      // Postgres backend — single UPSERT on the JSONB row. Encryption already
      // applied above, so on-disk and in-DB ciphertexts are identical.
      await saveStoreToDb(serializable);
      return;
    }

    // JSON file backend — atomic write (temp file + fsync + rename).
    ensureDataDir();
    const json = JSON.stringify(serializable, null, 2);
    const tmpFile = `${STORE_FILE}.tmp.${process.pid}`;
    let fd: number | null = null;
    try {
      fd = fs.openSync(tmpFile, 'w');
      fs.writeSync(fd, json, 0, 'utf-8');
      try { fs.fsyncSync(fd); } catch { /* best effort on platforms that may not support fsync */ }
      fs.closeSync(fd);
      fd = null;
      fs.renameSync(tmpFile, STORE_FILE);
    } catch (err) {
      if (fd !== null) { try { fs.closeSync(fd); } catch { /* ignore */ } }
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch { /* ignore */ }
      throw err;
    }
  });
}

/** Test-only: reset the singleton + init-promise + DB url cache (for unit
 *  tests that mutate STORE_FILE or toggle STORE_BACKEND between cases). */
export function _resetStoreForTests(): void {
  _store = null;
  _initPromise = null;
  // Re-import to avoid circular dep at module init; safe inside a function
  // body. Best-effort: if the supabase-store module is mocked the import
  // returns the mock, which is a no-op.
  void import('./supabase-store.js').then((m) => m._resetDbUrlCacheForTests?.());
}
