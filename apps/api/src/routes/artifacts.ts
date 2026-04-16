import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';
import {
  createArtifact, updateArtifact, artifactByConversation,
  addRating, agentStats,
  type Phase2StoreLike, type Artifact,
} from '../phase2.js';

export interface ArtifactRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

/**
 * Artifacts + Ratings routes (REL-01 stage 2d).
 *
 * Artifacts:
 * GET    /api/artifacts
 * POST   /api/artifacts
 * GET    /api/artifacts/:id
 * PUT    /api/artifacts/:id
 * DELETE /api/artifacts/:id
 *
 * Ratings:
 * POST /api/ratings
 * GET  /api/ratings/agent/:agentId
 * GET  /api/ratings/summary
 */
export function registerArtifactRoutes(app: Hono, deps: ArtifactRoutesDeps): void {
  const { getStore, saveStore } = deps;

  app.get('/api/artifacts', (c) => {
    const store = getStore();
    const convId = c.req.query('conversationId');
    const list = convId
      ? artifactByConversation(store as unknown as Phase2StoreLike, convId)
      : (store.artifacts || []).filter((a) => !a.archived);
    return c.json({ artifacts: list });
  });

  app.post('/api/artifacts', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ title: string; kind?: Artifact['kind']; language?: string; content?: string; conversationId?: string }>();
    if (!body.title) return c.json({ error: 'title required' }, 400);
    const art = createArtifact(store as unknown as Phase2StoreLike, { ...body, editedBy: 'user' });
    saveStore();
    return c.json({ artifact: art });
  });

  app.get('/api/artifacts/:id', (c) => {
    const store = getStore();
    const a = (store.artifacts || []).find((x) => x.id === c.req.param('id'));
    if (!a) return c.json({ error: 'not found' }, 404);
    return c.json({ artifact: a });
  });

  app.put('/api/artifacts/:id', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ content: string; comment?: string; editedBy?: string }>();
    const a = updateArtifact(store as unknown as Phase2StoreLike, c.req.param('id'), {
      content: body.content, comment: body.comment,
      editedBy: body.editedBy === 'user' ? 'user' : (body.editedBy || 'user'),
    });
    if (!a) return c.json({ error: 'not found' }, 404);
    saveStore();
    return c.json({ artifact: a });
  });

  app.delete('/api/artifacts/:id', (c) => {
    const store = getStore();
    const a = (store.artifacts || []).find((x) => x.id === c.req.param('id'));
    if (!a) return c.json({ error: 'not found' }, 404);
    a.archived = true;
    saveStore();
    return c.json({ ok: true });
  });

  app.post('/api/ratings', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ messageId: string; agentId: string; rating: 'good' | 'bad'; comment?: string; model?: string; messageLength?: number }>();
    if (!body.messageId || !body.agentId || !body.rating) return c.json({ error: 'messageId, agentId, rating required' }, 400);
    const rec = addRating(store as unknown as Phase2StoreLike, body);
    saveStore();
    return c.json({ rating: rec });
  });

  app.get('/api/ratings/agent/:agentId', (c) => {
    const store = getStore();
    const stats = agentStats(store as unknown as Phase2StoreLike, c.req.param('agentId'));
    const recent = (store.messageRatings || []).filter((r) => r.agentId === c.req.param('agentId')).slice(-20);
    return c.json({ stats, recent });
  });

  app.get('/api/ratings/summary', (c) => {
    const store = getStore();
    const byAgent: Record<string, ReturnType<typeof agentStats>> = {};
    const agentIds = new Set((store.messageRatings || []).map((r) => r.agentId));
    for (const id of agentIds) byAgent[id] = agentStats(store as unknown as Phase2StoreLike, id);
    return c.json({ byAgent });
  });
}
