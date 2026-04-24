import type { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { ActivityRecord, CustomAgentRecord, StoreData } from '../store/types.js';
import { BUILTIN_AGENTS } from '../state/builtin-agents.js';

const agentOrgSchema = z.object({
  version: z.number().int().positive().optional(),
  ceo: z.string().min(1),
  departments: z.array(z.object({
    id: z.string().min(1),
    label: z.object({ ar: z.string(), en: z.string() }).optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    manager: z.string().min(1),
    workers: z.array(z.string().min(1)),
  })).max(20),
});

const agentOrgWorkspaceSchema = z.object({
  id: z.string().min(1),
  label: z.object({ ar: z.string(), en: z.string() }).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  ceo: z.string().min(1),
  departments: z.array(z.object({
    id: z.string().min(1),
    label: z.object({ ar: z.string(), en: z.string() }).optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    manager: z.string().min(1),
    workers: z.array(z.string().min(1)),
  })).max(20),
});

const agentOrgV2Schema = z.object({
  workspaces: z.array(agentOrgWorkspaceSchema).min(1).max(10),
  sharedServices: z.array(z.string().min(1)).optional(),
  platformAdmins: z.array(z.string().min(1)).optional(),
});

// ── Agent org (company model) ──────────────────────────────────────
// Editable JSON at data/agent-org.json. Round 4: supports multiple
// workspaces (PhD + Life). Each workspace has its own CEO and department
// structure. Shared services cross workspaces.
export interface AgentOrgDepartment {
  id: string;
  label: { ar: string; en: string };
  icon?: string;
  color?: string;
  manager: string;
  workers: string[];
}
export interface AgentOrgWorkspace {
  id: string;
  label: { ar: string; en: string };
  icon?: string;
  color?: string;
  ceo: string;
  departments: AgentOrgDepartment[];
}
export interface AgentOrg {
  version: number;
  updatedAt: string;
  workspaces: AgentOrgWorkspace[];
  sharedServices?: string[];
  platformAdmins?: string[];
}

function agentOrgPath(dataRoot: string): string {
  return path.join(dataRoot, 'agent-org.json');
}

// In-memory cache — invalidated by the file-watcher in index.ts.
let _orgCache: { dataRoot: string; value: AgentOrg | null; mtimeMs: number } | null = null;
export function invalidateAgentOrgCache(): void { _orgCache = null; }

function readAgentOrg(dataRoot: string): AgentOrg | null {
  const p = agentOrgPath(dataRoot);
  try {
    if (!fs.existsSync(p)) return null;
    const stat = fs.statSync(p);
    if (_orgCache && _orgCache.dataRoot === dataRoot && _orgCache.mtimeMs === stat.mtimeMs) {
      return _orgCache.value;
    }
    const raw = fs.readFileSync(p, 'utf-8');
    const value = JSON.parse(raw) as AgentOrg;
    _orgCache = { dataRoot, value, mtimeMs: stat.mtimeMs };
    return value;
  } catch {
    return null;
  }
}

function writeAgentOrg(dataRoot: string, org: AgentOrg): void {
  const p = agentOrgPath(dataRoot);
  fs.writeFileSync(p, JSON.stringify(org, null, 2), 'utf-8');
}


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
  dataRoot: string;
}

/**
 * Agents + Custom Agents CRUD routes (REL-01 stage 2d).
 *
 * GET    /api/agents
 * PUT    /api/agents/:id/prompt
 * PUT    /api/agents/:id/name
 * GET    /api/custom-agents
 * POST   /api/custom-agents
 * GET    /api/custom-agents/:id
 * PUT    /api/custom-agents/:id
 * DELETE /api/custom-agents/:id
 * PUT    /api/custom-agents/:id/archive
 */
