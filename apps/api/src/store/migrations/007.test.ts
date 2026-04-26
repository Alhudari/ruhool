import { describe, it, expect } from 'vitest';
import { migration007 } from './007-shwasha-to-al-mulakhkhis.js';
import type { StoreData } from '../types.js';

function emptyStore(): StoreData {
  return {} as unknown as StoreData;
}

describe('migration007 — shwashaSettings → alMulakhkhisSettings', () => {
  it('renames the legacy field', () => {
    const store = emptyStore();
    (store as unknown as { shwashaSettings: { mindBlock: string } }).shwashaSettings = { mindBlock: 'old' };
    migration007.up(store);
    const s = store as unknown as Record<string, unknown>;
    expect(s.shwashaSettings).toBeUndefined();
    expect(s.alMulakhkhisSettings).toEqual({ mindBlock: 'old' });
  });

  it('drops legacy when new already populated', () => {
    const store = emptyStore();
    const s = store as unknown as Record<string, unknown>;
    s.shwashaSettings = { mindBlock: 'legacy' };
    s.alMulakhkhisSettings = { mindBlock: 'current' };
    migration007.up(store);
    expect(s.shwashaSettings).toBeUndefined();
    expect(s.alMulakhkhisSettings).toEqual({ mindBlock: 'current' });
  });

  it('is idempotent on a clean store', () => {
    const store = emptyStore();
    migration007.up(store);
    migration007.up(store);
    expect(store).toEqual({});
  });

  it('does nothing when only the new field exists', () => {
    const store = emptyStore();
    const s = store as unknown as Record<string, unknown>;
    s.alMulakhkhisSettings = { mindBlock: 'fresh' };
    migration007.up(store);
    expect(s.alMulakhkhisSettings).toEqual({ mindBlock: 'fresh' });
    expect(s.shwashaSettings).toBeUndefined();
  });
});
