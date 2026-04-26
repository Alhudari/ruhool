import type { StoreData } from '../types.js';

/**
 * Minimal migration runner for the JSON store. Each migration gets a
 * monotonically increasing id; the store records the last-applied id in
 * `schemaVersion`. On boot, any migration with id > schemaVersion runs.
 *
 * Migrations must be idempotent — they may run on a store that partially
 * reflects the change (for example if a previous boot crashed mid-run).
 *
 * Keep migrations small and self-documenting. Do NOT reach for tools.
 */
export interface Migration {
  id: number;
  name: string;
  up: (store: StoreData) => void;
}

import { migration001 } from './001-zotero-delta-fields.js';
import { migration002 } from './002-dispatch-limits.js';
import { migration003 } from './003-workspace-id.js';
import { migration004 } from './004-habits-today-fields.js';
import { migration005 } from './005-rename-cleanup.js';
import { migration006 } from './006-per-workspace-tasklists.js';
import { migration007 } from './007-shwasha-to-al-mulakhkhis.js';

export const MIGRATIONS: Migration[] = [migration001, migration002, migration003, migration004, migration005, migration006, migration007];

export function runMigrations(
  store: StoreData,
  opts: { logger?: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void } } = {},
): { applied: number[]; currentVersion: number } {
  const versioned = store as unknown as { schemaVersion?: number };
  const startVersion = versioned.schemaVersion ?? 0;
  const applied: number[] = [];

  for (const m of [...MIGRATIONS].sort((a, b) => a.id - b.id)) {
    if (m.id <= startVersion) continue;
    try {
      m.up(store);
      versioned.schemaVersion = m.id;
      applied.push(m.id);
      opts.logger?.info(`[migration] applied ${m.id}: ${m.name}`);
    } catch (err) {
      opts.logger?.warn({ err }, `[migration] ${m.id} failed — store left at version ${versioned.schemaVersion ?? 0}`);
      break;
    }
  }

  return { applied, currentVersion: versioned.schemaVersion ?? 0 };
}
