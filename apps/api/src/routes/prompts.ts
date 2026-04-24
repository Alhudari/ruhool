import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';
import type { PromptVersion } from '../phase2.js';
import { BUILTIN_AGENTS } from '../state/builtin-agents.js';

export interface PromptRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  builtinSystemPrompts: Record<string, string>;
  builtInLibrary?: Array<{ id: string; name: { en: string; ar: string }; type: 'built-in'; prompt: string }>;
}

/**
 * Prompt-version routes (REL-01 stage 2d).
 *
 * GET  /api/prompts/versions/:agentId
 * POST /api/prompts/versions/:agentId
 * POST /api/prompts/versions/:agentId/:version/activate
 */
export function registerPromptRoutes(app: Hono, deps: PromptRoutesDeps): void {
  const { getStore, saveStore, builtinSystemPrompts, builtInLibrary } = deps;

  // ─── Prompts library: every built-in agent (auto-derived from BUILTIN_AGENTS
  // + the runtime BUILTIN_SYSTEM_PROMPTS map) plus all custom agents. The
  // hard-coded `builtInLibrary` is preserved as a fallback for any agent that
  // doesn't have a runtime prompt entry.
  app.get('/api/prompts', (c) => {
    const store = getStore();
    const fallback = new Map(builtInLibrary?.map((p) => [p.id, p]) ?? []);
    const builtIn = BUILTIN_AGENTS.map((a) => ({
      id: a.id,
      name: a.name,
      type: 'built-in' as const,
      prompt: builtinSystemPrompts[a.id] ?? fallback.get(a.id)?.prompt ?? '',
    }));
    const custom = store.customAgents.map((a) => ({
      id: a.id, name: a.name, type: 'custom' as const, prompt: a.systemPrompt,
    }));
    return c.json([...builtIn, ...custom]);
  });

  app.get('/api/prompts/versions/:agentId', (c) => {
    const store = getStore();
    const list = (store.promptVersions || []).filter((p) => p.agentId === c.req.param('agentId'));
    return c.json({ versions: list });
  });

  app.post('/api/prompts/versions/:agentId', async (c) => {
    const store = getStore();
    const agentId = c.req.param('agentId');
    const body = await c.req.json<{ prompt: string; reason?: string; activate?: boolean }>();
    if (!body.prompt) return c.json({ error: 'prompt required' }, 400);
    if (!store.promptVersions) store.promptVersions = [];
    const existing = store.promptVersions.filter((p) => p.agentId === agentId);
    const nextV = Math.max(0, ...existing.map((e) => e.version)) + 1;
    if (body.activate) existing.forEach((e) => { e.isActive = false; });
    const rec: PromptVersion = {
      id: crypto.randomUUID(), agentId, version: nextV, prompt: body.prompt,
      isActive: !!body.activate, createdBy: 'manual',
      reason: body.reason,
      createdAt: new Date().toISOString(),
    };
    store.promptVersions.push(rec);
    if (body.activate) builtinSystemPrompts[agentId] = body.prompt;
    saveStore();
    return c.json({ version: rec });
  });

  app.post('/api/prompts/versions/:agentId/:version/activate', (c) => {
    const store = getStore();
    const agentId = c.req.param('agentId');
    const version = parseInt(c.req.param('version'), 10);
    const target = (store.promptVersions || []).find((p) => p.agentId === agentId && p.version === version);
    if (!target) return c.json({ error: 'version not found' }, 404);
    (store.promptVersions || []).forEach((p) => { if (p.agentId === agentId) p.isActive = (p.version === version); });
    builtinSystemPrompts[agentId] = target.prompt;
    saveStore();
    return c.json({ ok: true, activated: version });
  });
}
