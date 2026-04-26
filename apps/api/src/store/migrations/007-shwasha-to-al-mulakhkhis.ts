import type { StoreData } from '../types.js';
import type { Migration } from './index.js';

/**
 * Phase F (deferred completion): rename internal storage key
 * `shwashaSettings` → `alMulakhkhisSettings` so no remaining surface uses the
 * legacy "shwasha" identifier. The route file and TypeScript identifiers
 * remain unchanged for backward compatibility, but the persisted shape now
 * uses the new name.
 *
 * Migration is idempotent:
 *   - If the new field already exists, do nothing
 *   - If the old field exists, copy to the new one and delete the old
 *   - If neither exists, leave the store untouched
 *
 * The reading session records and route paths stay the same — only the
 * top-level settings bucket name changes. Routes read the new field via the
 * `resolveSettings()` helper which checks both names.
 */
export const migration007: Migration = {
  id: 7,
  name: 'rename shwashaSettings → alMulakhkhisSettings',
  up: (store: StoreData) => {
    const s = store as unknown as Record<string, unknown>;
    const hasNew = !!s.alMulakhkhisSettings;
    const oldVal = s.shwashaSettings;
    if (hasNew) {
      // New shape already in place — drop the legacy field if it lingered.
      if (oldVal !== undefined) delete s.shwashaSettings;
      return;
    }
    if (oldVal !== undefined) {
      s.alMulakhkhisSettings = oldVal;
      delete s.shwashaSettings;
    }
  },
};
