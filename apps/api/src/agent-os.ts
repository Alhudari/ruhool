// Agent OS — shared helpers for Phase 1 capabilities:
//   • Working memory (per-conversation KV)
//   • Memory graph (nodes + edges)
//   • Durable task graph (dependency resolution + ready-queue)
//   • Action-tag parser invoked from every agent response
//
// All functions operate on a `StoreLike` object passed in so we don't import
// index.ts (avoids circular imports with the monolith).

import { logger } from './server/logging.js';

export interface ConversationMemoryEntry {
  key: string;
  value: string;
  agentId?: string;
  updatedAt: string;
}

export interface GraphNode {
  id: string;
  type: 'person' | 'project' | 'organization' | 'agreement' | 'appointment' | 'topic' | 'other';
  label: string;
  props?: Record<string, string | number | boolean>;
  sourceConversationId?: string;
  sourceMessageId?: string;
  createdAt: string;
  updatedAt: string;
  confidence?: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
  props?: Record<string, string | number | boolean>;
  sourceConversationId?: string;
  sourceMessageId?: string;
  createdAt: string;
  confidence?: number;
}

export interface StoreLike {
  conversationMemory?: Record<string, ConversationMemoryEntry[]>;
  graphNodes?: GraphNode[];
  graphEdges?: GraphEdge[];
  tasks: Array<{
    id: string;
    title: string;
    notes: string;
    completed: boolean;
    priority: string;
    dueDate: string | null;
    dueTime: string | null;
    list: string;
    tags: string[];
    color: string;
    pinned: boolean;
    checklist: unknown[];
    reminder: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    dependsOn?: string[];
    assignedAgent?: string;
    graphStatus?: string;
    origin?: string;
    conversationId?: string;
    lastAttemptAt?: string;
    output?: string;
  }>;
}

// ─── Working Memory ────────────────────────────────────────────────────────
export function memoryGet(store: StoreLike, convId: string, key: string): string | null {
  const entries = (store.conversationMemory?.[convId]) || [];
  const e = entries.find((x) => x.key === key);
  return e ? e.value : null;
}

export function memoryList(store: StoreLike, convId: string): ConversationMemoryEntry[] {
  return (store.conversationMemory?.[convId]) || [];
}

export function memorySet(store: StoreLike, convId: string, key: string, value: string, agentId?: string): void {
  if (!store.conversationMemory) store.conversationMemory = {};
  if (!store.conversationMemory[convId]) store.conversationMemory[convId] = [];
  const entries = store.conversationMemory[convId];
  const existing = entries.find((e) => e.key === key);
  if (existing) {
    existing.value = value;
    existing.agentId = agentId;
    existing.updatedAt = new Date().toISOString();
  } else {
    entries.push({ key, value, agentId, updatedAt: new Date().toISOString() });
  }
}

export function memoryDelete(store: StoreLike, convId: string, key: string): boolean {
  const entries = store.conversationMemory?.[convId];
  if (!entries) return false;
  const idx = entries.findIndex((e) => e.key === key);
  if (idx < 0) return false;
  entries.splice(idx, 1);
  return true;
}

