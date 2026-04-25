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

export function getStore(): StoreData {
  if (!_store) {
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

/**
 * Write the current singleton to disk, serialized through the fs-level mutex
 * to prevent concurrent-write corruption.
 *
 * Returns a promise that resolves when the write completes. For historical
 * compatibility with the god-file's fire-and-forget call sites, callers that
 * don't await still get safe serialized writes (just no backpressure).
 */
export function saveStore(): Promise<void> {
  return withLock(() => {
    const store = getStore();
    ensureDataDir();
    const r = (store as { resend?: ResendSecrets }).resend;
    const g = (store as { googleTasks?: GoogleTasksSecrets }).googleTasks;
    const keys = (store as { apiKeys?: Record<string, string> }).apiKeys;
    const n = (store as { notifications?: NotificationSecrets & Record<string, unknown> }).notifications;
    const serializable: StoreData = {
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
    // F-001: atomic write — temp file + fsync + rename
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

/** Test-only: reset the singleton (for unit tests that mutate STORE_FILE). */
export function _resetStoreForTests(): void {
  _store = null;
}
