/**
 * Knowledge-graph wikilinks registry.
 *
 * GET  /api/links/nodes          — all linkable nodes (with ?q= search and ?type= filter)
 * GET  /api/links/backlinks      — nodes that contain [[xxx]] in their text fields
 * POST /api/links/resolve        — extract wikilinks from text and resolve to full nodes
 */
import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';
import { extractWikilinks, resolveWikilinkAlias } from '@ruhool/core';

export interface LinksRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

export interface LinkNode {
  id: string;
  type: 'meeting' | 'note' | 'zotero' | 'task' | 'conversation' | 'paper' | 'source' | 'grs2';
  title: string;
  subtitle?: string;
  href?: string;
  tags?: string[];
}

// ── helpers ────────────────────────────────────────────────────────────────

function buildNodes(store: StoreData): LinkNode[] {
  const nodes: LinkNode[] = [];

  // meetings
  const sessions = (store as unknown as { meetingSessions?: Array<{ id: string; title: string; createdAt?: string }> }).meetingSessions ?? [];
  sessions.forEach((s, idx) => {
    nodes.push({
      id: `sip-${idx + 1}`,
      type: 'meeting',
      title: `Meeting ${idx + 1} — ${s.title ?? 'Summary'}`,
      subtitle: s.createdAt ? s.createdAt.slice(0, 10) : undefined,
      href: '/meetings',
    });
  });

  // notes (non-empty content)
  (store.notes ?? [])
    .filter(n => n.content?.trim())
    .forEach(n => {
      nodes.push({
        id: n.id,
        type: 'note',
        title: n.content.trim().slice(0, 60),
        subtitle: n.createdAt ? n.createdAt.slice(0, 10) : undefined,
      });
    });

  // papers
  (store.papers ?? []).forEach(p => {
    nodes.push({
      id: p.id,
      type: 'paper',
      title: p.title,
      subtitle: p.authors ?? undefined,
      href: '/shwasha',
    });
  });

  // sources
  (store.sources ?? []).forEach(s => {
    nodes.push({
      id: s.id,
      type: 'source',
      title: s.title,
      subtitle: s.authors ?? s.kind,
      tags: s.tags,
    });
  });

  // tasks (open only)
  (store.tasks ?? [])
    .filter(t => !t.completed)
    .forEach(t => {
      nodes.push({
        id: t.id,
        type: 'task',
        title: t.title,
        subtitle: t.dueDate ?? undefined,
        href: '/tasks',
      });
    });

  // conversations (not archived)
  (store.conversations ?? [])
    .filter(c => !c.archived)
    .forEach(c => {
      nodes.push({
        id: c.id,
        type: 'conversation',
        title: c.title,
        subtitle: c.updatedAt ? c.updatedAt.slice(0, 10) : undefined,
        href: '/',
      });
    });

  // grs2 records
  const grs2Records = (store as unknown as { grs2Records?: Array<{ id: string; month: string }> }).grs2Records ?? [];
  grs2Records.forEach(r => {
    nodes.push({
      id: `grs2-${r.month}`,
      type: 'grs2',
      title: `GRS2 ${r.month}`,
      subtitle: r.month,
    });
  });

  // Zotero items cached in store (from vault sync)
  const zoteroItems = (store as unknown as { zoteroCache?: Array<{ key: string; title?: string; authors?: string; year?: string; itemType?: string }> }).zoteroCache ?? [];
  zoteroItems.forEach(z => {
    if (!z.title) return;
    nodes.push({
      id: `zotero-${z.key}`,
      type: 'zotero',
      title: z.title,
      subtitle: [z.authors?.split(',')[0], z.year].filter(Boolean).join(' · '),
      href: '/zotero',
    });
  });

  return nodes;
}

/** Find a ~60-char context snippet around the first occurrence of a wikilink pattern */
function contextSnippet(text: string, target: string): string {
  const pattern = `[[${target}]]`;
  const idx = text.indexOf(pattern);
  if (idx === -1) return text.slice(0, 80);
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + pattern.length + 30);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

// ── route registrar ────────────────────────────────────────────────────────

export function registerLinksRoutes(app: Hono, deps: LinksRoutesDeps): void {
  const { getStore } = deps;

  // ── GET /api/links/nodes ──────────────────────────────────────────────
  app.get('/api/links/nodes', (c) => {
    const store = getStore();
    let nodes = buildNodes(store);

    const q = c.req.query('q');
    const type = c.req.query('type') as LinkNode['type'] | undefined;

    if (type) {
      nodes = nodes.filter(n => n.type === type);
    }
    if (q) {
      const lower = q.toLowerCase();
      nodes = nodes.filter(n => n.title.toLowerCase().includes(lower) || n.subtitle?.toLowerCase().includes(lower));
    }
    const limit = Number(c.req.query('limit') ?? 0);
    const total = nodes.length;
    if (limit > 0) nodes = nodes.slice(0, limit);

    return c.json({ nodes, total });
  });

  // ── GET /api/links/backlinks ──────────────────────────────────────────
  app.get('/api/links/backlinks', (c) => {
    const nodeId = c.req.query('nodeId');
    if (!nodeId) return c.json({ error: 'nodeId is required' }, 400);

    const store = getStore();
    const allNodes = buildNodes(store);

    // Resolve node title from nodeId to support title-based [[]] search
    const targetNode = allNodes.find(n => n.id === nodeId);
    const targetTitle = targetNode?.title ?? nodeId;

    type BacklinkEntry = {
      nodeId: string;
      nodeType: string;
      nodeTitle: string;
      context: string;
    };

    const backlinks: BacklinkEntry[] = [];

    function check(text: string | undefined | null, srcId: string, srcType: string, srcTitle: string): void {
      if (!text) return;
      const links = extractWikilinks(text);
      if (links.some(l => l === nodeId || l === targetTitle)) {
        backlinks.push({
          nodeId: srcId,
          nodeType: srcType,
          nodeTitle: srcTitle,
          context: contextSnippet(text, links.find(l => l === nodeId || l === targetTitle)!),
        });
      }
    }

    // Search meeting drafts
    const sessions = (store as unknown as { meetingSessions?: Array<{ id: string; title: string; draft?: string }> }).meetingSessions ?? [];
    sessions.forEach((s, idx) => {
      check(s.draft, `sip-${idx + 1}`, 'meeting', `Meeting ${idx + 1} — ${s.title ?? 'Summary'}`);
    });

    // Search notes content
    (store.notes ?? []).forEach(n => {
      check(n.content, n.id, 'note', n.content?.trim().slice(0, 60) ?? n.id);
    });

    // Search keepNotes content
    (store.keepNotes ?? []).forEach(k => {
      const kn = k as unknown as { id: string; title?: string; content?: string };
      check(kn.content, kn.id, 'note', kn.title ?? kn.id);
    });

    return c.json({ backlinks });
  });

  // ── POST /api/links/resolve ──────────────────────────────────────────
  app.post('/api/links/resolve', async (c) => {
    const body = await c.req.json<{ text?: string }>();
    const text = body?.text ?? '';

    const store = getStore();
    const allNodes = buildNodes(store);

    const aliases = resolveWikilinkAlias(text);
    const links = aliases.map(({ raw, target, alias }) => {
      const node = allNodes.find(
        n => n.title.toLowerCase() === target.toLowerCase() || n.id === target
      ) ?? null;
      return { raw, target, alias, node };
    });

    return c.json({ links });
  });
}
