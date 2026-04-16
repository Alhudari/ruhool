import type { Hono } from 'hono';
import crypto from 'node:crypto';
import type { StoreData, ConvRecord } from '../store/types.js';

export interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  pinned?: boolean;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

export function ensureProjectsArrayOn(store: StoreData) {
  if (!store.projects) store.projects = [];
  if (!store.pinnedConversations) store.pinnedConversations = [];
}

/**
 * Projects (ChatGPT/Claude-style conversation groupings) CRUD routes.
 */
export function registerProjectsRoutes(app: Hono, deps: ProjectsRoutesDeps): void {
  const { getStore, saveStore } = deps;

  const ensure = () => ensureProjectsArrayOn(getStore());

  app.get('/api/projects', (c) => {
    ensure();
    return c.json(getStore().projects || []);
  });

  app.post('/api/projects', async (c) => {
    ensure();
    const store = getStore();
    const body = await c.req.json<Partial<ProjectRecord>>();
    if (!body.name) return c.json({ error: 'name required' }, 400);
    const p: ProjectRecord = {
      id: 'prj-' + crypto.randomUUID().slice(0, 8),
      name: body.name, description: body.description, instructions: body.instructions,
      color: body.color || '#8b5cf6', pinned: !!body.pinned, archived: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    (store.projects as ProjectRecord[]).push(p);
    saveStore();
    return c.json(p);
  });

  app.put('/api/projects/:id', async (c) => {
    ensure();
    const store = getStore();
    const id = c.req.param('id');
    const body = await c.req.json<Partial<ProjectRecord>>();
    const p = (store.projects as ProjectRecord[]).find((x) => x.id === id);
    if (!p) return c.json({ error: 'not found' }, 404);
    Object.assign(p, body, { id: p.id, createdAt: p.createdAt, updatedAt: new Date().toISOString() });
    saveStore();
    return c.json(p);
  });

  app.delete('/api/projects/:id', (c) => {
    ensure();
    const store = getStore();
    const id = c.req.param('id');
    const idx = (store.projects as ProjectRecord[]).findIndex((x) => x.id === id);
    if (idx === -1) return c.json({ error: 'not found' }, 404);
    for (const cv of (store.conversations || [])) {
      if ((cv as ConvRecord & { projectId?: string }).projectId === id) (cv as ConvRecord & { projectId?: string }).projectId = undefined;
    }
    (store.projects as ProjectRecord[]).splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });
}
