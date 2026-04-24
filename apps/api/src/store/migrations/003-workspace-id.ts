import type { StoreData } from '../types.js';
import type { Migration } from './index.js';

/**
 * Round 4 — add `workspaceId` to every domain entity that can be scoped
 * to a workspace. All existing rows default to 'phd' because that is
 * what the platform used to be about exclusively. New rows in the Life
 * workspace will set 'life' explicitly.
 *
 * Idempotent: running this on already-migrated data is a no-op because
 * the backfill only writes when the field is missing.
 */
export const migration003: Migration = {
  id: 3,
  name: 'workspaceId backfill',
  up: (store: StoreData) => {
    const taggable = ['conversations', 'tasks', 'keepNotes'] as const;
    for (const key of taggable) {
      const arr = (store as unknown as Record<string, Array<Record<string, unknown>>>)[key];
      if (!Array.isArray(arr)) continue;
      for (const row of arr) {
        if (typeof row === 'object' && row !== null && !('workspaceId' in row)) {
          row.workspaceId = 'phd';
        }
      }
    }
    // Seed the user's preferred default workspace.
    const s = store as unknown as { activeWorkspaceId?: string };
    if (!s.activeWorkspaceId) s.activeWorkspaceId = 'phd';
  },
};
