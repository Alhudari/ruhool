/**
 * Knowledge Graph API
 *
 * GET  /api/graph/nodes           — all graph nodes (meetings, notes, papers, agents, etc.)
 * GET  /api/graph/edges           — all graph edges (wikilink, agent-work, tag, sequence)
 * GET  /api/graph/full            — { nodes, edges, stats }
 * GET  /api/graph/agent/:agentId  — subgraph for a specific agent
 */
import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';
import { extractWikilinks } from '@ruhool/core';

// ─── Types ──────────────────────────────────────────────────────────────────

export type GraphNodeType =
  | 'meeting'
  | 'note'
  | 'paper'
  | 'source'
  | 'task'
  | 'conversation'
  | 'zotero'
  | 'grs2'
  | 'tag'
  | 'agent'
  | 'cluster';

export interface KGNode {
  id: string;
  type: GraphNodeType;
  label: string;
  subtitle?: string;
  href?: string;
  agentId?: string;
  tags?: string[];
  date?: string;
  isAgent?: boolean;
  size?: number;
}

export interface KGEdge {
  id: string;
  source: string;
  target: string;
  type: 'wikilink' | 'agent-work' | 'tag' | 'sequence' | 'reference';
  label?: string;
  weight?: number;
}

// ─── Agents catalogue ────────────────────────────────────────────────────────

