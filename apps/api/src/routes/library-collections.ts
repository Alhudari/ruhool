/**
 * Library Collections (Phase D) — Zotero-like folder structure inside the
 * platform's library. Mirrored once from Zotero, then fully editable.
 *
 * Routes:
 *   GET    /api/library/collections                       — list (flat + counts)
 *   POST   /api/library/collections                       — create
 *   PATCH  /api/library/collections/:id                   — rename/move/recolor
 *   DELETE /api/library/collections/:id                   — soft delete + detach entities
 *   POST   /api/library/collections/import-zotero         — mirror Zotero tree (idempotent)
 *   POST   /api/library/entities/:id/collections          — set membership { add: [], remove: [] }
 *   POST   /api/library/collections/auto-organize         — agent suggests assignments (proposal-only)
 *   POST   /api/library/collections/apply-organize        — apply approved assignments
 */
import crypto from 'node:crypto';
import type { Hono } from 'hono';
import type { StoreData, LibraryCollection } from '../store/types.js';

export interface LibraryCollectionsDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

const MAX_COLLECTION_NAME = 200;
const MAX_NOTES = 4000;

function getCollections(store: StoreData): LibraryCollection[] {
  if (!store.libraryCollections) store.libraryCollections = [];
  return store.libraryCollections;
}

function clampString(s: unknown, max: number): string {
  return typeof s === 'string' ? s.slice(0, max) : '';
}

