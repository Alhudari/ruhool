import type { Hono } from 'hono';
import crypto from 'node:crypto';
import type { StoreData, TagRecord, TagAssignment } from '../store/types.js';

const DEFAULT_TAGS = [
  'BIM','BIM/Standards','BIM/Adoption','BIM/Technology',
  'BIM/Technology/GIS','BIM/Technology/LOD','BIM/Technology/COBie',
  'Kuwait','Kuwait/Contracts','Kuwait/Government','Kuwait/Construction',
  'GCC','GCC/Qatar','GCC/UAE','GCC/Saudi','GCC/Bahrain','GCC/Oman',
  'Research','Research/PRISMA','Research/Methodology','Research/SystematicReview','Research/Writing',
  'Supervision','Supervision/Meetings','Supervision/GRS2','Supervision/Progress',
  'Standards','Standards/ISO19650','Standards/BIMForum','Standards/RIBA',
];

function getTags(store: StoreData): TagRecord[] {
  const s = store as unknown as { tags?: TagRecord[] };
  if (!s.tags || s.tags.length === 0) {
    // Seed defaults
    s.tags = DEFAULT_TAGS.map(path => ({
      id: crypto.randomUUID(),
      path,
      createdAt: new Date().toISOString(),
    }));
  }
  return s.tags;
}

function getAssignments(store: StoreData): TagAssignment[] {
  const s = store as unknown as { tagAssignments?: TagAssignment[] };
  if (!s.tagAssignments) s.tagAssignments = [];
  return s.tagAssignments;
}

export function registerTagsRoutes(app: Hono, deps: { getStore: () => StoreData; saveStore: () => void }) {
  const { getStore, saveStore } = deps;

  app.get('/api/tags', (c) => {
    const store = getStore();
    const tags = getTags(store);
    const q = c.req.query('q');
    const filtered = q ? tags.filter(t => t.path.toLowerCase().includes(q.toLowerCase())) : tags;
    return c.json({ tags: filtered, total: filtered.length });
  });

  app.post('/api/tags', async (c) => {
    const store = getStore();
    const tags = getTags(store);
    const body = await c.req.json<{ path: string; label?: string; color?: string; description?: string }>();
    if (!body.path?.trim()) return c.json({ error: 'path required' }, 400);
    const clean = body.path.trim().replace(/^#+/, '');
    if (tags.find(t => t.path === clean)) return c.json({ error: 'tag already exists' }, 409);
    const tag: TagRecord = { id: crypto.randomUUID(), path: clean, label: body.label, color: body.color, description: body.description, createdAt: new Date().toISOString() };
    tags.push(tag);
    saveStore();
    return c.json(tag, 201);
  });

  app.delete('/api/tags/:id', (c) => {
    const store = getStore();
    const s = store as unknown as { tags?: TagRecord[] };
    if (!s.tags) return c.json({ error: 'not found' }, 404);
    const idx = s.tags.findIndex(t => t.id === c.req.param('id'));
    if (idx === -1) return c.json({ error: 'not found' }, 404);
    s.tags.splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });

  app.get('/api/tags/search', (c) => {
    const store = getStore();
    const q = c.req.query('q') ?? '';
    const tags = getTags(store);
    const matches = tags.filter(t => t.path.toLowerCase().includes(q.toLowerCase())).slice(0, 20);
    return c.json({ tags: matches });
  });

  app.post('/api/tags/apply', async (c) => {
    const store = getStore();
    const assignments = getAssignments(store);
    const body = await c.req.json<{ nodeType: string; nodeId: string; tagPaths: string[] }>();
    const existing = assignments.find(a => a.nodeType === body.nodeType && a.nodeId === body.nodeId);
    if (existing) {
      existing.tagPaths = body.tagPaths;
      existing.updatedAt = new Date().toISOString();
    } else {
      assignments.push({ nodeType: body.nodeType, nodeId: body.nodeId, tagPaths: body.tagPaths, updatedAt: new Date().toISOString() });
    }
    saveStore();
    return c.json({ ok: true });
  });

  app.get('/api/tags/node', (c) => {
    const store = getStore();
    const { nodeType, nodeId } = c.req.query() as { nodeType: string; nodeId: string };
    const assignments = getAssignments(store);
    const found = assignments.find(a => a.nodeType === nodeType && a.nodeId === nodeId);
    return c.json({ tagPaths: found?.tagPaths ?? [] });
  });
}
