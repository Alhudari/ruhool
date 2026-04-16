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
export function loadStore(): StoreData {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as StoreData;
      if (Array.isArray(data.providers)) {
        for (const p of data.providers) {
          if (p.apiKey) p.apiKey = decryptSecret(p.apiKey);
        }
      }
      return data;
    }
  } catch {
    /* empty */
  }
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

// ─── Singleton ───
let _store: StoreData | null = null;

export function getStore(): StoreData {
  if (!_store) _store = loadStore();
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
    const serializable: StoreData = {
      ...store,
      providers: (store.providers || []).map((p) => ({
        ...p,
        apiKey: p.apiKey ? encryptSecret(p.apiKey) : p.apiKey,
      })),
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(serializable, null, 2), 'utf-8');
  });
}
