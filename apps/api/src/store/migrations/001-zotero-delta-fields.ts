import type { StoreData } from '../types.js';
import type { Migration } from './index.js';

export const migration001: Migration = {
  id: 1,
  name: 'zotero delta + dry-run fields',
  up: (store: StoreData) => {
    const s = store as unknown as {
      zoteroVaultSync?: {
        lastRunAt?: string | null;
        lastRunStats?: unknown;
        lastError?: string | null;
        lastZoteroVersion?: number;
        lastDryRunPlan?: unknown[];
      };
    };
    if (!s.zoteroVaultSync) s.zoteroVaultSync = {};
    if (s.zoteroVaultSync.lastZoteroVersion == null) s.zoteroVaultSync.lastZoteroVersion = 0;
    if (!Array.isArray(s.zoteroVaultSync.lastDryRunPlan)) s.zoteroVaultSync.lastDryRunPlan = [];
  },
};
