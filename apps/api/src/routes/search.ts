/**
 * Smart Search — universal text search across PhD content.
 *
 *   GET /api/search?q=...             — text search across all kinds
 *   GET /api/search?q=...&scope=phd   — limit to 01 PhD/ (default)
 *   GET /api/search?q=...&kind=paper  — limit to a specific kind (paper/book/note/meeting/inbox)
 *   GET /api/search?q=...&path=...    — limit to a sub-path
 *
 * AI-powered semantic search is a future addition (would call Anthropic
 * with embeddings). Current impl is fast text-search across vault + memory.
 */
import type { Hono } from 'hono';
import { listNotes, readNote } from '@ruhool/core';
import type { StoreData } from '../store/types.js';

interface SearchHit {
  kind: 'note' | 'paper' | 'book' | 'meeting' | 'memory' | 'atomic' | 'inbox' | 'misc';
  path?: string;
  title: string;
  snippet: string;
  matchScore: number;
  meta?: Record<string, unknown>;
}

interface Deps { getStore: () => StoreData; }

function classifyByPath(p: string): SearchHit['kind'] {
  if (p.includes('Atomic Notes') || p.includes('02 Atomic Notes')) return 'atomic';
  if (p.includes('Sources/Papers') || p.includes('Academic Literature')) return 'paper';
  if (p.includes('Sources/Books') || p.includes('06 Books')) return 'book';
  if (p.includes('Supervision') || p.includes('Meetings')) return 'meeting';
  return 'note';
}

function scoreMatch(text: string, qLower: string): { score: number; snippet: string } {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return { score: 0, snippet: '' };
  // Title position bonus + occurrence count
  const occurrences = (lower.match(new RegExp(qLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  const titleBonus = idx < 100 ? 50 : 0;
  // Build snippet around first match
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + qLower.length + 80);
  const snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  return { score: occurrences * 10 + titleBonus, snippet };
}

export function registerSearchRoutes(app: Hono, { getStore }: Deps): void {

  app.get('/api/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    if (!q || q.length < 2) return c.json({ hits: [], total: 0, query: q });

    const scope = c.req.query('scope') ?? 'phd';      // 'phd' | 'all'
    const kindFilter = c.req.query('kind');           // 'paper' | 'book' | 'note' | 'meeting' | 'memory' | 'atomic' | 'inbox'
    const pathFilter = c.req.query('path');           // sub-path filter
    const qLower = q.toLowerCase();

    const hits: SearchHit[] = [];

    // 1. Vault notes (filesystem)
    if (!kindFilter || ['paper', 'book', 'note', 'meeting', 'atomic'].includes(kindFilter)) {
      const subPath = pathFilter ?? (scope === 'phd' ? '01 PhD' : '');
      try {
        const paths = await listNotes({ subPath, includeArchive: false });
        // Cap concurrent reads
        const samples = paths.slice(0, 500);
        await Promise.all(samples.map(async (p) => {
          try {
            const n = await readNote(p);
            const titleMatch = scoreMatch(n.name, qLower);
            const bodyMatch = scoreMatch(n.body, qLower);
            const total = titleMatch.score + bodyMatch.score;
            if (total === 0) return;
            const kind = classifyByPath(p);
            if (kindFilter && kindFilter !== kind && !(kindFilter === 'note' && ['atomic', 'paper', 'book', 'meeting'].includes(kind))) return;
            hits.push({
              kind,
              path: p,
              title: n.name,
              snippet: titleMatch.snippet || bodyMatch.snippet,
              matchScore: total,
              meta: { year: n.frontmatter.Year, authors: n.frontmatter.Authors },
            });
          } catch { /* skip unreadable */ }
        }));
      } catch { /* vault not accessible */ }
    }

    // 2. Companion memory
    if (!kindFilter || kindFilter === 'memory') {
      const store = getStore();
      const mem = (store as unknown as { companionMemory?: Array<{ id: string; content: string; category: string; tags?: string[] }> }).companionMemory ?? [];
      for (const m of mem) {
        const match = scoreMatch(m.content, qLower);
        if (match.score > 0) {
          hits.push({
            kind: 'memory',
            title: `Memory: ${m.category}`,
            snippet: match.snippet,
            matchScore: match.score,
            meta: { id: m.id, category: m.category, tags: m.tags },
          });
        }
      }
    }

    // 3. Inbox
    if (!kindFilter || kindFilter === 'inbox') {
      const store = getStore();
      const inbox = (store as unknown as { inboxItems?: Array<{ id: string; title?: string; content?: string }> }).inboxItems ?? [];
      for (const i of inbox) {
        const text = `${i.title ?? ''}\n${i.content ?? ''}`;
        const match = scoreMatch(text, qLower);
        if (match.score > 0) {
          hits.push({
            kind: 'inbox',
            title: i.title || 'Inbox capture',
            snippet: match.snippet,
            matchScore: match.score,
            meta: { id: i.id },
          });
        }
      }
    }

    // Sort by score desc
    hits.sort((a, b) => b.matchScore - a.matchScore);

    return c.json({
      query: q,
      scope,
      kind: kindFilter,
      pathFilter,
      hits: hits.slice(0, 100),
      total: hits.length,
    });
  });
}
