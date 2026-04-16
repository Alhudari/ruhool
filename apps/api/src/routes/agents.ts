import type { Hono } from 'hono';
import type { ActivityRecord, CustomAgentRecord, StoreData } from '../store/types.js';
import { BUILTIN_AGENTS } from '../state/builtin-agents.js';

export type LogActivity = (
  type: ActivityRecord['type'],
  action: string,
  details: string,
  opts?: { agentId?: string; metadata?: Record<string, unknown>; requestId?: string | null }
) => ActivityRecord;

export interface AgentRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  logActivity: LogActivity;
  builtinSystemPrompts: Record<string, string>;
}

/**
 * Agents + Custom Agents CRUD routes (REL-01 stage 2d).
 *
 * GET    /api/agents
 * PUT    /api/agents/:id/prompt
 * GET    /api/custom-agents
 * POST   /api/custom-agents
 * GET    /api/custom-agents/:id
 * PUT    /api/custom-agents/:id
 * DELETE /api/custom-agents/:id
 * PUT    /api/custom-agents/:id/archive
 */
export function registerAgentRoutes(app: Hono, deps: AgentRoutesDeps): void {
  const { getStore, saveStore, logActivity, builtinSystemPrompts } = deps;

  app.get('/api/agents', (c) => {
    const store = getStore();
    const includeArchived = c.req.query('archived') === 'true';
    const customSrc = (store.customAgents || []).filter((a) => includeArchived || !a.archived);
    const customMapped = customSrc.map((a) => ({
      id: 'custom-' + a.id, moduleId: 'custom-' + a.id, name: a.name,
      description: { en: a.systemPrompt.slice(0, 80), ar: a.systemPrompt.slice(0, 80) },
      icon: a.icon, color: a.color, builtIn: false, model: a.model,
      featured: a.featured || false,
      archived: !!a.archived,
    }));
    return c.json([...BUILTIN_AGENTS, ...customMapped]);
  });

  app.put('/api/agents/:id/prompt', async (c) => {
    const store = getStore();
    const agentId = c.req.param('id');
    const body = await c.req.json<{ prompt: string }>();
    if (!body.prompt) return c.json({ error: 'prompt required' }, 400);

    if (!store.promptOverrides) store.promptOverrides = {};
    store.promptOverrides[agentId] = body.prompt;

    builtinSystemPrompts[agentId] = body.prompt;

    saveStore();
    logActivity('system', `Built-in agent prompt updated: ${agentId}`, body.prompt.slice(0, 100), { agentId });
    return c.json({ ok: true, agentId });
  });

  app.get('/api/custom-agents', (c) => {
    const store = getStore();
    const includeArchived = c.req.query('archived') === 'true';
    const list = (store.customAgents || []).filter((a) => includeArchived || !a.archived);
    return c.json(list);
  });

  app.post('/api/custom-agents', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ name: { en: string; ar: string }; systemPrompt: string; icon?: string; color?: string; model?: string }>();
    const agent: CustomAgentRecord = {
      id: crypto.randomUUID(), name: body.name, systemPrompt: body.systemPrompt,
      icon: body.icon || 'bot', color: body.color || 'gray', skills: [], tools: [],
      model: body.model || 'claude-sonnet-4-6', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    if (!store.customAgents) store.customAgents = [];
    store.customAgents.push(agent);
    logActivity('agent_created', `Agent created: ${agent.name.en}`, agent.systemPrompt.slice(0, 150), { agentId: 'custom-' + agent.id, metadata: { agentName: agent.name } });
    saveStore();
    return c.json(agent, 201);
  });

  app.get('/api/custom-agents/:id', (c) => {
    const store = getStore();
    const agent = store.customAgents.find(a => a.id === c.req.param('id'));
    if (!agent) return c.json({ error: 'Not found' }, 404);
    return c.json(agent);
  });

  app.put('/api/custom-agents/:id', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const agent = store.customAgents.find(a => a.id === id);
    if (!agent) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json();
    if (body.name) agent.name = body.name;
    if (body.systemPrompt !== undefined) agent.systemPrompt = body.systemPrompt;
    if (body.icon) agent.icon = body.icon;
    if (body.color) agent.color = body.color;
    if (body.model) agent.model = body.model;
    if (body.featured !== undefined) agent.featured = body.featured;
    agent.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(agent);
  });

  app.delete('/api/custom-agents/:id', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    if (!store.customAgents) return c.json({ error: 'Not found' }, 404);
    const idx = store.customAgents.findIndex((a) => a.id === id);
    if (idx === -1) return c.json({ error: 'Not found' }, 404);
    const deleted = store.customAgents[idx];
    store.customAgents.splice(idx, 1);
    logActivity('agent_deleted', `Agent deleted: ${deleted.name.en}`, `ID: ${deleted.id}`, { agentId: 'custom-' + deleted.id, metadata: { agentName: deleted.name } });
    saveStore();
    return c.json({ ok: true });
  });

  app.put('/api/custom-agents/:id/archive', async (c) => {
    const store = getStore();
    const agent = (store.customAgents || []).find(a => a.id === c.req.param('id'));
    if (!agent) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json().catch(() => ({}));
    agent.archived = body.archived !== false;
    agent.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true });
  });
}
