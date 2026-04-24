/**
 * Phase 4 — Unified Library entity routes.
 * Separate from /api/library/* which handles media (video/image) items.
 *
 * GET    /api/library/entities               list (type, search, tag, limit, offset)
 * POST   /api/library/entities               create
 * GET    /api/library/entities/:id           get one
 * PATCH  /api/library/entities/:id           update
 * DELETE /api/library/entities/:id           soft delete
 * POST   /api/library/entities/:id/restore   un-delete
 * POST   /api/library/entities/:id/link      link two entities
 * DELETE /api/library/entities/:id/link/:tid remove link
 * GET    /api/library/entities/:id/backlinks entities linking TO this one
 * GET    /api/library/entity-types           list all built-in types
 */
import crypto from 'node:crypto';
import type { Hono } from 'hono';
import type { StoreData, LibraryEntity, EntityType, SubNote, EntityLink } from '../store/types.js';

export interface LibraryEntitiesRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

const ENTITY_TYPES: EntityType[] = [
  'paper', 'book', 'report', 'standard', 'my-writing', 'thesis-chapter',
  'person', 'organization', 'conference', 'project',
  'atomic-note', 'reading-session', 'research-cluster',
  'file', 'webpage', 'video', 'code-repo',
];

function getEntities(store: StoreData): LibraryEntity[] {
  if (!store.libraryEntities) store.libraryEntities = [];
  return store.libraryEntities;
}

