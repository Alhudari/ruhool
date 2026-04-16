import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';
import {
  memoryList, graphFind, graphUpsertNode, graphUpsertEdge,
  type StoreLike as AgentOSStore,
} from '../agent-os.js';

export interface AgentOSRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

/**
 * Agent OS memory + graph routes (REL-01 stage 2d).
 *
 * Memory:
 * GET    /api/memory/:conversationId
 * POST   /api/memory/:conversationId
 * DELETE /api/memory/:conversationId/:key
 *
 * Graph:
 * GET    /api/graph
 * POST   /api/graph/nodes
 * POST   /api/graph/edges
 * DELETE /api/graph/nodes/:id
 * DELETE /api/graph/edges/:id
 * GET    /api/graph/find
 */
export function registerAgentOSRoutes(app: Hono, deps: AgentOSRoutesDeps): void {
  const { getStore, saveStore } = deps;

  app.get('/api/memory/:conversationId', (c) => {
    const store = getStore();
    const convId = c.req.param('conversationId');
    return c.json({ entries: memoryList(store as unknown as AgentOSStore, convId) });
  });

  app.post('/api/memory/:conversationId', async (c) => {
    const store = getStore();
    const convId = c.req.param('conversationId');
    const body = await c.req.json<{ key: string; value: string; agentId?: string }>();
    if (!body.key) return c.json({ error: 'key required' }, 400);
    const { memorySet } = await import('../agent-os.js');
    memorySet(store as unknown as AgentOSStore, convId, body.key, body.value, body.agentId);
    saveStore();
    return c.json({ ok: true });
  });

  app.delete('/api/memory/:conversationId/:key', (c) => {
    const store = getStore();
    const convId = c.req.param('conversationId');
    const key = c.req.param('key');
    const entries = (store.conversationMemory?.[convId]) || [];
    const idx = entries.findIndex((e) => e.key === key);
    if (idx < 0) return c.json({ error: 'not found' }, 404);
    entries.splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });

  app.get('/api/graph', (c) => {
    const store = getStore();
    return c.json({
      nodes: store.graphNodes || [],
      edges: store.graphEdges || [],
    });
  });

  app.post('/api/graph/nodes', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ type: string; label: string; props?: Record<string, string | number | boolean> }>();
    if (!body.label || !body.type) return c.json({ error: 'type and label required' }, 400);
    const node = graphUpsertNode(store as unknown as AgentOSStore, {
      type: body.type as 'person' | 'project' | 'organization' | 'agreement' | 'appointment' | 'topic' | 'other',
      label: body.label,
      props: body.props,
      confidence: 1.0,
    });
    saveStore();
    return c.json({ node });
  });

  app.post('/api/graph/edges', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ from: string; to: string; relation: string; props?: Record<string, string | number | boolean> }>();
    if (!body.from || !body.to || !body.relation) return c.json({ error: 'from, to, relation required' }, 400);
    const edge = graphUpsertEdge(store as unknown as AgentOSStore, {
      from: body.from, to: body.to, relation: body.relation, props: body.props, confidence: 1.0,
    });
    saveStore();
    return c.json({ edge });
  });

  app.delete('/api/graph/nodes/:id', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    if (!store.graphNodes) return c.json({ error: 'not found' }, 404);
    const idx = store.graphNodes.findIndex((n) => n.id === id);
    if (idx < 0) return c.json({ error: 'not found' }, 404);
    store.graphNodes.splice(idx, 1);
    store.graphEdges = (store.graphEdges || []).filter((e) => e.from !== id && e.to !== id);
    saveStore();
    return c.json({ ok: true });
  });

  app.delete('/api/graph/edges/:id', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    if (!store.graphEdges) return c.json({ error: 'not found' }, 404);
    const idx = store.graphEdges.findIndex((e) => e.id === id);
    if (idx < 0) return c.json({ error: 'not found' }, 404);
    store.graphEdges.splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });

  app.get('/api/graph/find', (c) => {
    const store = getStore();
    const type = c.req.query('type');
    const label = c.req.query('label');
    const near = c.req.query('near');
    const nodes = graphFind(store as unknown as AgentOSStore, { type, label, near });
    return c.json({ nodes });
  });
}
