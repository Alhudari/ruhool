import type { Hono } from 'hono';
import type { ConvRecord, StoreData } from '../store/types.js';

export interface ConversationRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

/**
 * Conversations CRUD + participants routes (REL-01 stage 2d).
 *
 * GET    /api/conversations
 * POST   /api/conversations
 * GET    /api/conversations/:id/messages
 * GET    /api/conversations/:id/participants
 * POST   /api/conversations/:id/participants
 * DELETE /api/conversations/:id/participants/:agentId
 */
export function registerConversationRoutes(app: Hono, deps: ConversationRoutesDeps): void {
  const { getStore, saveStore } = deps;

  app.get('/api/conversations', (c) => {
    const store = getStore();
    const includeArchived = c.req.query('archived') === 'true';
    let list = [...store.conversations];
    if (!includeArchived) list = list.filter((cv) => !cv.archived);
    const sorted = list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return c.json(sorted.slice(0, 50));
  });

  app.post('/api/conversations', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ title?: string; language?: string }>();
    const conv: ConvRecord = {
      id: crypto.randomUUID(), title: body.title || 'New conversation',
      language: body.language || 'en', archived: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    store.conversations.push(conv);
    saveStore();
    return c.json(conv, 201);
  });

  app.get('/api/conversations/:id/messages', (c) => {
    const store = getStore();
    const msgs = store.messages.filter((m) => m.conversationId === c.req.param('id'))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return c.json(msgs);
  });

  app.get('/api/conversations/:id/participants', (c) => {
    const store = getStore();
    const conv = store.conversations.find((cv) => cv.id === c.req.param('id'));
    if (!conv) return c.json({ error: 'Conversation not found' }, 404);
    // Return the stored list as-is. Do NOT auto-prepend 'manager' —
    // that caused الراعي to appear in every conversation even when the
    // user explicitly wanted a solo specialist chat.
    return c.json(conv.participants ?? []);
  });

  app.post('/api/conversations/:id/participants', async (c) => {
    const store = getStore();
    const conv = store.conversations.find((cv) => cv.id === c.req.param('id'));
    if (!conv) return c.json({ error: 'Conversation not found' }, 404);
    const body = await c.req.json<{ agentId: string }>();
    if (!conv.participants) conv.participants = [];
    if (!conv.participants.includes(body.agentId)) {
      conv.participants.push(body.agentId);
      conv.updatedAt = new Date().toISOString();
      saveStore();
    }
    return c.json(conv.participants);
  });

  app.delete('/api/conversations/:id/participants/:agentId', (c) => {
    const store = getStore();
    const conv = store.conversations.find((cv) => cv.id === c.req.param('id'));
    if (!conv) return c.json({ error: 'Conversation not found' }, 404);
    const agentId = c.req.param('agentId');
    if (!conv.participants) conv.participants = [];
    conv.participants = conv.participants.filter((p) => p !== agentId);
    // No auto-refill with 'manager' — allow empty participant list so
    // the user can truly clear a conversation's roster.
    conv.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(conv.participants);
  });
}
