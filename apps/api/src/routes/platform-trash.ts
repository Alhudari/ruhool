/**
 * Platform Trash — Generic soft-delete recovery system (J-1).
 *
 * GET    /api/trash?type=task|milestone|library-entity|inbox-item
 * POST   /api/trash/:type/:id/restore
 * DELETE /api/trash/:type/:id          → hard delete (permanent)
 */
import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';

export interface PlatformTrashDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

type EntityType = 'task' | 'milestone' | 'library-entity' | 'inbox-item' | 'meeting';

function getItems(store: StoreData, type: EntityType): Array<{ id: string; deletedAt?: string }> {
  switch (type) {
    case 'task':           return (store.tasks ?? []) as Array<{ id: string; deletedAt?: string }>;
    case 'milestone':      return (store.milestones ?? []) as Array<{ id: string; deletedAt?: string }>;
    case 'library-entity': return (store.libraryEntities ?? []) as Array<{ id: string; deletedAt?: string }>;
    case 'inbox-item': {
      const s = store as unknown as { inboxItems?: Array<{ id: string; deletedAt?: string }> };
      return s.inboxItems ?? [];
    }
    case 'meeting': {
      const s = store as unknown as { meetingSessions?: Array<{ id: string; deletedAt?: string }> };
      return s.meetingSessions ?? [];
    }
    default: return [];
  }
}

function removeFromStore(store: StoreData, type: EntityType, id: string): boolean {
  switch (type) {
    case 'task': {
      const before = store.tasks?.length ?? 0;
      store.tasks = (store.tasks ?? []).filter(t => t.id !== id);
      return (store.tasks.length ?? 0) < before;
    }
    case 'milestone': {
      const before = store.milestones?.length ?? 0;
      store.milestones = (store.milestones ?? []).filter(m => m.id !== id);
      return (store.milestones?.length ?? 0) < before;
    }
    case 'library-entity': {
      const before = store.libraryEntities?.length ?? 0;
      store.libraryEntities = (store.libraryEntities ?? []).filter(e => e.id !== id);
      return (store.libraryEntities?.length ?? 0) < before;
    }
    case 'inbox-item': {
      const s = store as unknown as { inboxItems?: Array<{ id: string }> };
      const before = s.inboxItems?.length ?? 0;
      s.inboxItems = (s.inboxItems ?? []).filter(i => i.id !== id);
      return (s.inboxItems?.length ?? 0) < before;
    }
    default: return false;
  }
}

export function registerPlatformTrashRoutes(app: Hono, deps: PlatformTrashDeps): void {
  const { getStore, saveStore } = deps;

  // List deleted items for a given type
  app.get('/api/trash', (c) => {
    const store = getStore();
    const type = (c.req.query('type') ?? 'task') as EntityType;
    const items = getItems(store, type).filter(i => !!i.deletedAt);
    return c.json({ items, total: items.length, type });
  });

  // Restore (remove deletedAt)
  app.post('/api/trash/:type/:id/restore', (c) => {
    const store = getStore();
    const type = c.req.param('type') as EntityType;
    const id = c.req.param('id');
    const item = getItems(store, type).find(i => i.id === id);
    if (!item) return c.json({ error: 'Not found' }, 404);
    delete item.deletedAt;
    (item as { updatedAt?: string }).updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true, id, type });
  });

  // Hard delete (permanent — requires confirmed=true query param)
  app.delete('/api/trash/:type/:id', (c) => {
    const store = getStore();
    const type = c.req.param('type') as EntityType;
    const id = c.req.param('id');
    const confirmed = c.req.query('confirmed') === 'true';
    if (!confirmed) return c.json({ error: 'Pass ?confirmed=true to permanently delete' }, 400);

    const item = getItems(store, type).find(i => i.id === id);
    if (!item || !(item as { deletedAt?: string }).deletedAt) {
      return c.json({ error: 'Item not in trash' }, 404);
    }

    const removed = removeFromStore(store, type, id);
    if (!removed) return c.json({ error: 'Remove failed' }, 500);
    saveStore();
    return c.json({ ok: true, id, type, permanent: true });
  });
}