export function registerLibraryCollectionsRoutes(app: Hono, deps: LibraryCollectionsDeps): void {
  const { getStore, saveStore } = deps;

  // List with per-collection entity counts.
  app.get('/api/library/collections', (c) => {
    const store = getStore();
    const cols = getCollections(store).filter((col) => !col.deletedAt);
    const entities = (store.libraryEntities ?? []).filter((e) => !e.deletedAt);
    const counts: Record<string, number> = {};
    for (const e of entities) {
      for (const cid of e.collectionIds ?? []) counts[cid] = (counts[cid] ?? 0) + 1;
    }
    const enriched = cols.map((col) => ({ ...col, entityCount: counts[col.id] ?? 0 }));
    c.header('Cache-Control', 'private, max-age=30');
    return c.json({ collections: enriched });
  });

  app.post('/api/library/collections', async (c) => {
    const body: { name?: string; parentId?: string | null; color?: string; icon?: string; notes?: string } =
      await c.req.json().catch(() => ({}));
    const name = clampString(body.name, MAX_COLLECTION_NAME).trim();
    if (!name) return c.json({ error: 'name required' }, 400);
    const store = getStore();
    if (body.parentId && !getCollections(store).find((cc) => cc.id === body.parentId && !cc.deletedAt)) {
      return c.json({ error: 'parentId not found' }, 400);
    }
    const now = new Date().toISOString();
    const col: LibraryCollection = {
      id: crypto.randomUUID(),
      name,
      parentId: body.parentId ?? null,
      color: typeof body.color === 'string' ? body.color : undefined,
      icon: typeof body.icon === 'string' ? body.icon : undefined,
      notes: clampString(body.notes, MAX_NOTES) || undefined,
      sortOrder: getCollections(store).length,
      createdAt: now,
      updatedAt: now,
    };
    getCollections(store).push(col);
    saveStore();
    return c.json({ collection: col }, 201);
  });

  app.patch('/api/library/collections/:id', async (c) => {
    const id = c.req.param('id');
    const store = getStore();
    const col = getCollections(store).find((cc) => cc.id === id && !cc.deletedAt);
    if (!col) return c.json({ error: 'Not found' }, 404);
    const body: Partial<Pick<LibraryCollection, 'name' | 'parentId' | 'color' | 'icon' | 'notes' | 'sortOrder'>> =
      await c.req.json().catch(() => ({}));
    if (typeof body.name === 'string') {
      const n = clampString(body.name, MAX_COLLECTION_NAME).trim();
      if (!n) return c.json({ error: 'name cannot be empty' }, 400);
      col.name = n;
    }
    if (body.parentId !== undefined) {
      if (body.parentId === id) return c.json({ error: 'cannot parent self' }, 400);
      // Reject cycles: walk parents from candidate up to root, refusing if we hit `id`.
      if (body.parentId) {
        let cursor: string | null | undefined = body.parentId;
        const seen = new Set<string>();
        while (cursor) {
          if (cursor === id) return c.json({ error: 'cycle detected' }, 400);
          if (seen.has(cursor)) break;
          seen.add(cursor);
          const next = getCollections(store).find((cc) => cc.id === cursor);
          cursor = next?.parentId ?? null;
        }
      }
      col.parentId = body.parentId;
    }
    if (body.color !== undefined) col.color = typeof body.color === 'string' ? body.color : undefined;
    if (body.icon !== undefined) col.icon = typeof body.icon === 'string' ? body.icon : undefined;
    if (body.notes !== undefined) col.notes = clampString(body.notes, MAX_NOTES) || undefined;
    if (typeof body.sortOrder === 'number') col.sortOrder = body.sortOrder;
    col.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ collection: col });
  });

  app.delete('/api/library/collections/:id', (c) => {
    const id = c.req.param('id');
    const cascade = c.req.query('cascade') === 'true';
    const store = getStore();
    const col = getCollections(store).find((cc) => cc.id === id && !cc.deletedAt);
    if (!col) return c.json({ error: 'Not found' }, 404);
    const now = new Date().toISOString();

    // Compute the set of collections to delete: just `id`, or the whole subtree.
    const toDelete = new Set<string>([id]);
    if (cascade) {
      // BFS from id collecting all live descendants.
      const queue = [id];
      while (queue.length) {
        const current = queue.shift()!;
        for (const child of getCollections(store)) {
          if (child.parentId === current && !child.deletedAt && !toDelete.has(child.id)) {
            toDelete.add(child.id);
            queue.push(child.id);
          }
        }
      }
    }

    let cascaded = 0;
    for (const cid of toDelete) {
      const target = getCollections(store).find((cc) => cc.id === cid);
      if (!target) continue;
      target.deletedAt = now;
      target.updatedAt = now;
      if (cid !== id) cascaded++;
    }

    // Detach from entities for every deleted collection.
    let detached = 0;
    for (const e of store.libraryEntities ?? []) {
      if (!e.collectionIds?.length) continue;
      const before = e.collectionIds.length;
      e.collectionIds = e.collectionIds.filter((cid) => !toDelete.has(cid));
      if (e.collectionIds.length !== before) {
        e.updatedAt = now;
        detached++;
      }
    }

    // Non-cascade only: reparent direct children to deleted's parent. With
    // cascade, all descendants are deleted so no reparent is needed.
    let reparented = 0;
    if (!cascade) {
      for (const child of getCollections(store)) {
        if (child.parentId === id && !child.deletedAt) {
          child.parentId = col.parentId ?? null;
          child.updatedAt = now;
          reparented++;
        }
      }
    }

    saveStore();
    return c.json({ ok: true, detached, reparented, cascaded });
  });

  // Mirror Zotero tree once. Idempotent — re-running matches existing rows
  // by zoteroCollectionKey and only adds new ones, preserves user renames/colors.
  app.post('/api/library/collections/import-zotero', async (c) => {
    type ZCol = { key: string; name: string; parentCollection?: string | null };
    const body: { collections?: ZCol[] } = await c.req.json().catch(() => ({}));
    let zoteroCols = Array.isArray(body.collections) ? body.collections : null;

    // If body didn't include collections, try the local snapshot first, then
    // fall back to a fresh fetch.
    const store = getStore();
    if (!zoteroCols) {
      const snap = store.zoteroSnapshot;
      if (snap?.collections?.length) {
        zoteroCols = snap.collections.map((cc) => ({
          key: cc.key,
          name: cc.name,
          parentCollection: cc.parentCollection ?? null,
        }));
      }
    }
    if (!zoteroCols) {
      try {
        const { zoteroListCollections } = await import('@ruhool/core');
        const fetched = await zoteroListCollections();
        zoteroCols = (fetched as Array<{ key: string; name: string; parentCollection?: string }>).map((cc) => ({
          key: cc.key,
          name: cc.name,
          parentCollection: cc.parentCollection ?? null,
        }));
      } catch (err) {
        return c.json({ error: `Could not load Zotero collections: ${err instanceof Error ? err.message : String(err)}` }, 502);
      }
    }
    if (!zoteroCols || zoteroCols.length === 0) {
      return c.json({ ok: true, created: 0, skipped: 0, message: 'No Zotero collections found' });
    }

    const existing = getCollections(store);
    const byZKey = new Map(existing.filter((cc) => cc.zoteroCollectionKey).map((cc) => [cc.zoteroCollectionKey!, cc]));
    const now = new Date().toISOString();

    // First pass: create or match every collection (no parent yet).
    let created = 0;
    let skipped = 0;
    const zKeyToLocalId = new Map<string, string>();
    for (const z of zoteroCols) {
      const hit = byZKey.get(z.key);
      if (hit) {
        zKeyToLocalId.set(z.key, hit.id);
        skipped++;
        continue;
      }
      const newCol: LibraryCollection = {
        id: crypto.randomUUID(),
        name: clampString(z.name, MAX_COLLECTION_NAME) || z.key,
        parentId: null,
        zoteroCollectionKey: z.key,
        sortOrder: existing.length + created,
        createdAt: now,
        updatedAt: now,
      };
      existing.push(newCol);
      zKeyToLocalId.set(z.key, newCol.id);
      created++;
    }

    // Second pass: wire parent links now that all IDs exist.
    let parented = 0;
    for (const z of zoteroCols) {
      const localId = zKeyToLocalId.get(z.key);
      if (!localId) continue;
      const local = existing.find((cc) => cc.id === localId);
      if (!local || !z.parentCollection) continue;
      const parentLocalId = zKeyToLocalId.get(z.parentCollection);
      if (parentLocalId && local.parentId !== parentLocalId) {
        local.parentId = parentLocalId;
        local.updatedAt = now;
        parented++;
      }
    }

    saveStore();
    return c.json({ ok: true, created, skipped, parented, total: zoteroCols.length });
  });

  // Set collection membership for an entity. Idempotent set-add/set-remove.
  app.post('/api/library/entities/:id/collections', async (c) => {
    const id = c.req.param('id');
    const body: { add?: string[]; remove?: string[]; set?: string[] } = await c.req.json().catch(() => ({}));
    const store = getStore();
    const entity = (store.libraryEntities ?? []).find((e) => e.id === id && !e.deletedAt);
    if (!entity) return c.json({ error: 'Not found' }, 404);

    // Validate every requested collectionId actually exists and isn't deleted.
    const validIds = new Set(getCollections(store).filter((cc) => !cc.deletedAt).map((cc) => cc.id));
    const filterValid = (ids?: string[]) => (ids ?? []).filter((cid) => validIds.has(cid));

    let next: Set<string>;
    if (Array.isArray(body.set)) {
      next = new Set(filterValid(body.set));
    } else {
      next = new Set(entity.collectionIds ?? []);
      for (const cid of filterValid(body.add)) next.add(cid);
      for (const cid of body.remove ?? []) next.delete(cid);
    }
    entity.collectionIds = Array.from(next);
    entity.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true, collectionIds: entity.collectionIds });
  });

  // Auto-organize agent — proposes assignments without applying.
  app.post('/api/library/collections/auto-organize', async (c) => {
    const body: { entityIds?: string[]; userInstructions?: string; maxItems?: number } =
      await c.req.json().catch(() => ({}));
    const maxItems = Math.min(typeof body.maxItems === 'number' ? body.maxItems : 30, 80);
    const store = getStore();
    const allEntities = (store.libraryEntities ?? []).filter((e) => !e.deletedAt);
    let entities = allEntities;
    if (Array.isArray(body.entityIds) && body.entityIds.length > 0) {
      const want = new Set(body.entityIds);
      entities = entities.filter((e) => want.has(e.id));
    } else {
      // Default: focus on un-categorized items first.
      entities = entities.filter((e) => !(e.collectionIds && e.collectionIds.length > 0));
    }
    entities = entities.slice(0, maxItems);
    if (entities.length === 0) return c.json({ proposals: [], message: 'No entities to organize' });

    const collections = getCollections(store).filter((cc) => !cc.deletedAt);
    if (collections.length === 0) return c.json({ proposals: [], message: 'No collections defined yet — create some first or import from Zotero' });

    const apiKey = (store.providers ?? []).find((p) => p.type === 'anthropic' && p.enabled && p.apiKey)?.apiKey;
    if (!apiKey) return c.json({ error: 'Anthropic provider not configured' }, 503);

    const collectionsCtx = collections.map((cc) => ({
      id: cc.id,
      name: cc.name,
      parentName: cc.parentId ? collections.find((p) => p.id === cc.parentId)?.name : undefined,
      // Cap notes — collections × full notes can blow the context window with no benefit.
      notes: cc.notes ? cc.notes.slice(0, 400) : undefined,
    }));
    const entitiesCtx = entities.map((e) => ({
      id: e.id,
      title: e.title,
      authors: e.authors,
      year: e.year,
      type: e.type,
      tags: e.tags,
      abstract: e.abstract?.slice(0, 600),
      currentCollections: (e.collectionIds ?? [])
        .map((cid) => collections.find((cc) => cc.id === cid)?.name)
        .filter(Boolean),
    }));

    const systemPrompt = `You are the Librarian organizing Abdullah's PhD library on BIM adoption in Kuwait.

Given a list of library entities and a list of available collections, propose collection assignments for each entity. Multiple collections per entity are allowed where genuinely relevant.

Rules:
1. Use only the provided collection IDs. Do not invent collections.
2. Be conservative — propose at most 2 collections per entity.
3. If no existing collection fits, suggest creating one with a clear name (Arabic + English).
4. Output STRICT JSON only — no commentary, no fences:
{
  "assignments": [
    { "entityId": "<id>", "addCollectionIds": ["<id>", ...], "reasoning": "<short>" }
  ],
  "newCollectionSuggestions": [
    { "name": "<en>", "nameAr": "<ar>", "reasoning": "<why>" }
  ]
}`;

    const userMsg = `Available collections:\n${JSON.stringify(collectionsCtx, null, 2)}\n\nEntities to organize:\n${JSON.stringify(entitiesCtx, null, 2)}${body.userInstructions ? `\n\nUser instructions: ${body.userInstructions}` : ''}\n\nReturn the JSON now.`;

    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey });
      const res = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      });
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n').trim();
      const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      let parsed: {
        assignments?: unknown;
        newCollectionSuggestions?: unknown;
      };
      try { parsed = JSON.parse(stripped); }
      catch { return c.json({ error: 'Agent returned non-JSON output', raw: text.slice(0, 1000) }, 502); }

      // Be defensive: the model may return null, a string, or a malformed array.
      // Treat anything that's not a real array as empty rather than crashing.
      const rawAssignments: Array<{ entityId?: unknown; addCollectionIds?: unknown; reasoning?: unknown }> =
        Array.isArray(parsed.assignments) ? (parsed.assignments as Array<Record<string, unknown>>) : [];
      const rawSuggestions: Array<Record<string, unknown>> =
        Array.isArray(parsed.newCollectionSuggestions) ? (parsed.newCollectionSuggestions as Array<Record<string, unknown>>) : [];

      const validCollectionIds = new Set(collections.map((cc) => cc.id));
      const validEntityIds = new Set(entities.map((e) => e.id));
      const assignments = rawAssignments
        .filter((a): a is { entityId: string; addCollectionIds?: unknown; reasoning?: unknown } =>
          typeof a.entityId === 'string' && validEntityIds.has(a.entityId))
        .map((a) => ({
          entityId: a.entityId,
          addCollectionIds: Array.isArray(a.addCollectionIds)
            ? (a.addCollectionIds as unknown[]).filter((cid): cid is string => typeof cid === 'string' && validCollectionIds.has(cid))
            : [],
          reasoning: typeof a.reasoning === 'string' ? a.reasoning : '',
        }))
        .filter((a) => a.addCollectionIds.length > 0);
      return c.json({
        assignments,
        newCollectionSuggestions: rawSuggestions,
      });
    } catch (err) {
      return c.json({ error: `Agent call failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  // Apply approved auto-organize assignments.
  app.post('/api/library/collections/apply-organize', async (c) => {
    const body: { assignments?: Array<{ entityId: string; addCollectionIds: string[] }> } =
      await c.req.json().catch(() => ({}));
    const list = Array.isArray(body.assignments) ? body.assignments : [];
    if (list.length === 0) return c.json({ error: 'No assignments to apply' }, 400);
    const store = getStore();
    const validCollectionIds = new Set(getCollections(store).filter((cc) => !cc.deletedAt).map((cc) => cc.id));
    const now = new Date().toISOString();
    let applied = 0;        // entities with at least one new collection link
    let alreadyAssigned = 0; // entities where the proposal matched existing membership
    for (const a of list) {
      const entity = (store.libraryEntities ?? []).find((e) => e.id === a.entityId && !e.deletedAt);
      if (!entity) continue;
      const before = new Set(entity.collectionIds ?? []);
      const next = new Set(before);
      for (const cid of a.addCollectionIds) {
        if (validCollectionIds.has(cid)) next.add(cid);
      }
      // Compare set membership, not array length — same length but different
      // collections must still count as "applied".
      let changed = next.size !== before.size;
      if (!changed) {
        for (const cid of next) if (!before.has(cid)) { changed = true; break; }
      }
      entity.collectionIds = Array.from(next);
      if (changed) {
        entity.updatedAt = now;
        applied++;
      } else {
        alreadyAssigned++;
      }
    }
    saveStore();
    return c.json({ ok: true, applied, alreadyAssigned });
  });
}
