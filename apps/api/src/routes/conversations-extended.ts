import type { Hono } from 'hono';
import crypto from 'node:crypto';
import type { StoreData, ConvRecord, StudioProjectData, MemoryRecord, MsgRecord } from '../store/types.js';

export interface ConversationsExtendedDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  logActivity: (kind: string, title: string, details: string, extra?: { agentId?: string; metadata?: Record<string, unknown> }) => void;
  ensureProjectsArray: () => void;
  generateSummary: (messages: MsgRecord[]) => string | null;
}

/**
 * Extended conversation handlers (beyond the simple CRUD in routes/conversations.ts):
 *   POST   /api/conversations/:id/summarize
 *   PUT    /api/conversations/:id/studio
 *   PUT    /api/conversations/:id/archive
 *   DELETE /api/conversations/:id
 *   PUT    /api/conversations/:id/project
 *   PUT    /api/conversations/:id/pin
 *   POST   /api/conversations/bulk
 *   GET    /api/store/pinned
 *   GET    /api/conversations/:id/deletion-impact
 */
export function registerConversationsExtendedRoutes(app: Hono, deps: ConversationsExtendedDeps): void {
  const { getStore, saveStore, logActivity, ensureProjectsArray, generateSummary } = deps;

  app.post('/api/conversations/:id/summarize', (c) => {
    const store = getStore();
    const convId = c.req.param('id');
    const msgs = store.messages.filter((m) => m.conversationId === convId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const summary = generateSummary(msgs);
    if (!summary) return c.json({ error: 'Not enough messages to summarize' }, 400);

    const agentId = [...msgs].reverse().find((m) => m.agentId)?.agentId || 'manager';
    const memory: MemoryRecord = {
      id: crypto.randomUUID(),
      agentId,
      tier: 'short-term',
      content: summary,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.memories.push(memory);
    saveStore();
    return c.json({ summary, memory });
  });

  app.put('/api/conversations/:id/studio', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const conv = store.conversations.find((cv) => cv.id === id);
    if (!conv) return c.json({ error: 'Conversation not found' }, 404);
    const body = await c.req.json<StudioProjectData>();
    conv.studioProject = {
      ...conv.studioProject,
      storyboard: body.storyboard ?? conv.studioProject?.storyboard,
      code: body.code ?? conv.studioProject?.code,
      format: body.format ?? conv.studioProject?.format,
      duration: body.duration ?? conv.studioProject?.duration,
      archived: body.archived ?? conv.studioProject?.archived,
    };
    conv.updatedAt = new Date().toISOString();
    saveStore();
    logActivity('system', 'Studio project saved', `Conversation: ${conv.title}`, { agentId: 'creative' });
    return c.json({ ok: true, studioProject: conv.studioProject });
  });

  app.put('/api/conversations/:id/archive', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const conv = store.conversations.find((cv) => cv.id === id);
    if (!conv) return c.json({ error: 'Conversation not found' }, 404);
    const body = await c.req.json().catch(() => ({}));
    const archived = body.archived !== false;
    conv.archived = archived;
    if (conv.studioProject) conv.studioProject.archived = archived;
    conv.updatedAt = new Date().toISOString();
    saveStore();
    logActivity('system', archived ? 'Conversation archived' : 'Conversation unarchived', `Conversation: ${conv.title}`, { metadata: { conversationId: id } });
    return c.json({ ok: true });
  });

  app.delete('/api/conversations/:id', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const idx = store.conversations.findIndex((cv) => cv.id === id);
    if (idx === -1) return c.json({ error: 'Conversation not found' }, 404);
    const conv = store.conversations[idx];
    store.conversations.splice(idx, 1);
    store.messages = store.messages.filter((m) => m.conversationId !== id);
    saveStore();
    logActivity('system', 'Conversation deleted', `Conversation: ${conv.title}`, { metadata: { conversationId: id } });
    return c.json({ ok: true });
  });

  app.put('/api/conversations/:id/project', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const body = await c.req.json<{ projectId: string | null }>();
    const cv = (store.conversations || []).find((x: ConvRecord) => x.id === id);
    if (!cv) return c.json({ error: 'not found' }, 404);
    (cv as { projectId?: string | null }).projectId = body.projectId;
    saveStore();
    return c.json(cv);
  });

  app.put('/api/conversations/:id/pin', async (c) => {
    const store = getStore() as StoreData & { pinnedConversations?: string[] };
    const id = c.req.param('id');
    const body = await c.req.json<{ pinned: boolean }>();
    ensureProjectsArray();
    const set = new Set(store.pinnedConversations as string[]);
    if (body.pinned) set.add(id); else set.delete(id);
    store.pinnedConversations = Array.from(set);
    saveStore();
    return c.json({ ok: true });
  });

  app.post('/api/conversations/bulk', async (c) => {
    const store = getStore() as StoreData & { pinnedConversations?: string[] };
    const body = await c.req.json<{ ids: string[]; action: 'archive' | 'unarchive' | 'delete' | 'deep-delete' | 'move-to-project' | 'pin' | 'unpin'; projectId?: string | null }>();
    if (!body.ids?.length) return c.json({ error: 'ids required' }, 400);
    let affected = 0;
    let memoriesDeleted = 0, tasksDeleted = 0, approvalsDeleted = 0;
    ensureProjectsArray();
    const pinSet = new Set(store.pinnedConversations as string[]);
    for (const id of body.ids) {
      const idx = (store.conversations || []).findIndex((x: ConvRecord) => x.id === id);
      if (idx === -1) continue;
      if (body.action === 'archive') (store.conversations as ConvRecord[])[idx].archived = true;
      else if (body.action === 'unarchive') (store.conversations as ConvRecord[])[idx].archived = false;
      else if (body.action === 'pin') pinSet.add(id);
      else if (body.action === 'unpin') pinSet.delete(id);
      else if (body.action === 'move-to-project') (store.conversations as unknown as Array<{ id: string; projectId?: string | null }>)[idx].projectId = body.projectId ?? null;
      else if (body.action === 'delete' || body.action === 'deep-delete') {
        (store.conversations as ConvRecord[]).splice(idx, 1);
        store.messages = (store.messages || []).filter((m) => m.conversationId !== id);
        pinSet.delete(id);
        if (body.action === 'deep-delete') {
          const memBefore = (store.memories || []).length;
          store.memories = (store.memories || []).filter((m: { metadata?: { conversationId?: string } }) => m?.metadata?.conversationId !== id);
          memoriesDeleted += memBefore - (store.memories?.length || 0);
          const tBefore = (store.tasks || []).length;
          store.tasks = (store.tasks || []).filter((t: { metadata?: { conversationId?: string } }) => t?.metadata?.conversationId !== id);
          tasksDeleted += tBefore - (store.tasks?.length || 0);
          const aBefore = (store.approvals || []).length;
          store.approvals = (store.approvals || []).filter((a: { metadata?: { conversationId?: string } }) => a?.metadata?.conversationId !== id);
          approvalsDeleted += aBefore - (store.approvals?.length || 0);
        }
      }
      affected++;
    }
    store.pinnedConversations = Array.from(pinSet);
    saveStore();
    return c.json({ ok: true, affected, memoriesDeleted, tasksDeleted, approvalsDeleted });
  });

  app.get('/api/store/pinned', (c) => {
    const store = getStore() as StoreData & { pinnedConversations?: string[] };
    return c.json({ pinnedConversations: store.pinnedConversations || [] });
  });

  app.get('/api/conversations/:id/deletion-impact', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const memCount = (store.memories || []).filter((m: { metadata?: { conversationId?: string } }) => m?.metadata?.conversationId === id).length;
    const taskCount = (store.tasks || []).filter((t: { metadata?: { conversationId?: string } }) => t?.metadata?.conversationId === id).length;
    const apprCount = (store.approvals || []).filter((a: { metadata?: { conversationId?: string } }) => a?.metadata?.conversationId === id).length;
    const msgCount = (store.messages || []).filter((m) => m.conversationId === id).length;
    return c.json({ messages: msgCount, memories: memCount, tasks: taskCount, approvals: apprCount });
  });
}
