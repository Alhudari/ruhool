import type { StoreData } from '../types.js';
import type { Migration } from './index.js';

/**
 * Round 6 — habit/today/cross-workspace fields on existing tasks.
 * Idempotent — only writes when a field is missing.
 *
 * Existing tasks are assumed to be one-shots (not habits). The
 * `isHabit`, `isToday`, `crossWorkspace` flags all default to `false`.
 */
export const migration004: Migration = {
  id: 4,
  name: 'task habit/today/cross-workspace defaults',
  up: (store: StoreData) => {
    if (!Array.isArray(store.tasks)) return;
    for (const t of store.tasks) {
      const row = t as unknown as Record<string, unknown>;
      if (!('isHabit' in row)) row.isHabit = false;
      if (!('isToday' in row)) row.isToday = false;
      if (!('crossWorkspace' in row)) row.crossWorkspace = false;
      if (!('scheduledFor' in row)) row.scheduledFor = null;
    }
    // Round 7: Google Tasks config scaffold.
    const s = store as unknown as {
      googleTasks?: {
        connected?: boolean;
        accountEmail?: string;
        listId?: string;
        listTitle?: string;
        refreshToken?: string;
        lastSyncAt?: string | null;
        lastError?: string | null;
        syncEnabled?: boolean;
      };
    };
    if (!s.googleTasks) s.googleTasks = { connected: false, syncEnabled: false, lastSyncAt: null, lastError: null };
  },
};