// ─── Memory Graph ──────────────────────────────────────────────────────────
function normalizeLabel(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function graphFindNode(store: StoreLike, type: string, label: string): GraphNode | undefined {
  const nodes = store.graphNodes || [];
  const nl = normalizeLabel(label);
  return nodes.find((n) => n.type === type && normalizeLabel(n.label) === nl);
}

export function graphUpsertNode(
  store: StoreLike,
  n: Omit<GraphNode, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): GraphNode {
  if (!store.graphNodes) store.graphNodes = [];
  const existing = graphFindNode(store, n.type, n.label);
  const now = new Date().toISOString();
  if (existing) {
    if (n.props) existing.props = { ...(existing.props || {}), ...n.props };
    existing.updatedAt = now;
    if ((n.confidence ?? 0) > (existing.confidence ?? 0)) existing.confidence = n.confidence;
    return existing;
  }
  const node: GraphNode = {
    id: n.id || crypto.randomUUID(),
    type: n.type,
    label: n.label,
    props: n.props || {},
    sourceConversationId: n.sourceConversationId,
    sourceMessageId: n.sourceMessageId,
    createdAt: now,
    updatedAt: now,
    confidence: n.confidence ?? 0.7,
  };
  store.graphNodes.push(node);
  return node;
}

export function graphUpsertEdge(
  store: StoreLike,
  e: Omit<GraphEdge, 'id' | 'createdAt'> & { id?: string }
): GraphEdge {
  if (!store.graphEdges) store.graphEdges = [];
  const existing = store.graphEdges.find((x) => x.from === e.from && x.to === e.to && x.relation === e.relation);
  if (existing) {
    if (e.props) existing.props = { ...(existing.props || {}), ...e.props };
    if ((e.confidence ?? 0) > (existing.confidence ?? 0)) existing.confidence = e.confidence;
    return existing;
  }
  const edge: GraphEdge = {
    id: e.id || crypto.randomUUID(),
    from: e.from,
    to: e.to,
    relation: e.relation,
    props: e.props || {},
    sourceConversationId: e.sourceConversationId,
    sourceMessageId: e.sourceMessageId,
    createdAt: new Date().toISOString(),
    confidence: e.confidence ?? 0.7,
  };
  store.graphEdges.push(edge);
  return edge;
}

export function graphFind(store: StoreLike, query: { type?: string; label?: string; near?: string }): GraphNode[] {
  let nodes = store.graphNodes || [];
  if (query.type) nodes = nodes.filter((n) => n.type === query.type);
  if (query.label) {
    const q = normalizeLabel(query.label);
    nodes = nodes.filter((n) => normalizeLabel(n.label).includes(q));
  }
  if (query.near) {
    const center = nodes.find((n) => normalizeLabel(n.label) === normalizeLabel(query.near!));
    if (center) {
      const edges = store.graphEdges || [];
      const neighborIds = new Set<string>();
      for (const e of edges) {
        if (e.from === center.id) neighborIds.add(e.to);
        if (e.to === center.id) neighborIds.add(e.from);
      }
      nodes = (store.graphNodes || []).filter((n) => neighborIds.has(n.id) || n.id === center.id);
    }
  }
  return nodes.slice(0, 20);
}

// ─── Action tag parser ─────────────────────────────────────────────────────
// Recognized tags (all case-insensitive, whitespace-tolerant):
//   [MEM:SET:key=value]
//   [MEM:GET:key]
//   [MEM:DEL:key]
//   [GRAPH:NODE:type=person|label=أحمد|role=CEO]
//   [GRAPH:EDGE:from=أحمد|to=KSE|relation=works-at]
//   [GRAPH:FIND:type=project|label=BIM]
//   [TASK:ADD:title=كذا|agent=research|deps=id1,id2|due=2026-05-01]
//   [TASK:DONE:id=xxx|output=summary text]
//   [RUN:NEXT_AGENT:agentId]   — request next agent in chain
//   [RUN:DONE]                 — signal loop completion
//   [RUN:NEEDS_INPUT:prompt]   — pause until user replies
//
// The parser returns a list of *executed* operations AND the cleaned text.

export type ActionResult =
  | { kind: 'mem_set'; key: string; value: string }
  | { kind: 'mem_get'; key: string; value: string | null }
  | { kind: 'mem_del'; key: string; ok: boolean }
  | { kind: 'graph_node'; nodeId: string; label: string; type: string }
  | { kind: 'graph_edge'; edgeId: string; relation: string }
  | { kind: 'graph_find'; query: Record<string, string>; count: number }
  | { kind: 'task_add'; taskId: string; title: string }
  | { kind: 'task_done'; taskId: string; ok: boolean }
  | { kind: 'run_next'; agentId: string }
  | { kind: 'run_done' }
  | { kind: 'run_needs_input'; prompt: string };

function parseKvPairs(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.split('|')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

export interface ParseContext {
  store: StoreLike;
  conversationId: string;
  messageId?: string;
  agentId: string;
  saveStore: () => void;
}

export function parseAndExecuteActions(text: string, ctx: ParseContext): { cleaned: string; actions: ActionResult[] } {
  const actions: ActionResult[] = [];
  const re = /\[(MEM|GRAPH|TASK|RUN):([A-Z_]+)(?::([^\]]*))?\]/g;
  let cleaned = text;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  const matches: Array<{ full: string; domain: string; op: string; body: string }> = [];
  while ((m = re.exec(text)) !== null) {
    matches.push({ full: m[0], domain: m[1].toUpperCase(), op: m[2].toUpperCase(), body: m[3] || '' });
  }

  for (const tag of matches) {
    try {
      if (tag.domain === 'MEM') {
        if (tag.op === 'SET') {
          const eq = tag.body.indexOf('=');
          if (eq > 0) {
            const key = tag.body.slice(0, eq).trim();
            const value = tag.body.slice(eq + 1).trim();
            memorySet(ctx.store, ctx.conversationId, key, value, ctx.agentId);
            actions.push({ kind: 'mem_set', key, value });
          }
        } else if (tag.op === 'GET') {
          const key = tag.body.trim();
          const value = memoryGet(ctx.store, ctx.conversationId, key);
          actions.push({ kind: 'mem_get', key, value });
        } else if (tag.op === 'DEL') {
          const key = tag.body.trim();
          const ok = memoryDelete(ctx.store, ctx.conversationId, key);
          actions.push({ kind: 'mem_del', key, ok });
        }
      } else if (tag.domain === 'GRAPH') {
        const kv = parseKvPairs(tag.body);
        if (tag.op === 'NODE') {
          const label = kv.label || kv.name;
          const type = (kv.type as GraphNode['type']) || 'other';
          if (label) {
            const { id, label: lbl, type: t, props: _discard, ...rest } = kv as Record<string, string>;
            void id; void lbl; void t; void _discard; void rest;
            const props: Record<string, string> = {};
            for (const [k, v] of Object.entries(kv)) {
              if (k === 'type' || k === 'label' || k === 'name') continue;
              props[k] = v;
            }
            const node = graphUpsertNode(ctx.store, {
              type, label, props,
              sourceConversationId: ctx.conversationId,
              sourceMessageId: ctx.messageId,
              confidence: 0.8,
            });
            actions.push({ kind: 'graph_node', nodeId: node.id, label: node.label, type: node.type });
          }
        } else if (tag.op === 'EDGE') {
          const fromLabel = kv.from;
          const toLabel = kv.to;
          const relation = kv.relation || 'related-to';
          if (fromLabel && toLabel) {
            // Resolve each side: first try existing node, otherwise create a lightweight "other" node
            let fromNode = (ctx.store.graphNodes || []).find((n) => normalizeLabel(n.label) === normalizeLabel(fromLabel));
            let toNode = (ctx.store.graphNodes || []).find((n) => normalizeLabel(n.label) === normalizeLabel(toLabel));
            if (!fromNode) fromNode = graphUpsertNode(ctx.store, { type: 'other', label: fromLabel, confidence: 0.5, sourceConversationId: ctx.conversationId });
            if (!toNode) toNode = graphUpsertNode(ctx.store, { type: 'other', label: toLabel, confidence: 0.5, sourceConversationId: ctx.conversationId });
            const edge = graphUpsertEdge(ctx.store, {
              from: fromNode.id, to: toNode.id, relation,
              sourceConversationId: ctx.conversationId,
              sourceMessageId: ctx.messageId,
              confidence: 0.8,
            });
            actions.push({ kind: 'graph_edge', edgeId: edge.id, relation });
          }
        } else if (tag.op === 'FIND') {
          const result = graphFind(ctx.store, { type: kv.type, label: kv.label, near: kv.near });
          actions.push({ kind: 'graph_find', query: kv, count: result.length });
        }
      } else if (tag.domain === 'TASK') {
        if (tag.op === 'ADD') {
          const kv = parseKvPairs(tag.body);
          const title = kv.title;
          if (title) {
            const deps = (kv.deps || '').split(',').map((s) => s.trim()).filter(Boolean);
            const hasDeps = deps.length > 0;
            const id = crypto.randomUUID();
            ctx.store.tasks.push({
              id, title, notes: kv.notes || '', completed: false,
              priority: (kv.priority as 'high' | 'medium' | 'low') || 'medium',
              dueDate: kv.due || null, dueTime: null, list: kv.list || 'Default',
              tags: [], color: '#3b82f6', pinned: false, checklist: [],
              reminder: null,
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
              completedAt: null,
              dependsOn: deps.length ? deps : undefined,
              assignedAgent: kv.agent || ctx.agentId,
              graphStatus: hasDeps ? 'blocked' : 'ready',
              origin: 'agent',
              conversationId: ctx.conversationId,
            });
            actions.push({ kind: 'task_add', taskId: id, title });
          }
        } else if (tag.op === 'DONE') {
          const kv = parseKvPairs(tag.body);
          const id = kv.id;
          const task = ctx.store.tasks.find((t) => t.id === id);
          if (task) {
            task.completed = true;
            task.graphStatus = 'done';
            task.completedAt = new Date().toISOString();
            task.updatedAt = task.completedAt;
            if (kv.output) task.output = kv.output;
            // Unblock dependents
            for (const other of ctx.store.tasks) {
              if (other.dependsOn?.includes(id)) {
                const allDone = other.dependsOn.every((depId) => ctx.store.tasks.find((t) => t.id === depId)?.completed);
                if (allDone && other.graphStatus === 'blocked') other.graphStatus = 'ready';
              }
            }
            actions.push({ kind: 'task_done', taskId: id, ok: true });
          } else {
            actions.push({ kind: 'task_done', taskId: id || '', ok: false });
          }
        }
      } else if (tag.domain === 'RUN') {
        if (tag.op === 'NEXT_AGENT') {
          actions.push({ kind: 'run_next', agentId: tag.body.trim() });
        } else if (tag.op === 'DONE') {
          actions.push({ kind: 'run_done' });
        } else if (tag.op === 'NEEDS_INPUT') {
          actions.push({ kind: 'run_needs_input', prompt: tag.body.trim() });
        }
      }
    } catch (err) {
      logger.warn({ tag, err }, '[agent-os] action failed');
    }
  }

  // Strip tags from visible text
  cleaned = cleaned.replace(re, '');
  if (actions.length > 0) ctx.saveStore();
  return { cleaned, actions };
}

// ─── Task Graph scheduler helpers ──────────────────────────────────────────
export function readyTasks(store: StoreLike): StoreLike['tasks'] {
  return store.tasks.filter((t) => !t.completed && t.graphStatus === 'ready' && t.assignedAgent);
}

export function recomputeTaskStatuses(store: StoreLike): void {
  const byId = new Map(store.tasks.map((t) => [t.id, t]));
  for (const t of store.tasks) {
    if (t.completed) { t.graphStatus = 'done'; continue; }
    const deps = t.dependsOn || [];
    if (deps.length === 0) { if (t.graphStatus !== 'running' && t.graphStatus !== 'failed') t.graphStatus = 'ready'; continue; }
    const allDone = deps.every((id) => byId.get(id)?.completed);
    if (allDone && t.graphStatus !== 'running' && t.graphStatus !== 'failed') t.graphStatus = 'ready';
    else if (!allDone && t.graphStatus !== 'running' && t.graphStatus !== 'failed') t.graphStatus = 'blocked';
  }
}

// System-prompt snippet we append so every agent knows the action grammar.
export const AGENT_OS_PROMPT_ADDENDUM = `

## أدوات الوكيل (Action Tags)
تقدر تستخدم هذه الوسوم داخل ردّك، والسيرفر ينفّذها ويخفيها من الظاهر:

- \`[MEM:SET:key=value]\` — احفظ قيمة في ذاكرة المحادثة المشتركة (يراها كل الوكلاء)
- \`[MEM:GET:key]\` — استرجع قيمة (ستظهر لك في سياق الرد التالي)
- \`[GRAPH:NODE:type=person|label=أحمد|role=CEO]\` — أضف/حدّث كياناً في الرسم المعرفي
- \`[GRAPH:EDGE:from=أحمد|to=KSE|relation=works-at]\` — أضف علاقة بين كيانين
- \`[GRAPH:FIND:type=project|label=BIM]\` — ابحث في الرسم
- \`[TASK:ADD:title=كذا|agent=research|deps=id1,id2|due=2026-05-01|priority=high]\` — أنشئ مهمة
- \`[TASK:DONE:id=xxx|output=ملخص النتيجة]\` — أنهِ مهمة
- \`[RUN:NEXT_AGENT:agentId]\` — طلب تمرير للوكيل التالي في السلسلة
- \`[RUN:NEEDS_INPUT:السؤال للمستخدم]\` — توقف بانتظار المستخدم
- \`[RUN:DONE]\` — أنهيت السلسلة

**مهم:** لا تذكر الوسوم في ردّك الظاهر، اكتبها فقط كتعليمات للنظام. ستُخفى تلقائياً.`;
