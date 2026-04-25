/**
 * Architect action parser + approval executor — extracted from the god-file
 * (index.ts) as part of REL-01 stage 2d.
 *
 * Use:
 *   const actions = createArchitectActions({ getStore, saveStore, logActivity });
 *   actions.parse(response, agentId);
 *   actions.execute(approval);
 *
 * No module-level state; all side-effects go through injected deps.
 */
import crypto from 'node:crypto';
import type {
  StoreData,
  ApprovalRecord,
  ConvRecord,
  CustomAgentRecord,
  MemoryRecord,
  ActivityRecord,
} from '../../store/types.js';
import type { ProjectRecord } from '../../routes/projects.js';

export interface ArchitectActionsDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  logActivity: (
    type: ActivityRecord['type'],
    action: string,
    details: string,
    opts?: { agentId?: string; metadata?: Record<string, unknown>; requestId?: string | null },
  ) => ActivityRecord | void;
}

export interface ArchitectActions {
  parse: (response: string, agentId: string) => ApprovalRecord[];
  execute: (approval: ApprovalRecord) => { ok: boolean; error?: string };
}

export function createArchitectActions(deps: ArchitectActionsDeps): ArchitectActions {
  const { getStore, saveStore, logActivity } = deps;

  function parse(response: string, agentId: string): ApprovalRecord[] {
    const store = getStore();
    const approvals: ApprovalRecord[] = [];
    if (!store.approvals) store.approvals = [];

    const createMatch = response.match(/\[ACTION:CREATE_AGENT\]\s*```(?:json)?\s*([\s\S]*?)```/);
    if (createMatch) {
      try {
        const payload = JSON.parse(createMatch[1]);
        approvals.push({
          id: crypto.randomUUID(),
          type: 'create_agent',
          status: 'pending',
          requestedBy: agentId,
          title: { en: `Create agent: ${payload.name?.en || 'New'}`, ar: `إنشاء وكيل: ${payload.name?.ar || 'جديد'}` },
          description: payload.systemPrompt?.slice(0, 200) || '',
          payload,
          createdAt: new Date().toISOString(),
        });
      } catch { /* skip malformed */ }
    }

    const updateMatches = response.matchAll(/\[ACTION:UPDATE_AGENT:([^\]]+)\]\s*```(?:json)?\s*([\s\S]*?)```/g);
    for (const match of updateMatches) {
      try {
        const targetId = match[1];
        const payload = JSON.parse(match[2]);
        approvals.push({
          id: crypto.randomUUID(),
          type: 'update_agent',
          status: 'pending',
          requestedBy: agentId,
          title: { en: `Update agent: ${targetId}`, ar: `تعديل وكيل: ${targetId}` },
          description: JSON.stringify(payload).slice(0, 200),
          payload: { ...payload, targetAgentId: targetId },
          createdAt: new Date().toISOString(),
        });
      } catch { /* skip malformed */ }
    }

    const deleteMatches = response.matchAll(/\[ACTION:DELETE_AGENT:([^\]]+)\]/g);
    for (const match of deleteMatches) {
      const targetId = match[1];
      approvals.push({
        id: crypto.randomUUID(),
        type: 'delete_agent',
        status: 'pending',
        requestedBy: agentId,
        title: { en: `Delete agent: ${targetId}`, ar: `حذف وكيل: ${targetId}` },
        description: `Delete agent ${targetId}`,
        payload: { targetAgentId: targetId },
        createdAt: new Date().toISOString(),
      });
    }

    const memMatches = response.matchAll(/\[ACTION:UPDATE_MEMORY:([^\]]+)\]\s*```(?:[\w]*)?\s*([\s\S]*?)```/g);
    for (const match of memMatches) {
      const targetId = match[1];
      const content = match[2].trim();
      approvals.push({
        id: crypto.randomUUID(),
        type: 'update_memory',
        status: 'pending',
        requestedBy: agentId,
        title: { en: `Update memory: ${targetId}`, ar: `تعديل ذاكرة: ${targetId}` },
        description: content.slice(0, 200),
        payload: { targetAgentId: targetId, content },
        createdAt: new Date().toISOString(),
      });
    }

    for (const approval of approvals) {
      store.approvals.push(approval);
      logActivity('approval', `Approval requested: ${approval.title.en}`, approval.description, { agentId, metadata: { approvalId: approval.id, type: approval.type } });
    }
    if (approvals.length > 0) saveStore();
    return approvals;
  }

  function execute(approval: ApprovalRecord): { ok: boolean; error?: string } {
    const store = getStore() as StoreData & Record<string, unknown>;
    try {
      switch (approval.type) {
        case 'create_task_category': {
          const name = (approval.payload as { name?: string }).name;
          if (!name) return { ok: false, error: 'name required' };
          if (!store.taskCategories) store.taskCategories = [];
          const cats = store.taskCategories as unknown as { id: string; en: string; ar: string }[];
          if (!cats.find(c => c.id === name || c.en === name)) {
            cats.push({ id: name.toLowerCase().replace(/\s+/g, '-'), en: name, ar: name });
          }
          saveStore();
          return { ok: true };
        }
        case 'rename_task_category': {
          const p = approval.payload as { oldName?: string; newName?: string };
          if (!p.oldName || !p.newName) return { ok: false, error: 'oldName + newName required' };
          for (const t of (store.tasks || [])) { if (t.list === p.oldName) t.list = p.newName; }
          if (Array.isArray(store.taskCategories)) {
            store.taskCategories = (store.taskCategories as unknown as { id: string; en: string; ar: string }[])
              .map((c) => c.id === p.oldName ? { ...c, id: p.newName!, en: p.newName! } : c);
          }
          saveStore();
          return { ok: true };
        }
        case 'archive_conversation': {
          const id = (approval.payload as { conversationId?: string }).conversationId;
          if (!id) return { ok: false, error: 'conversationId required' };
          const cv = (store.conversations || []).find((x: ConvRecord) => x.id === id);
          if (!cv) return { ok: false, error: 'conversation not found' };
          cv.archived = true; saveStore();
          return { ok: true };
        }
        case 'delete_conversation':
        case 'deep_delete_conversation': {
          const id = (approval.payload as { conversationId?: string }).conversationId;
          if (!id) return { ok: false, error: 'conversationId required' };
          const idx = (store.conversations || []).findIndex((x: ConvRecord) => x.id === id);
          if (idx === -1) return { ok: false, error: 'conversation not found' };
          (store.conversations as ConvRecord[]).splice(idx, 1);
          store.messages = (store.messages || []).filter((m) => m.conversationId !== id);
          if (approval.type === 'deep_delete_conversation') {
            store.memories = (store.memories || []).filter((m: { metadata?: { conversationId?: string } }) => m?.metadata?.conversationId !== id);
            store.tasks = (store.tasks || []).filter((t: { metadata?: { conversationId?: string } }) => t?.metadata?.conversationId !== id);
            store.approvals = (store.approvals || []).filter((a: { metadata?: { conversationId?: string } }) => a?.metadata?.conversationId !== id);
          }
          saveStore();
          return { ok: true };
        }
        case 'create_project': {
          const p = approval.payload as { name?: string; description?: string; instructions?: string; color?: string };
          if (!p.name) return { ok: false, error: 'name required' };
          if (!store.projects) store.projects = [];
          const proj: ProjectRecord = { id: 'prj-' + crypto.randomUUID().slice(0, 8), name: p.name, description: p.description, instructions: p.instructions, color: p.color || '#8b5cf6', archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          (store.projects as ProjectRecord[]).push(proj);
          saveStore();
          return { ok: true };
        }
        case 'update_project': {
          const p = approval.payload as { projectId?: string; name?: string; description?: string; instructions?: string; color?: string };
          if (!p.projectId) return { ok: false, error: 'projectId required' };
          const proj = ((store.projects || []) as ProjectRecord[]).find((x) => x.id === p.projectId);
          if (!proj) return { ok: false, error: 'not found' };
          if (p.name) proj.name = p.name;
          if (p.description !== undefined) proj.description = p.description;
          if (p.instructions !== undefined) proj.instructions = p.instructions;
          if (p.color) proj.color = p.color;
          proj.updatedAt = new Date().toISOString();
          saveStore();
          return { ok: true };
        }
        case 'delete_project': {
          const id = (approval.payload as { projectId?: string }).projectId;
          if (!id) return { ok: false, error: 'projectId required' };
          const idx = ((store.projects || []) as ProjectRecord[]).findIndex((x) => x.id === id);
          if (idx === -1) return { ok: false, error: 'not found' };
          for (const cv of (store.conversations || [])) {
            if ((cv as { projectId?: string }).projectId === id) (cv as { projectId?: string | null }).projectId = null;
          }
          (store.projects as ProjectRecord[]).splice(idx, 1);
          saveStore();
          return { ok: true };
        }
        case 'update_agent_model': {
          const p = approval.payload as { agentId?: string; model?: string };
          if (!p.agentId || !p.model) return { ok: false, error: 'agentId + model required' };
          if (p.agentId.startsWith('custom-')) {
            const cid = p.agentId.replace('custom-', '');
            const ca = (store.customAgents || []).find((a) => a.id === cid);
            if (!ca) return { ok: false, error: 'custom agent not found' };
            ca.model = p.model;
            ca.updatedAt = new Date().toISOString();
          } else {
            if (!store.builtinAgentModels) store.builtinAgentModels = {};
            (store.builtinAgentModels as Record<string, string>)[p.agentId] = p.model;
          }
          saveStore();
          return { ok: true };
        }
        case 'delete_task_category': {
          const name = (approval.payload as { name?: string }).name;
          if (!name) return { ok: false, error: 'name required' };
          for (const t of (store.tasks || [])) { if (t.list === name) t.list = 'عام'; }
          if (Array.isArray(store.taskCategories)) {
            store.taskCategories = (store.taskCategories as unknown as { id: string; en: string; ar: string }[])
              .filter((c) => c.id !== name && c.en !== name);
          }
          saveStore();
          return { ok: true };
        }
        case 'create_agent': {
          const p = approval.payload as { name?: { en: string; ar: string }; systemPrompt?: string; icon?: string; color?: string; model?: string };
          const agent: CustomAgentRecord = {
            id: crypto.randomUUID(),
            name: p.name || { en: 'New Agent', ar: 'وكيل جديد' },
            systemPrompt: (p.systemPrompt as string) || '',
            icon: (p.icon as string) || 'bot',
            color: (p.color as string) || 'gray',
            skills: [], tools: [],
            model: (p.model as string) || 'claude-sonnet-4-6',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          if (!store.customAgents) store.customAgents = [];
          store.customAgents.push(agent);
          saveStore();
          return { ok: true };
        }
        case 'update_agent': {
          const p = approval.payload;
          const targetId = p.targetAgentId as string;
          const ca = (store.customAgents || []).find((a) => a.id === targetId);
          if (!ca) return { ok: false, error: 'Agent not found' };
          if (p.systemPrompt) ca.systemPrompt = p.systemPrompt as string;
          if (p.model) ca.model = p.model as string;
          if (p.name) ca.name = p.name as { en: string; ar: string };
          if (p.icon) ca.icon = p.icon as string;
          if (p.color) ca.color = p.color as string;
          ca.updatedAt = new Date().toISOString();
          saveStore();
          return { ok: true };
        }
        case 'delete_agent': {
          const targetId = approval.payload.targetAgentId as string;
          if (!store.customAgents) return { ok: false, error: 'No custom agents' };
          const idx = store.customAgents.findIndex((a) => a.id === targetId);
          if (idx === -1) return { ok: false, error: 'Agent not found' };
          store.customAgents.splice(idx, 1);
          saveStore();
          return { ok: true };
        }
        case 'update_memory': {
          const targetId = approval.payload.targetAgentId as string;
          const content = approval.payload.content as string;
          const mem: MemoryRecord = {
            id: crypto.randomUUID(), agentId: targetId, tier: 'long-term',
            content, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          };
          if (!store.memories) store.memories = [];
          store.memories.push(mem);
          saveStore();
          return { ok: true };
        }
        default:
          return { ok: false, error: 'Unknown action type' };
      }
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : 'Execution error' };
    }
  }

  return { parse, execute };
}
