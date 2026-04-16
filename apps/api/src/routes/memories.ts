import type { Hono } from 'hono';
import crypto from 'node:crypto';
import type { StoreData, ActivityRecord } from '../store/types.js';

export interface MemoriesRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  logActivity: (
    type: ActivityRecord['type'],
    action: string,
    details: string,
    opts?: { agentId?: string; metadata?: Record<string, unknown>; requestId?: string | null }
  ) => ActivityRecord;
  agentDisplayNames: Record<string, string>;
}

/**
 * Memories CRUD + export/import routes.
 */
export function registerMemoriesRoutes(app: Hono, deps: MemoriesRoutesDeps): void {
  const { getStore, saveStore, logActivity, agentDisplayNames } = deps;

  app.get('/api/agents/:id/memories', (c) => {
    const store = getStore();
    const agentId = c.req.param('id');
    const tier = c.req.query('tier');
    let mems = store.memories.filter((m) => m.agentId === agentId);
    if (tier) mems = mems.filter((m) => m.tier === tier);
    return c.json(mems);
  });

  app.post('/api/agents/:id/memories', async (c) => {
    const store = getStore();
    const agentId = c.req.param('id');
    const body = await c.req.json<{ tier: string; content: string }>();
    const mem = {
      id: crypto.randomUUID(), agentId, tier: body.tier as 'working' | 'short-term' | 'long-term',
      content: body.content, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    store.memories.push(mem);
    logActivity('memory', `Memory created for ${agentDisplayNames[agentId] || agentId}`, body.content.slice(0, 150), { agentId, metadata: { tier: body.tier, memoryId: mem.id } });
    saveStore();
    return c.json(mem, 201);
  });

  app.put('/api/memories/:id', async (c) => {
    const store = getStore();
    const mem = store.memories.find((m) => m.id === c.req.param('id'));
    if (!mem) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<{ content: string }>();
    mem.content = body.content;
    mem.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(mem);
  });

  app.delete('/api/memories/:id', (c) => {
    const store = getStore();
    const idx = store.memories.findIndex((m) => m.id === c.req.param('id'));
    if (idx === -1) return c.json({ error: 'Not found' }, 404);
    const deleted = store.memories[idx];
    store.memories.splice(idx, 1);
    logActivity('memory', `Memory deleted`, deleted.content.slice(0, 100), { agentId: deleted.agentId, metadata: { tier: deleted.tier, memoryId: deleted.id } });
    saveStore();
    return c.json({ ok: true });
  });

  app.delete('/api/agents/:id/memories', (c) => {
    const store = getStore();
    const agentId = c.req.param('id');
    const tier = c.req.query('tier');
    if (!tier) return c.json({ error: 'tier required' }, 400);
    store.memories = store.memories.filter((m) => !(m.agentId === agentId && m.tier === tier));
    saveStore();
    return c.json({ ok: true });
  });

  app.get('/api/agents/:id/memories/export', (c) => {
    const store = getStore();
    const mems = store.memories.filter((m) => m.agentId === c.req.param('id'));
    return c.json(mems);
  });

  app.post('/api/agents/:id/memories/import', async (c) => {
    const store = getStore();
    const agentId = c.req.param('id');
    const body = await c.req.json<Array<{ tier: string; content: string }>>();
    for (const item of body) {
      store.memories.push({
        id: crypto.randomUUID(), agentId, tier: item.tier as 'working' | 'short-term' | 'long-term',
        content: item.content, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }
    saveStore();
    return c.json({ imported: body.length });
  });
}
