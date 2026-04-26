import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { registerLibraryCollectionsRoutes } from './library-collections.js';
import type { StoreData, LibraryCollection, LibraryEntity } from '../store/types.js';

function makeStore(): StoreData {
  // Minimal shape — only the fields the routes touch.
  return {
    libraryCollections: [],
    libraryEntities: [],
    providers: [],
  } as unknown as StoreData;
}

function makeApp(store: StoreData) {
  const app = new Hono();
  registerLibraryCollectionsRoutes(app, {
    getStore: () => store,
    saveStore: () => {},
  });
  return app;
}

describe('library-collections routes', () => {
  let store: StoreData;
  let app: Hono;

  beforeEach(() => {
    store = makeStore();
    app = makeApp(store);
  });

  describe('GET /api/library/collections', () => {
    it('returns empty list initially', async () => {
      const res = await app.request('/api/library/collections');
      expect(res.status).toBe(200);
      const body = await res.json() as { collections: LibraryCollection[] };
      expect(body.collections).toEqual([]);
    });

    it('counts entities per collection', async () => {
      store.libraryCollections = [
        { id: 'c1', name: 'Method', createdAt: 't', updatedAt: 't' },
        { id: 'c2', name: 'Theory', createdAt: 't', updatedAt: 't' },
      ];
      store.libraryEntities = [
        { id: 'e1', type: 'paper', title: 't', notes: '', subNotes: [], links: [], tags: [], collectionIds: ['c1'], createdAt: 't', updatedAt: 't' },
        { id: 'e2', type: 'paper', title: 't', notes: '', subNotes: [], links: [], tags: [], collectionIds: ['c1', 'c2'], createdAt: 't', updatedAt: 't' },
      ] as LibraryEntity[];
      const res = await app.request('/api/library/collections');
      const body = await res.json() as { collections: Array<LibraryCollection & { entityCount: number }> };
      expect(body.collections.find((c) => c.id === 'c1')!.entityCount).toBe(2);
      expect(body.collections.find((c) => c.id === 'c2')!.entityCount).toBe(1);
    });

    it('excludes soft-deleted collections', async () => {
      store.libraryCollections = [
        { id: 'c1', name: 'Live', createdAt: 't', updatedAt: 't' },
        { id: 'c2', name: 'Gone', createdAt: 't', updatedAt: 't', deletedAt: 't' },
      ];
      const res = await app.request('/api/library/collections');
      const body = await res.json() as { collections: LibraryCollection[] };
      expect(body.collections).toHaveLength(1);
      expect(body.collections[0].id).toBe('c1');
    });
  });

  describe('POST /api/library/collections', () => {
    it('creates a collection', async () => {
      const res = await app.request('/api/library/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { collection: LibraryCollection };
      expect(body.collection.name).toBe('New');
      expect(body.collection.id).toBeTruthy();
      expect(store.libraryCollections).toHaveLength(1);
    });

    it('rejects empty name', async () => {
      const res = await app.request('/api/library/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '   ' }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects unknown parent', async () => {
      const res = await app.request('/api/library/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Child', parentId: 'nonexistent' }),
      });
      expect(res.status).toBe(400);
    });

    it('clamps long names', async () => {
      const longName = 'x'.repeat(500);
      const res = await app.request('/api/library/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: longName }),
      });
      const body = await res.json() as { collection: LibraryCollection };
      expect(body.collection.name.length).toBe(200);
    });
  });

  describe('PATCH /api/library/collections/:id', () => {
    it('renames a collection', async () => {
      store.libraryCollections = [{ id: 'c1', name: 'Old', createdAt: 't', updatedAt: 't' }];
      const res = await app.request('/api/library/collections/c1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New' }),
      });
      expect(res.status).toBe(200);
      expect(store.libraryCollections![0].name).toBe('New');
    });

    it('rejects parenting to self', async () => {
      store.libraryCollections = [{ id: 'c1', name: 'A', createdAt: 't', updatedAt: 't' }];
      const res = await app.request('/api/library/collections/c1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: 'c1' }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects cycles', async () => {
      // a → b → c, attempt to set c.parent = a (creates a → b → c → a)
      store.libraryCollections = [
        { id: 'a', name: 'A', createdAt: 't', updatedAt: 't' },
        { id: 'b', name: 'B', parentId: 'a', createdAt: 't', updatedAt: 't' },
        { id: 'c', name: 'C', parentId: 'b', createdAt: 't', updatedAt: 't' },
      ];
      // Try to make 'a' a child of 'c' — completes the cycle.
      const res = await app.request('/api/library/collections/a', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: 'c' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/cycle/i);
    });

    it('allows valid reparent', async () => {
      store.libraryCollections = [
        { id: 'a', name: 'A', createdAt: 't', updatedAt: 't' },
        { id: 'b', name: 'B', createdAt: 't', updatedAt: 't' },
      ];
      const res = await app.request('/api/library/collections/b', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: 'a' }),
      });
      expect(res.status).toBe(200);
      expect(store.libraryCollections![1].parentId).toBe('a');
    });
  });

  describe('DELETE /api/library/collections/:id', () => {
    it('soft-deletes and detaches entities', async () => {
      store.libraryCollections = [{ id: 'c1', name: 'Old', createdAt: 't', updatedAt: 't' }];
      store.libraryEntities = [
        { id: 'e1', type: 'paper', title: 't', notes: '', subNotes: [], links: [], tags: [], collectionIds: ['c1'], createdAt: 't', updatedAt: 't' },
      ] as LibraryEntity[];
      const res = await app.request('/api/library/collections/c1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json() as { detached: number; reparented: number };
      expect(body.detached).toBe(1);
      expect(store.libraryCollections![0].deletedAt).toBeTruthy();
      expect(store.libraryEntities![0].collectionIds).toEqual([]);
    });

    it('reparents children to grandparent', async () => {
      store.libraryCollections = [
        { id: 'a', name: 'A', createdAt: 't', updatedAt: 't' },
        { id: 'b', name: 'B', parentId: 'a', createdAt: 't', updatedAt: 't' },
        { id: 'c', name: 'C', parentId: 'b', createdAt: 't', updatedAt: 't' },
      ];
      const res = await app.request('/api/library/collections/b', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json() as { reparented: number };
      expect(body.reparented).toBe(1);
      const c = store.libraryCollections!.find((x) => x.id === 'c')!;
      expect(c.parentId).toBe('a');
    });

    it('cascade=true deletes the entire subtree', async () => {
      store.libraryCollections = [
        { id: 'root', name: 'Root', createdAt: 't', updatedAt: 't' },
        { id: 'a', name: 'A', parentId: 'root', createdAt: 't', updatedAt: 't' },
        { id: 'b', name: 'B', parentId: 'a', createdAt: 't', updatedAt: 't' },
        { id: 'c', name: 'C', parentId: 'b', createdAt: 't', updatedAt: 't' },
        { id: 'untouched', name: 'Sibling', createdAt: 't', updatedAt: 't' },
      ];
      store.libraryEntities = [
        { id: 'e1', type: 'paper', title: 't', notes: '', subNotes: [], links: [], tags: [], collectionIds: ['b', 'c'], createdAt: 't', updatedAt: 't' },
        { id: 'e2', type: 'paper', title: 't', notes: '', subNotes: [], links: [], tags: [], collectionIds: ['untouched'], createdAt: 't', updatedAt: 't' },
      ] as LibraryEntity[];
      const res = await app.request('/api/library/collections/a?cascade=true', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json() as { cascaded: number; detached: number; reparented: number };
      // a + b + c = 1 root + 2 cascaded
      expect(body.cascaded).toBe(2);
      expect(body.reparented).toBe(0);
      expect(body.detached).toBe(1);
      // Verify deletedAt set on a, b, c — but not root or untouched
      expect(store.libraryCollections!.find((cc) => cc.id === 'a')!.deletedAt).toBeTruthy();
      expect(store.libraryCollections!.find((cc) => cc.id === 'b')!.deletedAt).toBeTruthy();
      expect(store.libraryCollections!.find((cc) => cc.id === 'c')!.deletedAt).toBeTruthy();
      expect(store.libraryCollections!.find((cc) => cc.id === 'root')!.deletedAt).toBeUndefined();
      expect(store.libraryCollections!.find((cc) => cc.id === 'untouched')!.deletedAt).toBeUndefined();
      // Entity e1 had b,c — both detached. Entity e2 untouched.
      expect(store.libraryEntities![0].collectionIds).toEqual([]);
      expect(store.libraryEntities![1].collectionIds).toEqual(['untouched']);
    });
  });

  describe('POST /api/library/collections/import-zotero (with body)', () => {
    it('mirrors Zotero collections idempotently', async () => {
      const zoteroCols = [
        { key: 'Z1', name: 'Method', parentCollection: undefined },
        { key: 'Z2', name: 'Sub', parentCollection: 'Z1' },
      ];

      // First run: create both
      const r1 = await app.request('/api/library/collections/import-zotero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collections: zoteroCols }),
      });
      const b1 = await r1.json() as { created: number; skipped: number; parented: number };
      expect(b1.created).toBe(2);
      expect(b1.parented).toBe(1);

      // Second run: should skip both
      const r2 = await app.request('/api/library/collections/import-zotero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collections: zoteroCols }),
      });
      const b2 = await r2.json() as { created: number; skipped: number };
      expect(b2.created).toBe(0);
      expect(b2.skipped).toBe(2);
    });

    it('preserves user-renamed collection on re-import', async () => {
      const zoteroCols = [{ key: 'Z1', name: 'Original', parentCollection: undefined }];
      await app.request('/api/library/collections/import-zotero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collections: zoteroCols }),
      });
      // User renames
      store.libraryCollections![0].name = 'My Custom Name';
      // Re-import with same Zotero data
      await app.request('/api/library/collections/import-zotero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collections: zoteroCols }),
      });
      expect(store.libraryCollections![0].name).toBe('My Custom Name');
    });

    it('parents children that appear before parents in the input', async () => {
      const zoteroCols = [
        { key: 'Z2', name: 'Child', parentCollection: 'Z1' },
        { key: 'Z1', name: 'Parent', parentCollection: undefined },
      ];
      const r = await app.request('/api/library/collections/import-zotero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collections: zoteroCols }),
      });
      const b = await r.json() as { created: number; parented: number };
      expect(b.created).toBe(2);
      expect(b.parented).toBe(1);
      const child = store.libraryCollections!.find((c) => c.zoteroCollectionKey === 'Z2')!;
      const parent = store.libraryCollections!.find((c) => c.zoteroCollectionKey === 'Z1')!;
      expect(child.parentId).toBe(parent.id);
    });
  });

  describe('POST /api/library/entities/:id/collections', () => {
    beforeEach(() => {
      store.libraryCollections = [
        { id: 'c1', name: 'A', createdAt: 't', updatedAt: 't' },
        { id: 'c2', name: 'B', createdAt: 't', updatedAt: 't' },
      ];
      store.libraryEntities = [
        { id: 'e1', type: 'paper', title: 't', notes: '', subNotes: [], links: [], tags: [], createdAt: 't', updatedAt: 't' },
      ] as LibraryEntity[];
    });

    it('adds and removes', async () => {
      // Add c1, c2
      let res = await app.request('/api/library/entities/e1/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add: ['c1', 'c2'] }),
      });
      expect(res.status).toBe(200);
      expect(store.libraryEntities![0].collectionIds).toEqual(['c1', 'c2']);

      // Remove c1
      res = await app.request('/api/library/entities/e1/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove: ['c1'] }),
      });
      expect(res.status).toBe(200);
      expect(store.libraryEntities![0].collectionIds).toEqual(['c2']);
    });

    it('set replaces fully', async () => {
      store.libraryEntities![0].collectionIds = ['c1'];
      const res = await app.request('/api/library/entities/e1/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set: ['c2'] }),
      });
      expect(res.status).toBe(200);
      expect(store.libraryEntities![0].collectionIds).toEqual(['c2']);
    });

    it('drops invalid collection IDs silently', async () => {
      const res = await app.request('/api/library/entities/e1/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add: ['c1', 'bogus'] }),
      });
      expect(res.status).toBe(200);
      expect(store.libraryEntities![0].collectionIds).toEqual(['c1']);
    });
  });

  describe('POST /api/library/collections/apply-organize', () => {
    it('applies assignments and counts changed entities', async () => {
      store.libraryCollections = [{ id: 'c1', name: 'A', createdAt: 't', updatedAt: 't' }];
      store.libraryEntities = [
        { id: 'e1', type: 'paper', title: 't', notes: '', subNotes: [], links: [], tags: [], createdAt: 't', updatedAt: 't' },
        { id: 'e2', type: 'paper', title: 't', notes: '', subNotes: [], links: [], tags: [], createdAt: 't', updatedAt: 't' },
      ] as LibraryEntity[];
      const res = await app.request('/api/library/collections/apply-organize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignments: [
            { entityId: 'e1', addCollectionIds: ['c1'] },
            { entityId: 'e2', addCollectionIds: ['c1'] },
          ],
        }),
      });
      const body = await res.json() as { applied: number };
      expect(body.applied).toBe(2);
    });

    it('drops invalid collection IDs', async () => {
      store.libraryCollections = [{ id: 'c1', name: 'A', createdAt: 't', updatedAt: 't' }];
      store.libraryEntities = [
        { id: 'e1', type: 'paper', title: 't', notes: '', subNotes: [], links: [], tags: [], createdAt: 't', updatedAt: 't' },
      ] as LibraryEntity[];
      await app.request('/api/library/collections/apply-organize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignments: [{ entityId: 'e1', addCollectionIds: ['c1', 'bogus'] }],
        }),
      });
      expect(store.libraryEntities![0].collectionIds).toEqual(['c1']);
    });

    it('reports alreadyAssigned vs applied accurately', async () => {
      store.libraryCollections = [
        { id: 'c1', name: 'A', createdAt: 't', updatedAt: 't' },
        { id: 'c2', name: 'B', createdAt: 't', updatedAt: 't' },
      ];
      store.libraryEntities = [
        // already in c1 — this assignment is a no-op
        { id: 'e1', type: 'paper', title: 't', notes: '', subNotes: [], links: [], tags: [], collectionIds: ['c1'], createdAt: 't', updatedAt: 't' },
        // new assignment — this counts
        { id: 'e2', type: 'paper', title: 't', notes: '', subNotes: [], links: [], tags: [], createdAt: 't', updatedAt: 't' },
      ] as LibraryEntity[];
      const res = await app.request('/api/library/collections/apply-organize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignments: [
            { entityId: 'e1', addCollectionIds: ['c1'] },
            { entityId: 'e2', addCollectionIds: ['c2'] },
          ],
        }),
      });
      const body = await res.json() as { applied: number; alreadyAssigned: number };
      expect(body.applied).toBe(1);
      expect(body.alreadyAssigned).toBe(1);
    });
  });
});
