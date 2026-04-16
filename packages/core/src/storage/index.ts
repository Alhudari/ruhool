import type { StorageAdapter } from './types.js';
import { LocalStorageAdapter } from './local-adapter.js';

export type { StorageAdapter, StorageFile, ListOptions, BucketName } from './types.js';
export { BUCKETS } from './types.js';
export { LocalStorageAdapter } from './local-adapter.js';
export { SupabaseStorageAdapter } from './supabase-adapter.js';

let _storage: StorageAdapter | null = null;

/**
 * Create the storage adapter based on environment config.
 *
 * STORAGE_PROVIDER=local   → LocalStorageAdapter (default)
 * STORAGE_PROVIDER=supabase → SupabaseStorageAdapter
 *
 * Swap providers by changing env vars. Zero code changes.
 */
export function createStorage(overrides?: {
  provider?: string;
  localRootDir?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}): StorageAdapter {
  const provider = overrides?.provider || process.env.STORAGE_PROVIDER || 'local';

  switch (provider) {
    case 'supabase': {
      const url = overrides?.supabaseUrl || process.env.SUPABASE_URL;
      const key = overrides?.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for supabase storage');
      const { SupabaseStorageAdapter } = require('./supabase-adapter.js');
      return new SupabaseStorageAdapter(url, key);
    }
    case 'local':
    default: {
      const rootDir = overrides?.localRootDir || process.env.STORAGE_ROOT || './data';
      return new LocalStorageAdapter(rootDir);
    }
  }
}

/** Get or create the singleton storage instance. */
export function getStorage(): StorageAdapter {
  if (!_storage) _storage = createStorage();
  return _storage;
}

/** Replace the singleton (useful for testing or runtime swap). */
export function setStorage(adapter: StorageAdapter): void {
  _storage = adapter;
}