const AGENTS = [
  { id: 'manager',            label: 'الراعي',     subtitle: 'Manager' },
  { id: 'research',           label: 'الباحث',     subtitle: 'Researcher' },
  { id: 'reading-helper',     label: 'المُلخِّص',  subtitle: 'Summarizer' },
  { id: 'writing-critic',     label: 'الناقد',     subtitle: 'Writing Critic' },
  { id: 'comparator',         label: 'المُقارِن',  subtitle: 'Comparator' },
  { id: 'analyst',            label: 'المحلل',     subtitle: 'Analyst' },
  { id: 'architect',          label: 'المصمم',     subtitle: 'Architect' },
  { id: 'content-creator',    label: 'السارد',     subtitle: 'Content Creator' },
  { id: 'creative',           label: 'المبدع',     subtitle: 'Creative' },
  { id: 'doctor',             label: 'المشخّص',    subtitle: 'Doctor' },
  { id: 'mudawwin',           label: 'المُدوّن',   subtitle: 'Meetings Scribe' },
  { id: 'research-companion', label: 'الخوي',      subtitle: 'PhD Companion' },
  { id: 'sayyaq',             label: 'الكاتب',     subtitle: 'Writer' },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ZoteroStoreItem = {
  key: string;
  title?: string;
  authors?: string;
  year?: string;
  itemType?: string;
};

type ExtendedStore = StoreData & {
  meetingSessions?: Array<{
    id: string;
    title: string;
    draft?: string;
    record?: { date?: string } | null;
    createdAt: string;
    updatedAt: string;
  }>;
  grs2Records?: Array<{
    id: string;
    month: string;
  }>;
  zoteroCache?: ZoteroStoreItem[];
};

/** Build all non-agent nodes from the store */
function buildContentNodes(store: StoreData): KGNode[] {
  const s = store as ExtendedStore;
  const nodes: KGNode[] = [];

  // meetings
  const sessions = s.meetingSessions ?? [];
  sessions.forEach((sess, idx) => {
    const num = idx + 1;
    nodes.push({
      id: `meeting-${sess.id}`,
      type: 'meeting',
      label: `SIP-${num} — ${sess.title ?? 'Summary'}`,
      subtitle: sess.createdAt ? sess.createdAt.slice(0, 10) : undefined,
      date: (sess.record as Record<string, unknown> | null | undefined)?.['date'] as string | undefined
        ?? sess.createdAt,
      href: '/meetings',
    });
  });

  // notes
  (store.notes ?? [])
    .filter(n => n.content?.trim())
    .forEach(n => {
      nodes.push({
        id: `note-${n.id}`,
        type: 'note',
        label: n.content.trim().slice(0, 60),
        subtitle: n.createdAt ? n.createdAt.slice(0, 10) : undefined,
        date: n.createdAt,
        tags: n.themes?.length ? n.themes : undefined,
      });
    });

  // papers (legacy uploaded papers)
  (store.papers ?? []).forEach(p => {
    nodes.push({
      id: `paper-${p.id}`,
      type: 'paper',
      label: p.title,
      subtitle: p.authors ?? undefined,
      date: p.createdAt,
      href: '/shwasha',
    });
  });

  // sources hub (Zotero/document/book/writing)
  (store.sources ?? []).forEach(src => {
    const nodeType: GraphNodeType = src.kind === 'zotero' ? 'zotero' : 'source';
    nodes.push({
      id: `source-${src.id}`,
      type: nodeType,
      label: src.title,
      subtitle: src.authors ?? src.kind,
      date: src.createdAt,
      tags: src.tags,
      href: '/sources',
    });
  });

  // tasks (all — completed + open)
  (store.tasks ?? []).forEach(t => {
    nodes.push({
      id: `task-${t.id}`,
      type: 'task',
      label: t.title,
      subtitle: t.dueDate ?? undefined,
      date: t.dueDate ?? t.createdAt,
      href: '/tasks',
    });
  });

  // conversations (not archived)
  (store.conversations ?? [])
    .filter(c => !c.archived)
    .forEach(c => {
      nodes.push({
        id: `conv-${c.id}`,
        type: 'conversation',
        label: c.title,
        subtitle: c.updatedAt ? c.updatedAt.slice(0, 10) : undefined,
        agentId: c.agentId,
        date: c.updatedAt,
        href: '/',
      });
    });

  // zotero items cached in store
  const zoteroItems: ZoteroStoreItem[] = s.zoteroCache ?? [];
  zoteroItems.forEach(z => {
    if (!z.title) return;
    nodes.push({
      id: `zotero-${z.key}`,
      type: 'zotero',
      label: z.title,
      subtitle: [z.authors?.split(',')[0], z.year].filter(Boolean).join(' · '),
      href: '/zotero',
    });
  });

  // GRS2 monthly records
  const grs2Records = s.grs2Records ?? [];
  grs2Records.forEach(r => {
    nodes.push({
      id: `grs2-${r.month}`,
      type: 'grs2',
      label: `GRS2 ${r.month}`,
      subtitle: r.month,
      date: `${r.month}-01`,
    });
  });

  // hierarchical tags
  (store.tags ?? []).forEach(tag => {
    nodes.push({
      id: `tag-${tag.id}`,
      type: 'tag',
      label: tag.path,
      subtitle: tag.label ?? undefined,
    });
  });

  return nodes;
}

/** Build agent nodes */
function buildAgentNodes(): KGNode[] {
  return AGENTS.map(a => ({
    id: `agent-${a.id}`,
    type: 'agent' as GraphNodeType,
    label: a.label,
    subtitle: a.subtitle,
    isAgent: true,
    href: '/agents',
  }));
}

/** Enrich nodes with size (connection count) */
function attachSizes(nodes: KGNode[], edges: KGEdge[]): KGNode[] {
  const counts = new Map<string, number>();
  for (const e of edges) {
    counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
    counts.set(e.target, (counts.get(e.target) ?? 0) + 1);
  }
  return nodes.map(n => ({ ...n, size: counts.get(n.id) ?? 1 }));
}

/** Build all edges */
function buildEdges(store: StoreData, nodes: KGNode[]): KGEdge[] {
  const s = store as ExtendedStore;
  const edges: KGEdge[] = [];
  let edgeCounter = 0;
  const eid = () => `e-${++edgeCounter}`;

  // Build a label index for wikilink resolution
  const nodeByLabel = new Map<string, string>(); // label.toLowerCase() → nodeId
  for (const n of nodes) {
    nodeByLabel.set(n.label.toLowerCase(), n.id);
  }

  // ── Wikilink edges (from meeting drafts and notes content) ────────────────
  const sessions = s.meetingSessions ?? [];
  sessions.forEach((sess) => {
    const srcNodeId = `meeting-${sess.id}`;
    if (!sess.draft) return;
    const links = extractWikilinks(sess.draft);
    for (const raw of links) {
      const target = nodeByLabel.get(raw.toLowerCase());
      if (target && target !== srcNodeId) {
        edges.push({
          id: eid(),
          source: srcNodeId,
          target,
          type: 'wikilink',
          label: '[[]]',
          weight: 2,
        });
      }
    }
  });

  (store.notes ?? []).forEach(n => {
    const srcNodeId = `note-${n.id}`;
    if (!n.content?.trim()) return;
    const links = extractWikilinks(n.content);
    for (const raw of links) {
      const target = nodeByLabel.get(raw.toLowerCase());
      if (target && target !== srcNodeId) {
        edges.push({
          id: eid(),
          source: srcNodeId,
          target,
          type: 'wikilink',
          label: '[[]]',
          weight: 2,
        });
      }
    }
  });

  // ── Agent-work edges ──────────────────────────────────────────────────────

  // conversations → agent
  (store.conversations ?? [])
    .filter(c => !c.archived && c.agentId)
    .forEach(c => {
      const agentNodeId = `agent-${c.agentId}`;
      const convNodeId = `conv-${c.id}`;
      // only add if agent node exists
      if (nodes.some(n => n.id === agentNodeId)) {
        edges.push({
          id: eid(),
          source: agentNodeId,
          target: convNodeId,
          type: 'agent-work',
          weight: 2,
        });
      }
    });

  // meetings → mudawwin
  sessions.forEach(sess => {
    edges.push({
      id: eid(),
      source: 'agent-mudawwin',
      target: `meeting-${sess.id}`,
      type: 'agent-work',
      weight: 2,
    });
  });

  // reading sessions → reading-helper (via paperId)
  const readingSessions = (store.readingSessions ?? []);
  readingSessions.forEach(rs => {
    const paperId = rs.paperId;
    if (paperId) {
      // Try to find the paper/source node
      const paperNode = nodes.find(n => n.id === `paper-${paperId}` || n.id === `source-${paperId}`);
      if (paperNode) {
        edges.push({
          id: eid(),
          source: 'agent-reading-helper',
          target: paperNode.id,
          type: 'agent-work',
          weight: 3,
        });
      }
    }
  });

  // readingNoteSessions → reading-helper (via paperId)
  const readingNoteSessions = (store.readingNoteSessions ?? []);
  readingNoteSessions.forEach(rs => {
    if (rs.paperId) {
      const paperNode = nodes.find(n => n.id === `paper-${rs.paperId}` || n.id === `source-${rs.paperId}`);
      if (paperNode) {
        edges.push({
          id: eid(),
          source: 'agent-reading-helper',
          target: paperNode.id,
          type: 'agent-work',
          weight: 3,
        });
      }
    }
  });

  // ── Tag edges ─────────────────────────────────────────────────────────────
  (store.tagAssignments ?? []).forEach(ta => {
    const targetNodeId = (() => {
      // Determine the KG node id from nodeType + nodeId
      switch (ta.nodeType) {
        case 'conversation': return `conv-${ta.nodeId}`;
        case 'note':         return `note-${ta.nodeId}`;
        case 'paper':        return `paper-${ta.nodeId}`;
        case 'source':       return `source-${ta.nodeId}`;
        case 'task':         return `task-${ta.nodeId}`;
        case 'meeting':      return `meeting-${ta.nodeId}`;
        default:             return ta.nodeId;
      }
    })();
    const targetExists = nodes.some(n => n.id === targetNodeId);
    if (!targetExists) return;

    for (const tagPath of ta.tagPaths) {
      // Find tag node by path
      const tagNode = nodes.find(n => n.type === 'tag' && n.label === tagPath);
      if (tagNode) {
        edges.push({
          id: eid(),
          source: tagNode.id,
          target: targetNodeId,
          type: 'tag',
          label: tagPath,
          weight: 1,
        });
      }
    }
  });

  // ── Temporal / sequence edges ─────────────────────────────────────────────

  // Meeting sessions in chronological order: SIP-N → SIP-(N+1)
  if (sessions.length > 1) {
    for (let i = 0; i < sessions.length - 1; i++) {
      edges.push({
        id: eid(),
        source: `meeting-${sessions[i].id}`,
        target: `meeting-${sessions[i + 1].id}`,
        type: 'sequence',
        label: 'next',
        weight: 1,
      });
    }
  }

  // GRS2 records in month order
  const grs2Records = [...(s.grs2Records ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  if (grs2Records.length > 1) {
    for (let i = 0; i < grs2Records.length - 1; i++) {
      edges.push({
        id: eid(),
        source: `grs2-${grs2Records[i].month}`,
        target: `grs2-${grs2Records[i + 1].month}`,
        type: 'sequence',
        label: 'next',
        weight: 1,
      });
    }
  }

  return edges;
}

// ─── Route deps ──────────────────────────────────────────────────────────────

export interface GraphRoutesDeps {
  getStore: () => StoreData;
}

// ─── Route registrar ─────────────────────────────────────────────────────────

export function registerGraphRoutes(app: Hono, deps: GraphRoutesDeps): void {
  const { getStore } = deps;

  /** Build the full graph once per request */
  function buildGraph(): { nodes: KGNode[]; edges: KGEdge[] } {
    const store = getStore();
    const contentNodes = buildContentNodes(store);
    const agentNodes = buildAgentNodes();
    const allNodes = [...agentNodes, ...contentNodes];
    const rawEdges = buildEdges(store, allNodes);
    const nodes = attachSizes(allNodes, rawEdges);
    return { nodes, edges: rawEdges };
  }

  // ── GET /api/graph/nodes ────────────────────────────────────────────────
  app.get('/api/graph/nodes', (c) => {
    const { nodes } = buildGraph();

    const typeFilter = c.req.query('type') as GraphNodeType | undefined;
    const agentOnly = c.req.query('agents') === 'true';
    const q = c.req.query('q');

    let result = nodes;
    if (typeFilter) result = result.filter(n => n.type === typeFilter);
    if (agentOnly)  result = result.filter(n => n.isAgent === true);
    if (q) {
      const lower = q.toLowerCase();
      result = result.filter(n =>
        n.label.toLowerCase().includes(lower) ||
        n.subtitle?.toLowerCase().includes(lower)
      );
    }

    return c.json({ nodes: result, total: result.length });
  });

  // ── GET /api/graph/edges ────────────────────────────────────────────────
  app.get('/api/graph/edges', (c) => {
    const { edges } = buildGraph();

    const typeFilter = c.req.query('type') as KGEdge['type'] | undefined;
    let result = edges;
    if (typeFilter) result = result.filter(e => e.type === typeFilter);

    return c.json({ edges: result, total: result.length });
  });

  // ── GET /api/graph/full ─────────────────────────────────────────────────
  app.get('/api/graph/full', (c) => {
    const { nodes, edges } = buildGraph();

    const agentCount    = nodes.filter(n => n.isAgent).length;
    const wikilinkCount = edges.filter(e => e.type === 'wikilink').length;

    return c.json({
      nodes,
      edges,
      stats: {
        nodeCount:    nodes.length,
        edgeCount:    edges.length,
        agentCount,
        wikilinkCount,
      },
    });
  });

  // ── GET /api/graph/agent/:agentId ───────────────────────────────────────
  app.get('/api/graph/agent/:agentId', (c) => {
    const agentId = c.req.param('agentId');
    const agentNodeId = `agent-${agentId}`;

    const { nodes, edges } = buildGraph();

    // Collect all node IDs connected to this agent
    const connectedIds = new Set<string>([agentNodeId]);
    for (const e of edges) {
      if (e.source === agentNodeId) connectedIds.add(e.target);
      if (e.target === agentNodeId) connectedIds.add(e.source);
    }

    const filteredNodes = nodes.filter(n => connectedIds.has(n.id));
    const filteredEdges = edges.filter(e => connectedIds.has(e.source) && connectedIds.has(e.target));

    return c.json({
      agentId,
      nodes: filteredNodes,
      edges: filteredEdges,
      stats: {
        nodeCount: filteredNodes.length,
        edgeCount: filteredEdges.length,
      },
    });
  });
}
