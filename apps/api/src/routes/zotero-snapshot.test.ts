/**
 * Phase C regression: prove the Zotero offline snapshot survives failed pulls
 * and never wipes the user's data on transient errors.
 *
 * The route gets data from `zoteroListItemsRich` / `zoteroListCollections` in
 * `@ruhool/core`. We mock those at the module boundary so we can simulate
 * happy paths and failures without touching the real Zotero client.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@ruhool/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@ruhool/core');
  return {
    ...actual,
    zoteroListCollections: vi.fn(),
    zoteroListItemsRich: vi.fn(),
    setZoteroConfig: vi.fn(),
    getZoteroConfig: vi.fn(() => ({ mode: 'local', webUserId: '', webApiKey: '', localUrl: '' })),
  };
});

import { Hono } from 'hono';
import { zoteroListCollections, zoteroListItemsRich } from '@ruhool/core';
import { registerZoteroRoutes } from './zotero.js';
import type { StoreData } from '../store/types.js';
import type { AnthropicProvider } from '../services/llm/index.js';

type MockedZ = {
  zoteroListCollections: ReturnType<typeof vi.fn>;
  zoteroListItemsRich: ReturnType<typeof vi.fn>;
};

function makeStore(): StoreData {
  return {
    libraryEntities: [],
    providers: [],
    zoteroConfig: { mode: 'local' },
  } as unknown as StoreData;
}

function makeApp(store: StoreData) {
  const app = new Hono();
  registerZoteroRoutes(app, {
    getStore: () => store,
    saveStore: () => {},
    anthropicCache: { current: null as unknown as AnthropicProvider | null },
  });
  return app;
}

describe('Zotero snapshot persistence', () => {
  let store: StoreData;
  let app: Hono;
  let mocks: MockedZ;

  beforeEach(() => {
    store = makeStore();
    app = makeApp(store);
    mocks = {
      zoteroListCollections: zoteroListCollections as unknown as ReturnType<typeof vi.fn>,
      zoteroListItemsRich: zoteroListItemsRich as unknown as ReturnType<typeof vi.fn>,
    };
    mocks.zoteroListCollections.mockReset();
    mocks.zoteroListItemsRich.mockReset();
  });

  describe('successful pulls write to snapshot', () => {
    it('items-rich populates snapshot.items', async () => {
      mocks.zoteroListItemsRich.mockResolvedValue([
        { itemKey: 'A1', title: 'Paper One', authors: 'Doe, J', year: 2025, itemType: 'journalArticle' },
        { itemKey: 'A2', title: 'Paper Two', authors: 'Smith, A', year: 2024, itemType: 'book' },
      ]);
      const res = await app.request('/api/zotero/items-rich?force=true');
      expect(res.status).toBe(200);
      expect(store.zoteroSnapshot?.items).toHaveLength(2);
      expect(store.zoteroSnapshot?.items[0].itemKey).toBe('A1');
      expect(store.zoteroSnapshot?.lastSuccessfulFetchAt).toBeTruthy();
      expect(store.zoteroSnapshot?.lastError).toBeNull();
    });

    it('collections populates snapshot.collections', async () => {
      mocks.zoteroListCollections.mockResolvedValue([
        { key: 'C1', name: 'Method' },
        { key: 'C2', name: 'Theory', parentCollection: 'C1' },
      ]);
      const res = await app.request('/api/zotero/collections');
      expect(res.status).toBe(200);
      expect(store.zoteroSnapshot?.collections).toHaveLength(2);
      expect(store.zoteroSnapshot?.collections[1].parentCollection).toBe('C1');
    });
  });

  describe('failed pulls serve stale data without wiping', () => {
    it('items-rich falls back to snapshot on error', async () => {
      // Pre-populate snapshot
      store.zoteroSnapshot = {
        mode: 'local',
        items: [
          { itemKey: 'STALE1', title: 'Cached', authors: 'Cached A', itemType: 'paper' },
        ],
        collections: [],
        fetchedAt: '2026-04-25T00:00:00Z',
        lastSuccessfulFetchAt: '2026-04-25T00:00:00Z',
        lastError: null,
      };
      mocks.zoteroListItemsRich.mockRejectedValue(new Error('Zotero unreachable'));

      const res = await app.request('/api/zotero/items-rich?force=true');
      expect(res.status).toBe(200);
      const body = await res.json() as { items: unknown[]; stale?: boolean; lastError?: string };
      expect(body.stale).toBe(true);
      expect(body.items).toHaveLength(1);
      expect(body.lastError).toMatch(/unreachable/i);
      // Snapshot was NOT wiped
      expect(store.zoteroSnapshot.items).toHaveLength(1);
    });

    it('collections falls back to snapshot on error', async () => {
      store.zoteroSnapshot = {
        mode: 'local',
        items: [],
        collections: [{ key: 'C1', name: 'Cached' }],
        fetchedAt: '2026-04-25T00:00:00Z',
        lastSuccessfulFetchAt: '2026-04-25T00:00:00Z',
        lastError: null,
      };
      mocks.zoteroListCollections.mockRejectedValue(new Error('network down'));

      const res = await app.request('/api/zotero/collections');
      expect(res.status).toBe(200);
      const body = await res.json() as { collections: unknown[]; stale?: boolean };
      expect(body.stale).toBe(true);
      expect(body.collections).toHaveLength(1);
      expect(store.zoteroSnapshot.collections).toHaveLength(1);
    });

    it('items-rich without snapshot returns 500 (no stale to fall back on)', async () => {
      mocks.zoteroListItemsRich.mockRejectedValue(new Error('first time pull failed'));
      const res = await app.request('/api/zotero/items-rich?force=true');
      expect(res.status).toBe(500);
    });
  });

  describe('defensive: empty pull does not wipe snapshot', () => {
    it('items-rich does not overwrite populated snapshot with empty response', async () => {
      // Existing populated snapshot
      store.zoteroSnapshot = {
        mode: 'local',
        items: [
          { itemKey: 'OLD1', title: 'Existing', authors: 'A', itemType: 'paper' },
        ],
        collections: [],
        fetchedAt: '2026-04-25T00:00:00Z',
        lastSuccessfulFetchAt: '2026-04-25T00:00:00Z',
        lastError: null,
      };
      // Zotero now returns nothing (could be a transient bug or empty library)
      mocks.zoteroListItemsRich.mockResolvedValue([]);

      const res = await app.request('/api/zotero/items-rich?force=true');
      expect(res.status).toBe(200);
      // Snapshot still has the original item — empty pull was rejected
      expect(store.zoteroSnapshot.items).toHaveLength(1);
      expect(store.zoteroSnapshot.items[0].itemKey).toBe('OLD1');
    });
  });

  describe('GET /api/zotero/snapshot-status', () => {
    it('reports does-not-exist when no snapshot', async () => {
      const res = await app.request('/api/zotero/snapshot-status');
      const body = await res.json() as { exists: boolean };
      expect(body.exists).toBe(false);
    });

    it('reports counts and freshness when snapshot exists', async () => {
      const oldDate = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
      store.zoteroSnapshot = {
        mode: 'local',
        items: [{ itemKey: 'X', title: 'x', authors: 'a', itemType: 'p' }],
        collections: [{ key: 'C', name: 'c' }],
        fetchedAt: oldDate,
        lastSuccessfulFetchAt: oldDate,
        lastError: null,
      };
      const res = await app.request('/api/zotero/snapshot-status');
      const body = await res.json() as {
        exists: boolean; itemsCount: number; collectionsCount: number; isStale: boolean;
      };
      expect(body.exists).toBe(true);
      expect(body.itemsCount).toBe(1);
      expect(body.collectionsCount).toBe(1);
      expect(body.isStale).toBe(true); // > 24h old
    });
  });
});
