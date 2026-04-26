/**
 * Research Scope Points — editable PhD research phases / focus areas.
 * These are NOT tied to Obsidian files; they evolve freely over time.
 *
 * Routes:
 *   GET    /api/scope-points          — list all (excluding dropped)
 *   POST   /api/scope-points          — create
 *   PATCH  /api/scope-points/:id      — update
 *   DELETE /api/scope-points/:id      — soft delete (status='dropped')
 */
import crypto from 'node:crypto';
import type { Hono } from 'hono';
import type { StoreData, ResearchScopePoint } from '../store/types.js';

function getScopePoints(store: StoreData): ResearchScopePoint[] {
  if (!store.scopePoints) store.scopePoints = [];
  return store.scopePoints;
}

export function registerScopePointsRoutes(
  app: Hono,
  deps: { getStore: () => StoreData; saveStore: () => void },
): void {
  const { getStore, saveStore } = deps;

  // GET /api/scope-points — list active/paused/completed (not dropped)
  app.get('/api/scope-points', (c) => {
    const store = getStore();
    const all = getScopePoints(store);
    const showDropped = c.req.query('includeDropped') === 'true';
    const list = showDropped ? all : all.filter(sp => sp.status !== 'dropped');
    return c.json({ scopePoints: list, total: list.length });
  });

  // POST /api/scope-points — create
  app.post('/api/scope-points', async (c) => {
    const store = getStore();
    const body = await c.req.json<Partial<Omit<ResearchScopePoint, 'id' | 'createdAt' | 'updatedAt'>>>().catch(() => ({}) as never);
    if (!body.title?.trim()) return c.json({ error: 'title required' }, 400);

    const existing = getScopePoints(store);
    const nextNumber = body.number ?? (existing.length > 0 ? Math.max(...existing.map(sp => sp.number)) + 1 : 1);

    const sp: ResearchScopePoint = {
      id: crypto.randomUUID(),
      number: nextNumber,
      title: body.title.trim(),
      description: body.description,
      phase: body.phase,
      status: body.status ?? 'active',
      links: body.links ?? [],
      notes: body.notes,
      tags: body.tags ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    existing.push(sp);
    saveStore();
    return c.json(sp, 201);
  });

  // PATCH /api/scope-points/:id — update
  app.patch('/api/scope-points/:id', async (c) => {
    const store = getStore();
    const sp = getScopePoints(store).find(x => x.id === c.req.param('id'));
    if (!sp) return c.json({ error: 'Not found' }, 404);

    const body = await c.req.json<Partial<Omit<ResearchScopePoint, 'id' | 'createdAt'>>>().catch(() => ({}) as never);
    if (body.title !== undefined) sp.title = body.title.trim();
    if (body.description !== undefined) sp.description = body.description;
    if (body.phase !== undefined) sp.phase = body.phase;
    if (body.status !== undefined) sp.status = body.status;
    if (body.links !== undefined) sp.links = body.links;
    if (body.notes !== undefined) sp.notes = body.notes;
    if (body.tags !== undefined) sp.tags = body.tags;
    if (body.number !== undefined) sp.number = body.number;
    sp.updatedAt = new Date().toISOString();

    saveStore();
    return c.json(sp);
  });

  // DELETE /api/scope-points/:id — soft delete (status='dropped')
  app.delete('/api/scope-points/:id', (c) => {
    const store = getStore();
    const sp = getScopePoints(store).find(x => x.id === c.req.param('id'));
    if (!sp) return c.json({ error: 'Not found' }, 404);
    sp.status = 'dropped';
    sp.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true, id: sp.id });
  });
}
