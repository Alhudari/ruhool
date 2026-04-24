/**
 * Zotero bridge routes — browse, import, sync.
 *
 * Connects to Zotero via:
 *   LOCAL mode: Zotero desktop running on localhost:23119 (no API key needed)
 *   WEB mode:   Zotero Web API with user_id + api_key stored in store.apiKeys
 */
import type { Hono } from 'hono';
import crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StoreData, NoteRecord, PaperRecord } from '../store/types.js';

export interface ZoteroRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  dataDir: string;
}

export function registerZoteroRoutes(app: Hono, deps: ZoteroRoutesDeps): void {
  const { getStore, saveStore, dataDir } = deps;

  // ── Status / connection check ───────────────────────────────────────
  app.get('/api/zotero/status', async (c) => {
    try {
      const { setZoteroConfig, getZoteroConfig } = await import('@ruhool/core');
      const store = getStore() as unknown as { apiKeys?: Record<string, string> };
      const webUserId = store.apiKeys?.zoteroWebUserId;
      const webApiKey = store.apiKeys?.zoteroWebApiKey;

      if (webUserId && webApiKey) {
        setZoteroConfig({ mode: 'web', userId: webUserId, apiKey: webApiKey });
      }

      const cfg = getZoteroConfig();
      return c.json({ ok: true, mode: cfg.mode, configured: !!cfg.apiKey || cfg.mode === 'local' });
    } catch (err) {
      return c.json({ ok: false, error: String(err) }, 503);
    }
  });

  // ── Collections ─────────────────────────────────────────────────────
  app.get('/api/zotero/collections', async (c) => {
    try {
      const { listCollections } = await import('@ruhool/core');
      const cols = await listCollections();
      return c.json(cols || []);
    } catch (err) {
      return c.json({ error: 'Zotero unreachable', details: String(err) }, 503);
    }
  });

  // ── Items list ──────────────────────────────────────────────────────
  app.get('/api/zotero/items', async (c) => {
    try {
      const { listItemsRich } = await import('@ruhool/core');
      const collectionKey = c.req.query('collection') || undefined;
      const limit = Math.min(parseInt(c.req.query('limit') || '200'), 500);
      const q = c.req.query('q')?.toLowerCase();

      let items = await listItemsRich(collectionKey, limit);
      if (q) items = items.filter(
        (it: { title?: string; authors?: string }) =>
          (it.title || '').toLowerCase().includes(q) ||
          (it.authors || '').toLowerCase().includes(q)
      );

      // Annotate which items are already imported
      const store = getStore();
      const importedKeys = new Set(
        (store.papers || [])
          .map((p: PaperRecord & { zoteroKey?: string }) => p.zoteroKey)
          .filter(Boolean)
      );

      return c.json(items.map((it: { itemKey: string; [k: string]: unknown }) => ({
        ...it,
        imported: importedKeys.has(it.itemKey),
      })));
    } catch (err) {
      return c.json({ error: String(err) }, 503);
    }
  });

  // ── Single item ─────────────────────────────────────────────────────
  app.get('/api/zotero/items/:key', async (c) => {
    try {
      const { fetchFullItem } = await import('@ruhool/core');
      const item = await fetchFullItem(c.req.param('key'));
      return c.json(item);
    } catch (err) {
      return c.json({ error: String(err) }, 503);
    }
  });

  // ── Import single item ──────────────────────────────────────────────
  app.post('/api/zotero/import/:key', async (c) => {
    try {
      const { fetchFullItem, fetchZoteroPaper } = await import('@ruhool/core');
      const key = c.req.param('key');
      const store = getStore();

      // Check if already imported
      const existing = (store.papers || []).find(
        (p: PaperRecord & { zoteroKey?: string }) => p.zoteroKey === key
      );
      if (existing) return c.json({ ok: true, paperId: existing.id, alreadyImported: true });

      const item = await fetchFullItem(key);
      if (!item) return c.json({ error: 'item not found in Zotero' }, 404);

      // Try to fetch PDF text
      let paperText = '';
      try {
        const pdf = await fetchZoteroPaper(key);
        if (pdf?.text) paperText = pdf.text;
      } catch { /* no PDF — continue */ }

      // Build paper record
      const paperId = 'zot-' + crypto.randomUUID().slice(0, 8);
      const paper: PaperRecord & { zoteroKey?: string; abstract?: string } = {
        id: paperId,
        filename: `${item.title || key}.pdf`,
        title: item.title || '',
        authors: Array.isArray(item.authors)
          ? item.authors.join(', ')
          : (item.authors || ''),
        pages: item.numPages || 0,
        textLength: paperText.length,
        sections: paperText
          ? splitIntoSections(paperText)
          : [],
        createdAt: new Date().toISOString(),
        zoteroKey: key,
        abstract: item.abstract || '',
      };

      if (!store.papers) store.papers = [];
      (store.papers as (PaperRecord & { zoteroKey?: string })[]).push(paper);

      // Import Zotero child notes as atomic notes
      const zoteroNotes: Array<{ content: string }> = item.notes || [];
      const importedNotes: NoteRecord[] = zoteroNotes
        .filter(n => n.content?.trim())
        .map(n => ({
          id: 'zn-' + crypto.randomUUID().slice(0, 8),
          paperId,
          section: 'Zotero Notes',
          type: 'claim' as const,
          content: n.content.replace(/<[^>]*>/g, '').trim().slice(0, 2000),
          themes: [],
          source: 'ai-adopted' as const,
          zoteroKey: key,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

      if (importedNotes.length > 0) {
        if (!store.notes) store.notes = [];
        store.notes.push(...importedNotes);
      }

      saveStore();
      return c.json({
        ok: true,
        paperId,
        title: paper.title,
        notesImported: importedNotes.length,
        hasPdfText: paperText.length > 0,
      }, 201);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  // ── Bulk import collection ───────────────────────────────────────────
  app.post('/api/zotero/import/bulk', async (c) => {
    const body = await c.req.json<{ collectionKey?: string; limit?: number }>().catch(() => ({}));
    try {
      const { listItemsRich } = await import('@ruhool/core');

      // Backup first
      const store = getStore();
      const backupDir = path.join(dataDir, 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const backupPath = path.join(backupDir, `zotero-bulk-${new Date().toISOString().slice(0, 10)}.json`);
      fs.writeFileSync(backupPath, JSON.stringify({ papers: store.papers, notes: store.notes }, null, 2));

      const items = await listItemsRich(body.collectionKey, body.limit || 50);
      const importedKeys = new Set(
        (store.papers || [])
          .map((p: PaperRecord & { zoteroKey?: string }) => p.zoteroKey)
          .filter(Boolean)
      );

      const toImport = items.filter((it: { itemKey: string }) => !importedKeys.has(it.itemKey));
      const results: Array<{ key: string; ok: boolean; paperId?: string }> = [];

      for (const item of toImport.slice(0, 30)) { // cap at 30 per bulk
        try {
          const paperId = 'zot-' + crypto.randomUUID().slice(0, 8);
          const paper: PaperRecord & { zoteroKey?: string } = {
            id: paperId,
            filename: `${item.title || item.itemKey}.pdf`,
            title: item.title || '',
            authors: Array.isArray(item.authors) ? item.authors.join(', ') : (item.authors || ''),
            pages: item.numPages || 0,
            textLength: 0,
            sections: [],
            createdAt: new Date().toISOString(),
            zoteroKey: item.itemKey,
          };
          if (!store.papers) store.papers = [];
          (store.papers as (PaperRecord & { zoteroKey?: string })[]).push(paper);
          results.push({ key: item.itemKey, ok: true, paperId });
        } catch { results.push({ key: item.itemKey, ok: false }); }
      }

      saveStore();
      return c.json({ ok: true, imported: results.filter(r => r.ok).length, backupPath, results });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  // ── Inject highlights back to Zotero ────────────────────────────────
  app.post('/api/zotero/items/:key/highlights', async (c) => {
    try {
      const { injectHighlights } = await import('@ruhool/core');
      const body = await c.req.json<{ highlights: string[] }>();
      await injectHighlights(c.req.param('key'), body.highlights || []);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  // ── Inject adopted notes back to Zotero ─────────────────────────────
  app.post('/api/zotero/items/:key/notes/sync', async (c) => {
    try {
      const { injectNotes } = await import('@ruhool/core');
      const key = c.req.param('key');
      const store = getStore();

      const adoptedNotes = (store.notes || [])
        .filter((n: NoteRecord & { zoteroKey?: string }) =>
          n.zoteroKey === key && n.source === 'ai-adopted')
        .map((n: NoteRecord) => `[${n.type}] ${n.content}`);

      if (adoptedNotes.length === 0) return c.json({ ok: true, synced: 0 });
      await injectNotes(key, adoptedNotes);
      return c.json({ ok: true, synced: adoptedNotes.length });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });
}

// ── Helpers ─────────────────────────────────────────────────────────
function splitIntoSections(text: string): Array<{ title: string; content: string }> {
  const lines = text.split('\n');
  const sections: Array<{ title: string; content: string }> = [];
  let current = { title: 'Introduction', content: '' };

  for (const line of lines) {
    if (/^(#{1,3}|\d+\.|[A-Z][A-Z\s]{3,}$)/.test(line.trim()) && line.trim().length < 100) {
      if (current.content.trim().length > 50) sections.push(current);
      current = { title: line.trim(), content: '' };
    } else {
      current.content += line + '\n';
    }
  }
  if (current.content.trim().length > 50) sections.push(current);
  return sections.slice(0, 20); // max 20 sections
}
