import type { Hono } from 'hono';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { StoreData, LibraryCategory, LibraryTag } from '../store/types.js';
import type { ImageRecord } from './images.js';
import type { TrashItem } from './trash.js';

export interface LibraryRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

export interface LibraryItem {
  id: string;
  type: 'video' | 'image' | 'audio' | 'design' | 'document';
  source: string;
  title: string;
  description?: string;
  thumbnail?: string;
  url: string;
  size?: number;
  duration?: number;
  createdAt: string;
  archived: boolean;
  tags: string[];
  categoryId?: string | null;
  tagIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface LibraryListDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  studioAssetsDir: string;
  ensureStudioAssetsDir: () => void;
  experimentsCategoryId: string;
  listRenders: () => Array<{
    id: string; filename: string; title?: string; description?: string;
    sizeBytes?: number; durationInFrames?: number; fps?: number; renderedAt: string;
    archived?: boolean; width?: number; height?: number; format?: string;
    renderDurationMs?: number; tool?: string; source?: string;
  }>;
  archiveRender: (id: string, archived: boolean) => boolean;
  trashMetaPath: string;
}

export function parseLibraryId(id: string): { kind: string; rest: string } | null {
  const colon = id.indexOf(':');
  if (colon === -1) return null;
  return { kind: id.slice(0, colon), rest: id.slice(colon + 1) };
}

