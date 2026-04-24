import crypto from 'node:crypto';
import type { Hono } from 'hono';
import type { StoreData, MilestoneRecord } from '../store/types.js';

export interface MilestonesRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

function getMilestones(store: StoreData): MilestoneRecord[] {
  if (!store.milestones) store.milestones = [];
  return store.milestones;
}

export function registerMilestonesRoutes(app: Hono, deps: MilestonesRoutesDeps): void {
  const { getStore, saveStore } = deps;

  app.get('/api/milestones', (c) => {
    const store = getStore();
    const records = getMilestones(store)
      .filter(m => !m.deletedAt)
      .sort((a, b) => a.date.localeCompare(b.date));
    c.header('Cache-Control', 'private, max-age=60');
    return c.json(records);
  });

  app.post('/api/milestones', async (c) => {
    const store = getStore();
    const body = await c.req.json<Partial<MilestoneRecord>>();
    const now = new Date().toISOString();
    const rec: MilestoneRecord = {
      id: crypto.randomUUID(),
      title: body.title ?? '',
      titleAr: body.titleAr ?? '',
      date: body.date ?? now.slice(0, 10),
      status: body.status ?? 'upcoming',
      description: body.description,
      links: body.links ?? [],
      tags: body.tags ?? [],
      meetingId: body.meetingId,
      grs2Month: body.grs2Month,
      attachments: body.attachments,
      createdAt: now,
      updatedAt: now,
    };
    getMilestones(store).push(rec);
    saveStore();
    return c.json(rec, 201);
  });

  app.patch('/api/milestones/:id', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const rec = getMilestones(store).find(m => m.id === id);
    if (!rec) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<Partial<MilestoneRecord>>();
    Object.assign(rec, body, { updatedAt: new Date().toISOString(), id });
    saveStore();
    return c.json(rec);
  });

  app.delete('/api/milestones/:id', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const rec = getMilestones(store).find(m => m.id === id);
    if (!rec) return c.json({ error: 'Not found' }, 404);
    rec.deletedAt = new Date().toISOString();
    rec.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true });
  });

  app.post('/api/milestones/:id/restore', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const rec = getMilestones(store).find(m => m.id === id);
    if (!rec) return c.json({ error: 'Not found' }, 404);
    delete rec.deletedAt;
    delete rec.archivedAt;
    rec.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(rec);
  });
}