export function registerLibraryEntitiesRoutes(app: Hono, deps: LibraryEntitiesRoutesDeps): void {
  const { getStore, saveStore } = deps;

  // List entity types
  app.get('/api/library/entity-types', (c) => {
    c.header('Cache-Control', 'private, max-age=3600');
    return c.json(ENTITY_TYPES);
  });

  // List entities — supports type, search, tag, limit, offset
  app.get('/api/library/entities', (c) => {
    const store = getStore();
    const type = c.req.query('type') as EntityType | undefined;
    const search = c.req.query('search')?.toLowerCase();
    const tag = c.req.query('tag');
    const limit = Math.min(100, parseInt(c.req.query('limit') ?? '50', 10));
    const offset = parseInt(c.req.query('offset') ?? '0', 10);
    const includeArchived = c.req.query('archived') === 'true';

    let entities = getEntities(store).filter(e => !e.deletedAt);
    if (!includeArchived) entities = entities.filter(e => !e.archivedAt);
    if (type) entities = entities.filter(e => e.type === type);
    if (tag) entities = entities.filter(e => e.tags.includes(tag));
    if (search) entities = entities.filter(e =>
      e.title.toLowerCase().includes(search) ||
      (e.authors ?? '').toLowerCase().includes(search) ||
      (e.abstract ?? '').toLowerCase().includes(search)
    );

    entities = entities.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = entities.length;
    c.header('Cache-Control', 'private, max-age=300');
    return c.json({ entities: entities.slice(offset, offset + limit), total, limit, offset });
  });

  // Create
  app.post('/api/library/entities', async (c) => {
    const store = getStore();
    const body = await c.req.json<Partial<LibraryEntity>>();
    if (!body.title) return c.json({ error: 'title required' }, 400);
    const now = new Date().toISOString();
    const entity: LibraryEntity = {
      id: crypto.randomUUID(),
      type: body.type ?? 'paper',
      title: body.title,
      notes: body.notes ?? '',
      subNotes: body.subNotes ?? [],
      links: body.links ?? [],
      tags: body.tags ?? [],
      zoteroKey: body.zoteroKey,
      readingStatus: body.readingStatus,
      readingDepth: body.readingDepth,
      authors: body.authors,
      year: body.year,
      url: body.url,
      doi: body.doi,
      isbn: body.isbn,
      publisher: body.publisher,
      journal: body.journal,
      abstract: body.abstract,
      coverImage: body.coverImage,
      createdAt: now,
      updatedAt: now,
    };
    getEntities(store).push(entity);
    saveStore();
    return c.json(entity, 201);
  });

  // Get one
  app.get('/api/library/entities/:id', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const entity = getEntities(store).find(e => e.id === id);
    if (!entity) return c.json({ error: 'Not found' }, 404);
    c.header('Cache-Control', 'private, max-age=60');
    return c.json(entity);
  });

  // Update
  app.patch('/api/library/entities/:id', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const entity = getEntities(store).find(e => e.id === id);
    if (!entity) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<Partial<LibraryEntity>>();
    const { id: _id, createdAt: _c, subNotes: _s, links: _l, ...rest } = body;
    Object.assign(entity, rest, { updatedAt: new Date().toISOString() });
    saveStore();
    return c.json(entity);
  });

  // Soft delete
  app.delete('/api/library/entities/:id', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const entity = getEntities(store).find(e => e.id === id);
    if (!entity) return c.json({ error: 'Not found' }, 404);
    entity.deletedAt = new Date().toISOString();
    entity.updatedAt = entity.deletedAt;
    saveStore();
    return c.json({ ok: true });
  });

  // Restore
  app.post('/api/library/entities/:id/restore', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const entity = getEntities(store).find(e => e.id === id);
    if (!entity) return c.json({ error: 'Not found' }, 404);
    delete entity.deletedAt;
    delete entity.archivedAt;
    entity.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(entity);
  });

  // Add sub-note
  app.post('/api/library/entities/:id/subnotes', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const entity = getEntities(store).find(e => e.id === id);
    if (!entity) return c.json({ error: 'Not found' }, 404);
    const { content } = await c.req.json<{ content: string }>();
    const now = new Date().toISOString();
    const note: SubNote = { id: crypto.randomUUID(), content: content ?? '', createdAt: now, updatedAt: now };
    entity.subNotes.push(note);
    entity.updatedAt = now;
    saveStore();
    return c.json(note, 201);
  });

  // Link two entities
  app.post('/api/library/entities/:id/link', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const entity = getEntities(store).find(e => e.id === id);
    if (!entity) return c.json({ error: 'Not found' }, 404);
    const { targetId, relation } = await c.req.json<{ targetId: string; relation?: string }>();
    if (!targetId) return c.json({ error: 'targetId required' }, 400);
    if (entity.links.some(l => l.targetId === targetId)) return c.json({ ok: true, existing: true });
    const link: EntityLink = { targetId, relation, createdAt: new Date().toISOString() };
    entity.links.push(link);
    entity.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true, link });
  });

  // Remove link
  app.delete('/api/library/entities/:id/link/:tid', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const tid = c.req.param('tid');
    const entity = getEntities(store).find(e => e.id === id);
    if (!entity) return c.json({ error: 'Not found' }, 404);
    entity.links = entity.links.filter(l => l.targetId !== tid);
    entity.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true });
  });

  // Backlinks (entities that link TO this one)
  app.get('/api/library/entities/:id/backlinks', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const all = getEntities(store).filter(e => !e.deletedAt && e.links.some(l => l.targetId === id));
    c.header('Cache-Control', 'private, max-age=60');
    return c.json(all);
  });

  // Zotero import → create entity
  app.post('/api/library/entities/import-zotero', async (c) => {
    const store = getStore();
    const body = await c.req.json<{
      key: string; title?: string; itemType?: string; authors?: string;
      year?: number; doi?: string; url?: string; abstract?: string; tags?: string[];
    }>();
    if (!body.key) return c.json({ error: 'Zotero key required' }, 400);
    // Check if already imported
    const existing = getEntities(store).find(e => e.zoteroKey === body.key);
    if (existing) return c.json({ entity: existing, created: false });
    const now = new Date().toISOString();
    const typeMap: Record<string, EntityType> = {
      journalArticle: 'paper', book: 'book', bookSection: 'book',
      report: 'report', thesis: 'thesis-chapter', conferencePaper: 'paper',
      webpage: 'webpage', document: 'file',
    };
    const entity: LibraryEntity = {
      id: crypto.randomUUID(),
      type: typeMap[body.itemType ?? ''] ?? 'paper',
      title: body.title ?? body.key,
      notes: '',
      subNotes: [],
      links: [],
      tags: body.tags ?? [],
      zoteroKey: body.key,
      authors: body.authors,
      year: body.year,
      doi: body.doi,
      url: body.url,
      abstract: body.abstract,
      readingStatus: 'to-read',
      createdAt: now,
      updatedAt: now,
    };
    getEntities(store).push(entity);
    saveStore();
    return c.json({ entity, created: true }, 201);
  });
}
