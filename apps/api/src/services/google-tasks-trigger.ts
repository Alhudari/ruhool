/**
 * Debounced Google Tasks sync trigger.
 *
 * Motivation: local task CRUD happens in rapid bursts (e.g. user checks
 * 5 habits in 3 seconds). We want each of those to eventually land in
 * Google — but not as 5 separate syncs. One debounced trigger collapses
 * bursts into a single push+pull tick that runs ~2s after the last edit.
 *
 * The trigger is cheap to call and no-ops when Google Tasks isn't
 * connected — so routes can call it freely without checking connection
 * state themselves.
 */
import type { StoreData } from '../store/types.js';
import { runSyncTick, type GoogleSyncDeps } from '../workers/google-tasks-sync.js';

interface GoogleTasksConfig {
  syncEnabled?: boolean;
  refreshToken?: string;
  listId?: string;
}

let pending: NodeJS.Timeout | null = null;
let inFlight = false;
let rerunAfter = false;
let deps: GoogleSyncDeps | null = null;

/** Wire the trigger with its dependencies once at boot. */
export function registerGoogleTasksTrigger(d: GoogleSyncDeps): void {
  deps = d;
}

function isConnected(store: StoreData): boolean {
  const cfg = (store as unknown as { googleTasks?: GoogleTasksConfig }).googleTasks;
  return !!(cfg?.syncEnabled && cfg?.refreshToken && cfg?.listId);
}

async function fire(): Promise<void> {
  if (!deps) return;
  if (inFlight) { rerunAfter = true; return; }
  inFlight = true;
  try {
    await runSyncTick(deps);
  } finally {
    inFlight = false;
    if (rerunAfter) {
      rerunAfter = false;
      // Schedule another short tick to catch edits made mid-sync.
      if (!pending) pending = setTimeout(() => { pending = null; void fire(); }, 1500);
    }
  }
}

/**
 * Schedule a sync within `delayMs`. Calling again before it fires resets
 * the timer — bursts collapse into one run. If a sync is already in
 * flight, flags a rerun so edits made during the sync land next tick.
 * No-op when Google Tasks isn't connected.
 */
export function triggerGoogleTasksSync(delayMs = 2000): void {
  if (!deps) return;
  const store = deps.getStore();
  if (!isConnected(store)) return;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => { pending = null; void fire(); }, delayMs);
}

/** Synchronous fast path — used by the "sync/tick" endpoint. */
export async function runGoogleTasksSyncNow(): Promise<void> {
  if (!deps) return;
  const store = deps.getStore();
  if (!isConnected(store)) return;
  if (pending) { clearTimeout(pending); pending = null; }
  await fire();
}