export function registerLibraryListRoutes(app: Hono, deps: LibraryListDeps): void {
  const { getStore, studioAssetsDir, ensureStudioAssetsDir, experimentsCategoryId, listRenders, archiveRender, trashMetaPath } = deps;

  function buildLibraryItems(): LibraryItem[] {
    const store = getStore();
    const items: LibraryItem[] = [];
    try {
      const renders = listRenders();
      for (const r of renders) {
        const isDemo = r.source === 'demo';
        items.push({
          id: `render:${r.id}`,
          type: 'video',
          source: isDemo ? 'demo' : 'studio-render',
          title: r.title || r.filename,
          description: r.description,
          url: `/api/videos/${r.filename}`,
          size: r.sizeBytes,
          duration: r.durationInFrames && r.fps ? r.durationInFrames / r.fps : undefined,
          createdAt: r.renderedAt,
          archived: !!r.archived,
          tags: isDemo ? ['demo', 'video', r.tool || 'remotion'] : ['rendered', 'video'],
          metadata: {
            width: r.width, height: r.height, fps: r.fps, format: r.format,
            renderDurationMs: r.renderDurationMs, tool: r.tool, source: r.source,
            costUSD: (r as unknown as { costUSD?: number }).costUSD,
            costLines: (r as unknown as { costLines?: unknown }).costLines,
            hasAudio: (r as unknown as { hasAudio?: boolean }).hasAudio,
          },
        });
      }
    } catch {}
    try {
      ensureStudioAssetsDir();
      const files = fs.readdirSync(studioAssetsDir).filter((f) => !f.startsWith('.') && !f.startsWith('_'));
      for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
        const isVideo = ['.mp4', '.mov', '.webm'].includes(ext);
        if (!isImage && !isVideo) continue;
        const stats = fs.statSync(path.join(studioAssetsDir, f));
        items.push({
          id: `studio-asset:${f}`,
          type: isImage ? 'image' : 'video',
          source: 'studio-upload',
          title: f,
          url: `/api/studio/assets/${f}`,
          thumbnail: isImage ? `/api/studio/assets/${f}` : undefined,
          size: stats.size,
          createdAt: stats.mtime.toISOString(),
          archived: false,
          tags: ['upload', isImage ? 'image' : 'video'],
        });
      }
    } catch {}
    try {
      const imgs = ((store as unknown as { images?: ImageRecord[] }).images) || [];
      for (const im of imgs) {
        items.push({
          id: `chat-image:${im.id}`,
          type: 'image',
          source: 'chat-upload',
          title: im.originalName || im.filename,
          url: `/api/images/${im.filename}`,
          thumbnail: `/api/images/${im.filename}`,
          size: im.bytes,
          createdAt: im.uploadedAt,
          archived: false,
          tags: ['chat', 'vision'],
          metadata: { conversationId: im.conversationId, mime: im.mime, ocrText: im.ocrText, classification: im.classification },
        });
      }
    } catch {}
    const meta = store.libraryItemMeta || {};
    for (const item of items) {
      const m = meta[item.id];
      if (item.source === 'demo' && !m?.categoryId) {
        item.categoryId = experimentsCategoryId;
      } else {
        item.categoryId = m?.categoryId ?? null;
      }
      item.tagIds = m?.tags ?? [];
    }
    return items;
  }

  app.get('/api/library', (c) => {
    const type = c.req.query('type');
    const source = c.req.query('source');
    const archivedQ = c.req.query('archived');
    const archivedOnly = archivedQ === 'true';
    const sort = c.req.query('sort') || 'newest';
    const search = (c.req.query('q') || '').toLowerCase().trim();
    const categoryId = c.req.query('categoryId');
    const tag = c.req.query('tag');

    let items = buildLibraryItems();
    items = items.filter((i) => (archivedOnly ? i.archived : !i.archived));
    if (type) items = items.filter((i) => i.type === type);
    if (source) items = items.filter((i) => i.source === source);
    if (categoryId) {
      if (categoryId === 'uncategorized') items = items.filter((i) => !i.categoryId);
      else items = items.filter((i) => i.categoryId === categoryId);
    }
    if (tag) items = items.filter((i) => (i.tagIds || []).includes(tag));
    if (search) items = items.filter((i) =>
      i.title.toLowerCase().includes(search) ||
      (i.description || '').toLowerCase().includes(search) ||
      i.tags.some((t) => t.toLowerCase().includes(search))
    );
    items.sort((a, b) => {
      switch (sort) {
        case 'oldest': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name': return a.title.localeCompare(b.title);
        case 'size': return (b.size || 0) - (a.size || 0);
        case 'newest':
        default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    return c.json(items);
  });

  app.put('/api/library/:id/archive', async (c) => {
    const raw = c.req.param('id');
    const parsed = parseLibraryId(raw);
    if (!parsed) return c.json({ error: 'Invalid id' }, 400);
    const body = await c.req.json().catch(() => ({}));
    const archived = body.archived !== false;
    if (parsed.kind === 'render') {
      const ok = archiveRender(parsed.rest, archived);
      if (!ok) return c.json({ error: 'Not found' }, 404);
      return c.json({ ok: true });
    }
    if (parsed.kind === 'studio-asset') {
      return c.json({ ok: true, note: 'archive not supported for studio uploads' });
    }
    return c.json({ error: 'Unknown source' }, 400);
  });

  app.delete('/api/library/:id', (c) => {
    const raw = c.req.param('id');
    const parsed = parseLibraryId(raw);
    if (!parsed) return c.json({ error: 'Invalid id' }, 400);

    // Soft delete — add to trash, mark as archived
    let trash: TrashItem[] = [];
    try {
      if (fs.existsSync(trashMetaPath)) {
        trash = JSON.parse(fs.readFileSync(trashMetaPath, 'utf-8')) as TrashItem[];
      }
    } catch {}
    if (!trash.find((t) => t.originalId === raw)) {
      trash.push({ id: crypto.randomUUID(), type: 'library', originalId: raw, deletedAt: new Date().toISOString() });
      try {
        fs.mkdirSync(path.dirname(trashMetaPath), { recursive: true });
        fs.writeFileSync(trashMetaPath, JSON.stringify(trash, null, 2), 'utf-8');
      } catch {}
    }
    if (parsed.kind === 'render') archiveRender(parsed.rest, true);
    return c.json({ ok: true, trashed: true });
  });
}

/**
 * Library categories / tags / item metadata routes.
 * Note: `/api/library` list, archive, soft-delete and trash remain in
 * index.ts because they depend on buildLibraryItems + parseLibraryId +
 * render archive helpers.
 */
export function registerLibraryRoutes(app: Hono, deps: LibraryRoutesDeps): void {
  const { getStore, saveStore } = deps;

  // ─── Library categories ───
  app.get('/api/library/categories', (c) => {
    const store = getStore();
    return c.json(store.libraryCategories || []);
  });

  app.post('/api/library/categories', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ name: { ar: string; en: string }; parentId?: string | null; color?: string }>();
    if (!body?.name?.ar && !body?.name?.en) return c.json({ error: 'name required' }, 400);
    const cat: LibraryCategory = {
      id: crypto.randomUUID(),
      name: { ar: body.name.ar || body.name.en, en: body.name.en || body.name.ar },
      parentId: body.parentId || null,
      color: body.color,
    };
    store.libraryCategories = store.libraryCategories || [];
    store.libraryCategories.push(cat);
    saveStore();
    return c.json(cat);
  });

  app.put('/api/library/categories/:id', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: { ar: string; en: string }; parentId?: string | null; color?: string }>();
    const cat = (store.libraryCategories || []).find((x) => x.id === id);
    if (!cat) return c.json({ error: 'not found' }, 404);
    if (cat.builtin) return c.json({ error: 'cannot edit built-in category' }, 400);
    if (body.name) cat.name = { ar: body.name.ar || cat.name.ar, en: body.name.en || cat.name.en };
    if (body.parentId !== undefined) cat.parentId = body.parentId;
    if (body.color !== undefined) cat.color = body.color;
    saveStore();
    return c.json(cat);
  });

  app.delete('/api/library/categories/:id', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const list = store.libraryCategories || [];
    const idx = list.findIndex((x) => x.id === id);
    if (idx === -1) return c.json({ error: 'not found' }, 404);
    if (list[idx].builtin) return c.json({ error: 'cannot delete built-in category' }, 400);
    list.splice(idx, 1);
    for (const c2 of list) if (c2.parentId === id) c2.parentId = null;
    const meta = store.libraryItemMeta || {};
    for (const k of Object.keys(meta)) {
      if (meta[k]?.categoryId === id) meta[k].categoryId = undefined;
    }
    saveStore();
    return c.json({ ok: true });
  });

  // ─── Library tags ───
  app.get('/api/library/tags', (c) => {
    const store = getStore();
    return c.json(store.libraryTags || []);
  });

  app.post('/api/library/tags', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ name: { ar: string; en: string }; color?: string }>();
    if (!body?.name?.ar && !body?.name?.en) return c.json({ error: 'name required' }, 400);
    const tag: LibraryTag = {
      id: crypto.randomUUID(),
      name: { ar: body.name.ar || body.name.en, en: body.name.en || body.name.ar },
      color: body.color,
    };
    store.libraryTags = store.libraryTags || [];
    store.libraryTags.push(tag);
    saveStore();
    return c.json(tag);
  });

  app.put('/api/library/tags/:id', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: { ar: string; en: string }; color?: string }>();
    const tag = (store.libraryTags || []).find((x) => x.id === id);
    if (!tag) return c.json({ error: 'not found' }, 404);
    if (tag.builtin) return c.json({ error: 'cannot edit built-in tag' }, 400);
    if (body.name) tag.name = { ar: body.name.ar || tag.name.ar, en: body.name.en || tag.name.en };
    if (body.color !== undefined) tag.color = body.color;
    saveStore();
    return c.json(tag);
  });

  app.delete('/api/library/tags/:id', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const list = store.libraryTags || [];
    const idx = list.findIndex((x) => x.id === id);
    if (idx === -1) return c.json({ error: 'not found' }, 404);
    if (list[idx].builtin) return c.json({ error: 'cannot delete built-in tag' }, 400);
    list.splice(idx, 1);
    const meta = store.libraryItemMeta || {};
    for (const k of Object.keys(meta)) {
      if (meta[k]?.tags?.includes(id)) {
        meta[k].tags = meta[k].tags!.filter((t) => t !== id);
      }
    }
    saveStore();
    return c.json({ ok: true });
  });

  // ─── Library item category/tag assignment ───
  app.put('/api/library/items/:id/category', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const body = await c.req.json<{ categoryId?: string | null }>();
    store.libraryItemMeta = store.libraryItemMeta || {};
    const cur = store.libraryItemMeta[id] || {};
    cur.categoryId = body.categoryId || undefined;
    store.libraryItemMeta[id] = cur;
    saveStore();
    return c.json({ ok: true, id, categoryId: cur.categoryId || null });
  });

  app.put('/api/library/items/:id/tags', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const body = await c.req.json<{ tags?: string[] }>();
    store.libraryItemMeta = store.libraryItemMeta || {};
    const cur = store.libraryItemMeta[id] || {};
    cur.tags = Array.isArray(body.tags) ? body.tags : [];
    store.libraryItemMeta[id] = cur;
    saveStore();
    return c.json({ ok: true, id, tags: cur.tags });
  });
}