export function registerAgentRoutes(app: Hono, deps: AgentRoutesDeps): void {
  const { getStore, saveStore, logActivity, builtinSystemPrompts, dataRoot } = deps;

  app.get('/api/agents', (c) => {
    const store = getStore();
    const includeArchived = c.req.query('archived') === 'true';
    const overrides = store.agentNameOverrides || {};
    // Apply name overrides without mutating BUILTIN_AGENTS — overrides are
    // stored per-tenant/user in the store and resolved at read time.
    const builtinsResolved = BUILTIN_AGENTS.map((agent) => {
      const override = overrides[agent.id];
      return override ? { ...agent, name: override } : agent;
    });
    const customSrc = (store.customAgents || []).filter((a) => includeArchived || !a.archived);
    const customMapped = customSrc.map((a) => ({
      id: 'custom-' + a.id, moduleId: 'custom-' + a.id, name: a.name,
      description: { en: a.systemPrompt.slice(0, 80), ar: a.systemPrompt.slice(0, 80) },
      icon: a.icon, color: a.color, builtIn: false, model: a.model,
      featured: a.featured || false,
      archived: !!a.archived,
    }));
    return c.json([...builtinsResolved, ...customMapped]);
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

  app.put('/api/agents/:id/name', async (c) => {
    const store = getStore();
    const agentId = c.req.param('id');
    const body = await c.req.json<{ en: string; ar: string }>();
    if (!body || typeof body.en !== 'string' || typeof body.ar !== 'string') {
      return c.json({ error: 'en and ar are required strings' }, 400);
    }
    const en = body.en.trim();
    const ar = body.ar.trim();
    if (!en || !ar) return c.json({ error: 'en and ar must be non-empty' }, 400);

    const known = BUILTIN_AGENTS.find((a) => a.id === agentId);
    if (!known) return c.json({ error: 'Unknown builtin agent id' }, 404);

    if (!store.agentNameOverrides) store.agentNameOverrides = {};
    store.agentNameOverrides[agentId] = { en, ar };
    saveStore();
    logActivity('system', `Built-in agent name updated: ${agentId}`, `${en} / ${ar}`, { agentId });
    return c.json({ ok: true, agentId, name: { en, ar } });
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

  // ── Agent org (departments + managers) ───────────────────────────
  // The org is the source of truth for who manages whom. It's a flat
  // JSON file so the user can also edit it directly in their vault-like
  // flow. Missing/malformed file returns 404 so the UI can show the
  // legacy flat view until one is created.
  app.get('/api/agent-org', (c) => {
    const org = readAgentOrg(dataRoot);
    if (!org) return c.json({ error: 'Agent org not configured' }, 404);
    const store = getStore();
    const overrides = store.agentNameOverrides || {};
    const customAgents = (store.customAgents || []).filter((a) => !a.archived);
    const allAgents = [
      ...BUILTIN_AGENTS.map((a) => ({ id: a.id, name: overrides[a.id] ?? a.name, builtIn: true })),
      ...customAgents.map((a) => ({ id: 'custom-' + a.id, name: a.name, builtIn: false })),
    ];
    const nameMap = Object.fromEntries(allAgents.map((a) => [a.id, a.name]));

    // Back-compat: if the file is still in v1 single-CEO shape, surface
    // it as a single pseudo-workspace so older clients keep working.
    const legacy = (org as unknown as { ceo?: string; departments?: AgentOrgDepartment[] });
    const workspaces: AgentOrgWorkspace[] = Array.isArray(org.workspaces)
      ? org.workspaces
      : (legacy.ceo && legacy.departments
        ? [{ id: 'phd', label: { ar: 'الدكتوراه', en: 'PhD' }, ceo: legacy.ceo, departments: legacy.departments }]
        : []);

    const resolvedWorkspaces = workspaces.map((ws) => ({
      id: ws.id,
      label: ws.label,
      icon: ws.icon,
      color: ws.color,
      ceo: { id: ws.ceo, name: nameMap[ws.ceo] ?? null, known: ws.ceo in nameMap },
      departments: ws.departments.map((d) => ({
        ...d,
        managerName: nameMap[d.manager] ?? null,
        workerNames: d.workers.map((w) => ({ id: w, name: nameMap[w] ?? null, known: w in nameMap })),
        managerKnown: d.manager in nameMap,
      })),
    }));

    const assignedIds = new Set<string>([
      ...workspaces.flatMap((ws) => [
        ws.ceo,
        ...ws.departments.flatMap((d) => [d.manager, ...d.workers]),
      ]),
      ...(org.sharedServices ?? []),
      ...(org.platformAdmins ?? []),
    ]);

    return c.json({
      org,
      resolved: {
        workspaces: resolvedWorkspaces,
        sharedServices: (org.sharedServices ?? []).map((id) => ({ id, name: nameMap[id] ?? null, known: id in nameMap })),
        platformAdmins: (org.platformAdmins ?? []).map((id) => ({ id, name: nameMap[id] ?? null, known: id in nameMap })),
        unassigned: allAgents
          .filter((a) => !assignedIds.has(a.id))
          .map((a) => ({ id: a.id, name: a.name, builtIn: a.builtIn })),
      },
    });
  });

  app.put('/api/agent-org', async (c) => {
    const raw = await c.req.json().catch(() => null);
    if (!raw || typeof raw !== 'object') {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    const store = getStore();
    const knownIds = new Set<string>([
      ...BUILTIN_AGENTS.map((a) => a.id),
      ...(store.customAgents || []).map((a) => 'custom-' + a.id),
    ]);

    const checkMissing = (org: AgentOrg): string[] => {
      const missing: string[] = [];
      for (const ws of org.workspaces) {
        if (!knownIds.has(ws.ceo)) missing.push(ws.ceo);
        for (const d of ws.departments) {
          if (!knownIds.has(d.manager)) missing.push(d.manager);
          for (const w of d.workers) if (!knownIds.has(w)) missing.push(w);
        }
      }
      return missing;
    };

    let next: AgentOrg;
    const isV2 = Array.isArray((raw as { workspaces?: unknown }).workspaces);

    if (isV2) {
      // v2 path: validate with Zod schema before any casting
      const parsed = agentOrgV2Schema.safeParse(raw);
      if (!parsed.success) {
        return c.json({ error: 'Invalid agent-org v2 payload', issues: parsed.error.issues }, 400);
      }
      const body = parsed.data;
      next = {
        version: 2,
        updatedAt: new Date().toISOString(),
        workspaces: body.workspaces.map((ws) => ({
          id: ws.id,
          label: ws.label ?? { ar: ws.id, en: ws.id },
          icon: ws.icon,
          color: ws.color,
          ceo: ws.ceo,
          departments: ws.departments.map((d) => ({
            id: d.id,
            label: d.label ?? { ar: d.id, en: d.id },
            icon: d.icon,
            color: d.color,
            manager: d.manager,
            workers: d.workers,
          })),
        })),
        sharedServices: body.sharedServices ?? [],
        platformAdmins: body.platformAdmins ?? [],
      };
    } else {
      // v1 legacy path: validate + registry check + merge into existing org
      const parsed = agentOrgSchema.safeParse(raw);
      if (!parsed.success) {
        return c.json({
          error: 'Invalid agent-org payload',
          messageAr: 'هيكل المؤسسة غير صالح',
          issues: parsed.error.issues,
        }, 400);
      }
      const body = parsed.data;
      const phdWorkspace: AgentOrgWorkspace = {
        id: 'phd',
        label: { ar: 'الدكتوراه', en: 'PhD' },
        ceo: body.ceo,
        departments: body.departments.map((d) => ({
          id: d.id,
          label: d.label ?? { ar: d.id, en: d.id },
          icon: d.icon,
          color: d.color,
          manager: d.manager,
          workers: d.workers,
        })),
      };
      // Merge: replace phd workspace, preserve all others (life, etc.)
      const existing = readAgentOrg(dataRoot);
      const otherWorkspaces = (existing?.workspaces ?? []).filter((ws) => ws.id !== 'phd');
      next = {
        version: 2,
        updatedAt: new Date().toISOString(),
        workspaces: [phdWorkspace, ...otherWorkspaces],
        sharedServices: existing?.sharedServices ?? [],
        platformAdmins: existing?.platformAdmins ?? [],
      };
    }

    // Registry check applies to both v1 and v2
    const missing = checkMissing(next);
    if (missing.length > 0) {
      return c.json({ error: 'Unknown agent ids in org', missing }, 400);
    }

    writeAgentOrg(dataRoot, next);
    const deptCount = next.workspaces.reduce((n, ws) => n + ws.departments.length, 0);
    logActivity('system', 'Agent org updated', `workspaces=${next.workspaces.length} depts=${deptCount}`, { metadata: { workspaces: next.workspaces.map((w) => w.id) } });
    return c.json({ ok: true, updatedAt: next.updatedAt });
  });
}
