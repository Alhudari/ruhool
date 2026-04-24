/**
 * Zotero integration — browser, sync, push.
 *
 *   GET  /api/zotero/collections              — list all Zotero collections
 *   GET  /api/zotero/items?collection=KEY     — list items in collection (or all)
 *   GET  /api/zotero/search?q=...             — search Zotero by title
 *   POST /api/zotero/sync-to-vault            — sync a Zotero item → Obsidian note
 *   POST /api/zotero/push                     — push a platform source to Zotero
 *   POST /api/zotero/sync-collection          — sync entire collection in one go
 */
import type { Hono } from 'hono';
import {
  zoteroListCollections, zoteroListItems, zoteroSearchByTitle,
  createZoteroItem, fetchZoteroPaper, writeNoteRaw, noteExists, writeFrontmatter,
  zoteroListAllItems, zoteroReplaceTags, zoteroClearExtra, zoteroListItemsRich,
  setZoteroConfig, getZoteroConfig,
} from '@ruhool/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { auditLog } from '../services/audit-log.js';
import { AnthropicProvider } from '../services/llm/index.js';
import type { StoreData } from '../store/types.js';
import { getSyncStatus, runZoteroVaultSync } from '../workers/zotero-vault-sync.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { z } from 'zod';

export interface ZoteroRoutesDeps {
  getStore: () => StoreData;
  saveStore?: () => void;
  anthropicCache: { current: AnthropicProvider | null };
  logger?: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void };
}

// Reconstruct a plain abstract from OpenAlex's inverted-index format:
// { word: [pos1, pos2, ...] } → "word at pos1 word at pos2 ..."
function decodeInvertedIndex(idx: Record<string, number[]> | undefined | null): string {
  if (!idx) return '';
  const words: string[] = [];
  for (const [word, positions] of Object.entries(idx)) {
    for (const p of positions) words[p] = word;
  }
  return words.filter(Boolean).join(' ');
}

// Tag patterns we'll strip during reset (case-insensitive). User-added subject tags
// (BIM, methodology, etc.) are preserved unless they match these reading-status patterns.
const RESET_TAG_PATTERNS = [
  /^to.?read$/i, /^reading$/i, /^read$/i, /^skip$/i, /^maybe$/i,
  /^priority[:_-]/i, /^reading[:_-]?status/i,
  /^ruhool[:_-]/i,  // any tag prefixed with our platform
  /^⭐+$/, /^⭐⭐+$/, /^⭐⭐⭐+$/,  // star-rating tags
];

// Persistent shape stored in store.json
interface ZoteroSavedConfig {
  mode: 'local' | 'web';
  webUserId?: string;
  webApiKey?: string;
}

export function registerZoteroRoutes(app: Hono, deps?: ZoteroRoutesDeps): void {

  // Restore saved Zotero mode + credentials on startup so the user doesn't have
  // to re-enter them after every server restart.
  if (deps) {
    try {
      const saved = (deps.getStore() as unknown as { zoteroConfig?: ZoteroSavedConfig }).zoteroConfig;
      if (saved) {
        setZoteroConfig({
          mode: saved.mode,
          webUserId: saved.webUserId ?? '',
          webApiKey: saved.webApiKey ?? '',
        });
      }
    } catch { /* ignore */ }
  }

  // Get current Zotero connection mode (API keys never returned in plain).
  // Round 2: adds hasWriteKey + writeEnabled flag for the sync bar UI.
  app.get('/api/zotero/config', (c) => {
    const cfg = getZoteroConfig();
    const store = deps?.getStore() as unknown as { zoteroConfig?: { writeApiKey?: string }; zoteroWriteEnabled?: boolean };
    const hasWriteKey = !!store?.zoteroConfig?.writeApiKey;
    return c.json({
      mode: cfg.mode,
      webUserId: cfg.webUserId,
      hasApiKey: cfg.webApiKey === '***',
      hasReadKey: cfg.webApiKey === '***',
      hasWriteKey,
      writeEnabled: !!store?.zoteroWriteEnabled,
      localUrl: cfg.localUrl,
    });
  });

  // Switch Zotero mode + save credentials.
  // Body: { mode: 'local' | 'web', webUserId?, webApiKey? }
  app.put('/api/zotero/config', async (c) => {
    if (!deps) return c.json({ error: 'no deps' }, 500);
    const body = await c.req.json<{ mode: 'local' | 'web'; webUserId?: string; webApiKey?: string }>();
    if (body.mode !== 'local' && body.mode !== 'web') return c.json({ error: 'mode must be local or web' }, 400);
    if (body.mode === 'web' && (!body.webUserId?.trim() || !body.webApiKey?.trim())) {
      return c.json({ error: 'webUserId and webApiKey required for web mode' }, 400);
    }
    setZoteroConfig({
      mode: body.mode,
      webUserId: body.webUserId?.trim() ?? '',
      webApiKey: body.webApiKey?.trim() ?? '',
    });
    // Persist
    const store = deps.getStore() as unknown as { zoteroConfig?: ZoteroSavedConfig };
    store.zoteroConfig = {
      mode: body.mode,
      webUserId: body.webUserId?.trim(),
      webApiKey: body.webApiKey?.trim(),
    };
    deps.saveStore?.();
    await auditLog({ action: 'zotero.config-changed', source: 'platform:user', meta: { mode: body.mode, hasKey: !!body.webApiKey } });
    return c.json({ ok: true, mode: body.mode });
  });

  // ── Zotero write key + write toggle ────────────────────────────────
  // The write API key is kept separate from the read key so read-only
  // browsing keeps working even if the user hasn't created a write key
  // yet (or wants to disable pushes).
  app.put('/api/zotero/write-config', async (c) => {
    if (!deps) return c.json({ error: 'no deps' }, 500);
    const body = await c.req.json<{ writeApiKey?: string; writeEnabled?: boolean }>().catch(() => ({} as { writeApiKey?: string; writeEnabled?: boolean }));
    const store = deps.getStore() as unknown as {
      zoteroConfig?: ZoteroSavedConfig & { writeApiKey?: string };
      zoteroWriteEnabled?: boolean;
    };
    if (!store.zoteroConfig) store.zoteroConfig = { mode: 'local' };
    if (typeof body.writeApiKey === 'string') {
      (store.zoteroConfig as { writeApiKey?: string }).writeApiKey = body.writeApiKey.trim() || undefined;
    }
    if (typeof body.writeEnabled === 'boolean') store.zoteroWriteEnabled = body.writeEnabled;
    deps.saveStore?.();
    const keyEnding = (store.zoteroConfig as { writeApiKey?: string }).writeApiKey?.slice(-4) ?? '';
    await auditLog({
      action: 'zotero.write-config-changed',
      source: 'platform:user',
      meta: { hasWriteKey: !!(store.zoteroConfig as { writeApiKey?: string }).writeApiKey, writeEnabled: !!store.zoteroWriteEnabled, keyEnding },
    });
    return c.json({ ok: true });
  });

  // ── Scopus search (uses saved API key + optional Inst Token) ────────
  // Body: { query: string, count?: number }
  app.post('/api/databases/scopus/search', async (c) => {
    if (!deps) return c.json({ error: 'no deps' }, 500);
    const body = await c.req.json<{ query: string; count?: number; start?: number }>();
    if (!body.query?.trim()) return c.json({ error: 'query required' }, 400);
    const db = (deps.getStore() as unknown as { databaseKeys?: Record<string, string> }).databaseKeys ?? {};
    if (!db.scopusApiKey) return c.json({ error: 'Scopus API key not configured. Add it in /zotero → ⚙️ → Databases.' }, 400);

    const headers: Record<string, string> = {
      'X-ELS-APIKey': db.scopusApiKey,
      'Accept': 'application/json',
    };
    if (db.scopusInstToken) headers['X-ELS-Insttoken'] = db.scopusInstToken;

    try {
      const count = Math.min(Math.max(body.count ?? 25, 1), 50);
      const start = Math.max(body.start ?? 0, 0);
      const url = `https://api.elsevier.com/content/search/scopus?query=${encodeURIComponent(body.query)}&count=${count}&start=${start}`;
      const r = await fetch(url, { headers });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        return c.json({ error: `Scopus ${r.status}: ${t.slice(0, 300)}` }, r.status === 401 || r.status === 403 ? 401 : 502);
      }
      const j = await r.json() as { 'search-results'?: { entry?: Array<Record<string, unknown>>; 'opensearch:totalResults'?: string } };
      const entries = j['search-results']?.entry ?? [];
      const results = entries.map((e) => ({
        title: String(e['dc:title'] ?? ''),
        authors: String(e['dc:creator'] ?? ''),
        year: e['prism:coverDate'] ? Number(String(e['prism:coverDate']).slice(0, 4)) : undefined,
        doi: String(e['prism:doi'] ?? ''),
        journal: String(e['prism:publicationName'] ?? ''),
        volume: String(e['prism:volume'] ?? ''),
        issue: String(e['prism:issueIdentifier'] ?? ''),
        pages: String(e['prism:pageRange'] ?? ''),
        citedByCount: Number(e['citedby-count'] ?? 0),
        scopusId: String(e['dc:identifier'] ?? '').replace('SCOPUS_ID:', ''),
        eid: String(e['eid'] ?? ''),
        type: String(e['subtypeDescription'] ?? ''),
        abstract: String(e['dc:description'] ?? ''),
      }));
      return c.json({
        results,
        total: Number(j['search-results']?.['opensearch:totalResults'] ?? 0),
        start,
        count,
        source: 'Scopus',
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Web of Science Starter search ───────────────────────────────────
  app.post('/api/databases/wos/search', async (c) => {
    if (!deps) return c.json({ error: 'no deps' }, 500);
    const body = await c.req.json<{ query: string; count?: number; page?: number; database?: 'WOS' | 'WOK' }>();
    if (!body.query?.trim()) return c.json({ error: 'query required' }, 400);
    const db = (deps.getStore() as unknown as { databaseKeys?: Record<string, string> }).databaseKeys ?? {};
    if (!db.wosApiKey) return c.json({ error: 'WoS API key not configured.' }, 400);

    try {
      const limit = Math.min(Math.max(body.count ?? 25, 1), 50);
      const page = Math.max(body.page ?? 1, 1);
      const url = `https://api.clarivate.com/apis/wos-starter/v1/documents?q=${encodeURIComponent(body.query)}&db=${body.database ?? 'WOS'}&limit=${limit}&page=${page}`;
      const r = await fetch(url, { headers: { 'X-ApiKey': db.wosApiKey, 'Accept': 'application/json' } });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        return c.json({ error: `WoS ${r.status}: ${t.slice(0, 300)}` }, r.status === 401 || r.status === 403 ? 401 : 502);
      }
      const j = await r.json() as { hits?: Array<Record<string, unknown>>; metadata?: { total?: number } };
      const results = (j.hits ?? []).map((h) => {
        const title = (h.title as { value?: string } | undefined)?.value ?? '';
        const source = (h.source as { sourceTitle?: string; publishYear?: number; volume?: string; issue?: string; pages?: { range?: string } } | undefined) ?? {};
        const idents = (h.identifiers as { doi?: string } | undefined) ?? {};
        const authorNames = ((h.names as { authors?: Array<{ displayName?: string }> } | undefined)?.authors ?? []).map((a) => a.displayName).filter(Boolean).join(', ');
        const cit = (h.citations as Array<{ db?: string; count?: number }> | undefined) ?? [];
        return {
          title,
          authors: authorNames,
          year: source.publishYear,
          doi: idents.doi ?? '',
          journal: source.sourceTitle ?? '',
          volume: source.volume ?? '',
          issue: source.issue ?? '',
          pages: source.pages?.range ?? '',
          citedByCount: cit.find((x) => x.db === 'wos')?.count ?? 0,
          uid: String(h.uid ?? ''),
          type: ((h.types as { documentType?: string[] } | undefined)?.documentType ?? [])[0] ?? '',
        };
      });
      return c.json({ results, total: j.metadata?.total ?? results.length, page, limit, source: 'WoS', fetchedAt: new Date().toISOString() });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Saved database searches ─────────────────────────────────────────
  // Let the user keep a shortlist of frequent queries per source.
  type SavedSearch = { id: string; source: 'scopus' | 'wos'; query: string; label?: string; createdAt: string };
  const readSavedSearches = (): SavedSearch[] => {
    if (!deps) return [];
    return ((deps.getStore() as unknown as { databaseSavedSearches?: SavedSearch[] }).databaseSavedSearches) ?? [];
  };
  const writeSavedSearches = (next: SavedSearch[]) => {
    if (!deps) return;
    (deps.getStore() as unknown as { databaseSavedSearches?: SavedSearch[] }).databaseSavedSearches = next;
    deps.saveStore?.();
  };

  app.get('/api/databases/saved-searches', (c) => c.json(readSavedSearches()));

  const savedSearchSchema = z.object({
    source: z.enum(['scopus', 'wos']),
    query: z.string().trim().min(1).max(500),
    label: z.string().trim().max(80).optional(),
  });

  // 30 req/min per IP+path — generous enough for rapid saves, tight enough
  // to block an accidental client loop.
  const savedSearchRateLimit = rateLimit({ capacity: 10, refillPerSec: 0.5 });
  const syncRateLimit = rateLimit({ capacity: 2, refillPerSec: 1 / 60 }); // ~1/min burst of 2

  app.post('/api/databases/saved-searches', savedSearchRateLimit, async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = savedSearchSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'Invalid payload', messageAr: 'بيانات غير صالحة', issues: parsed.error.issues }, 400);
    }
    const body = parsed.data;
    const list = readSavedSearches();
    // Dedupe by source+query (case-insensitive) — save-idempotent.
    const existing = list.find((s) => s.source === body.source && s.query.toLowerCase() === body.query.trim().toLowerCase());
    if (existing) return c.json(existing);
    const saved: SavedSearch = {
      id: crypto.randomUUID(),
      source: body.source,
      query: body.query.trim(),
      label: body.label?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    writeSavedSearches([saved, ...list].slice(0, 50));
    return c.json(saved, 201);
  });

  app.delete('/api/databases/saved-searches/:id', (c) => {
    const id = c.req.param('id');
    const list = readSavedSearches();
    const next = list.filter((s) => s.id !== id);
    if (next.length === list.length) return c.json({ error: 'not found' }, 404);
    writeSavedSearches(next);
    return c.json({ ok: true });
  });

  // ── Zotero ↔ Vault sync (phase 1: pull Zotero → vault frontmatter) ──
  app.get('/api/zotero/sync/status', (c) => {
    // Pure read. The worker persists status via onStatusUpdate on every
    // scheduled + manual run, so the in-process status is the truth and
    // we don't need to write here.
    return c.json(getSyncStatus());
  });

  app.post('/api/zotero/sync/run', syncRateLimit, async (c) => {
    const logger = deps?.logger ?? {
      info: () => {},
      warn: () => {},
    };
    const body = await c.req.json().catch(() => ({} as { dryRun?: boolean }));
    const dryRun = !!(body as { dryRun?: boolean }).dryRun;
    invalidateZoteroCache();  // R17 — fresh sync invalidates item cache
    const store = deps?.getStore() as unknown as {
      zoteroVaultSync?: { lastRunAt?: string | null; lastRunStats?: unknown; lastError?: string | null; lastDryRunPlan?: unknown; lastZoteroVersion?: number };
      zoteroConfig?: { mode?: 'local' | 'web'; webUserId?: string; writeApiKey?: string };
      zoteroWriteEnabled?: boolean;
    } | undefined;
    const writeConfig = store?.zoteroConfig?.writeApiKey && store.zoteroConfig.webUserId
      ? { userId: store.zoteroConfig.webUserId, writeApiKey: store.zoteroConfig.writeApiKey }
      : undefined;
    try {
      const report = await runZoteroVaultSync({
        logger,
        auditLog: (entry) => auditLog(entry),
        dryRun,
        writeEnabled: !!store?.zoteroWriteEnabled,
        writeConfig,
        deltaEnabled: process.env.ENABLE_ZOTERO_DELTA_SYNC !== 'false',
        getLastZoteroVersion: () => store?.zoteroVaultSync?.lastZoteroVersion ?? 0,
        setLastZoteroVersion: (v) => {
          if (!store) return;
          if (!store.zoteroVaultSync) store.zoteroVaultSync = {};
          store.zoteroVaultSync.lastZoteroVersion = v;
          deps?.saveStore?.();
        },
        setLastDryRunPlan: (plan) => {
          if (!store) return;
          if (!store.zoteroVaultSync) store.zoteroVaultSync = {};
          store.zoteroVaultSync.lastDryRunPlan = plan;
          deps?.saveStore?.();
        },
        onStatusUpdate: (s) => {
          if (!store) return;
          if (!store.zoteroVaultSync) store.zoteroVaultSync = {};
          store.zoteroVaultSync.lastRunAt = s.lastRunAt;
          store.zoteroVaultSync.lastRunStats = s.lastRunStats;
          store.zoteroVaultSync.lastError = s.lastError;
          deps?.saveStore?.();
        },
      });
      return c.json(report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, msg === 'Sync already in progress' ? 409 : 500);
    }
  });

  // Round 2: surface the most recent dry-run plan for the UI.
  app.get('/api/zotero/sync/dry-run-plan', (c) => {
    const store = deps?.getStore() as unknown as { zoteroVaultSync?: { lastDryRunPlan?: unknown[] } } | undefined;
    return c.json({ plan: store?.zoteroVaultSync?.lastDryRunPlan ?? [] });
  });

  // ── Academic database API keys (Scopus, WoS, etc) ───────────────────
  // Stored in store.databaseKeys (separate from chat-LLM apiKeys to avoid clash).
  // Keys are NEVER returned in plain — only "configured: true/false" + last 4 chars.
  app.get('/api/databases/keys', (c) => {
    if (!deps) return c.json({});
    const db = (deps.getStore() as unknown as { databaseKeys?: Record<string, string> }).databaseKeys ?? {};
    const mask = (v?: string) => v ? `••••${v.slice(-4)}` : '';
    return c.json({
      scopusApiKey:    { configured: !!db.scopusApiKey,    masked: mask(db.scopusApiKey) },
      scopusInstToken: { configured: !!db.scopusInstToken, masked: mask(db.scopusInstToken) },
      wosApiKey:       { configured: !!db.wosApiKey,       masked: mask(db.wosApiKey) },
      crossrefMailto:  { configured: !!db.crossrefMailto,  masked: db.crossrefMailto ?? '' },  // not secret
    });
  });

  app.put('/api/databases/keys', async (c) => {
    if (!deps) return c.json({ error: 'no deps' }, 500);
    const body = await c.req.json<Record<string, string>>();
    const allowed = ['scopusApiKey', 'scopusInstToken', 'wosApiKey', 'crossrefMailto'];
    const store = deps.getStore() as unknown as { databaseKeys?: Record<string, string> };
    if (!store.databaseKeys) store.databaseKeys = {};
    for (const [k, v] of Object.entries(body)) {
      if (!allowed.includes(k)) continue;
      if (typeof v !== 'string') continue;
      if (v === '') delete store.databaseKeys[k];
      else store.databaseKeys[k] = v.trim();
    }
    deps.saveStore?.();
    await auditLog({ action: 'databases.keys-updated', source: 'platform:user', meta: { fields: Object.keys(body) } });
    return c.json({ ok: true });
  });

  // Quick test: try to hit /collections with current config
  app.get('/api/zotero/config/test', async (c) => {
    try {
      const cols = await zoteroListCollections();
      return c.json({ ok: true, collectionCount: cols.length });
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 200);
    }
  });


  // ── Backup full Zotero library to local file ─────────────────────
  app.post('/api/zotero/backup', async (c) => {
    try {
      const items = await zoteroListAllItems();
      const collections = await zoteroListCollections();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const dir = path.resolve(process.cwd(), '..', '..', 'data', 'backups');
      await fs.mkdir(dir, { recursive: true });
      const filename = `zotero-backup-${stamp}.json`;
      const fp = path.join(dir, filename);
      await fs.writeFile(fp, JSON.stringify({
        backedUpAt: new Date().toISOString(),
        itemCount: items.length,
        collectionCount: collections.length,
        items,
        collections,
      }, null, 2), 'utf8');
      await auditLog({ action: 'zotero.backup', source: 'platform:user', meta: { itemCount: items.length, filename } });
      return c.json({ ok: true, filename, itemCount: items.length, collectionCount: collections.length, savedTo: fp });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Reset reading-state on every Zotero item (preserves subject tags + collections + PDFs) ──
  // Body: { dryRun?: boolean, alsoClearExtra?: boolean }
  app.post('/api/zotero/reset-reading-state', async (c) => {
    const body = await c.req.json<{ dryRun?: boolean; alsoClearExtra?: boolean; force?: boolean }>().catch(() => ({ dryRun: undefined, alsoClearExtra: undefined, force: undefined }));
    if (!body.force && !body.dryRun) {
      return c.json({
        error: 'Pass { force: true } to actually run, OR { dryRun: true } to preview',
        warning: 'This will MODIFY tags + extra field on every Zotero item. Backup first.',
      }, 400);
    }

    try {
      const items = await zoteroListAllItems();
      const summary = { total: items.length, modified: 0, skipped: 0, failed: 0, samples: [] as Array<{ key: string; title: string; oldTags: string[]; newTags: string[] }> };

      for (const item of items) {
        try {
          const oldTagObjs = (item.data.tags as Array<{ tag: string }> | undefined) ?? [];
          const oldTags = oldTagObjs.map((t) => t.tag);
          const newTags = oldTags.filter((t) => !RESET_TAG_PATTERNS.some((p) => p.test(t)));
          const tagsChanged = newTags.length !== oldTags.length;
          const extraNeedsClearing = body.alsoClearExtra && (item.data.extra ?? '') !== '';

          if (!tagsChanged && !extraNeedsClearing) {
            summary.skipped++;
            continue;
          }

          if (body.dryRun) {
            if (summary.samples.length < 10) {
              summary.samples.push({
                key: item.key,
                title: String(item.data.title ?? '').slice(0, 80),
                oldTags,
                newTags,
              });
            }
            summary.modified++;
            continue;
          }

          if (tagsChanged) {
            await zoteroReplaceTags(item.key, newTags);
          }
          if (extraNeedsClearing) {
            await zoteroClearExtra(item.key);
          }
          summary.modified++;
        } catch {
          summary.failed++;
        }
      }

      if (!body.dryRun) {
        await auditLog({ action: 'zotero.reset-reading-state', source: 'platform:user', meta: summary });
      }
      return c.json(summary);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });


  app.get('/api/zotero/collections', async (c) => {
    try {
      const cols = await zoteroListCollections();
      // Build hierarchical tree (parent → children)
      const map = new Map(cols.map((c) => [c.key, { ...c, children: [] as typeof cols }]));
      const roots: typeof cols = [];
      for (const c of map.values()) {
        if (c.parentCollection && map.has(c.parentCollection)) {
          map.get(c.parentCollection)!.children.push(c);
        } else {
          roots.push(c);
        }
      }
      c.header('Cache-Control', 'private, max-age=300');
      return c.json({ collections: cols, tree: roots, total: cols.length });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // R17 — in-memory cache so the Zotero page doesn't re-download the
  // whole library on every visit/tab-switch. TTL: 5 minutes. Purged
  // whenever `/api/zotero/sync/run` or `/api/zotero/library/refresh`
  // completes. Per-endpoint (items vs items-rich) and per-collection
  // key so switching collections still hits fresh data.
  interface ZoteroCacheEntry { data: unknown; at: number }
  const zoteroCache = new Map<string, ZoteroCacheEntry>();
  const ZOTERO_CACHE_TTL_MS = 5 * 60 * 1000;
  const invalidateZoteroCache = () => zoteroCache.clear();
  const cacheKey = (endpoint: string, collection: string | undefined, limit: number) =>
    `${endpoint}::${collection ?? '_all'}::${limit}`;

  app.get('/api/zotero/items', async (c) => {
    const collection = c.req.query('collection');
    const limit = Number(c.req.query('limit') ?? 100);
    const force = c.req.query('force') === 'true';
    const key = cacheKey('items', collection, limit);
    if (!force) {
      const hit = zoteroCache.get(key);
      if (hit && Date.now() - hit.at < ZOTERO_CACHE_TTL_MS) {
        return c.json({ ...(hit.data as object), cached: true });
      }
    }
    try {
      const items = await zoteroListItems(collection, Number.isFinite(limit) ? limit : 100);
      const payload = { items, total: items.length };
      zoteroCache.set(key, { data: payload, at: Date.now() });
      c.header('Cache-Control', 'private, max-age=300');
      return c.json(payload);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get('/api/zotero/items-rich', async (c) => {
    const collection = c.req.query('collection');
    const limit = Number(c.req.query('limit') ?? 500);
    const force = c.req.query('force') === 'true';
    const key = cacheKey('items-rich', collection, limit);
    if (!force) {
      const hit = zoteroCache.get(key);
      if (hit && Date.now() - hit.at < ZOTERO_CACHE_TTL_MS) {
        return c.json({ ...(hit.data as object), cached: true });
      }
    }
    try {
      const items = await zoteroListItemsRich(collection, Number.isFinite(limit) ? limit : 500);
      const payload = { items, total: items.length };
      zoteroCache.set(key, { data: payload, at: Date.now() });
      c.header('Cache-Control', 'private, max-age=300');
      return c.json(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/not a valid collection key|404/i.test(msg)) {
        return c.json({ items: [], total: 0, invalidCollection: true, hint: 'collection key not found in current Zotero mode' });
      }
      return c.json({ error: msg }, 500);
    }
  });

  // Manual cache buster — UI can call this after the user confirms
  // they've added new items in Zotero and want a fresh pull.
  app.post('/api/zotero/cache/invalidate', (c) => {
    const count = zoteroCache.size;
    invalidateZoteroCache();
    return c.json({ ok: true, cleared: count });
  });

  // References for a paper via OpenAlex (public API — no auth needed). Input: DOI.
  // Returns the paper's references (backward) and citations (forward) with metadata.
  app.get('/api/zotero/references', async (c) => {
    const doi = c.req.query('doi');
    if (!doi?.trim()) return c.json({ error: 'doi required' }, 400);
    const clean = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    try {
      const baseUrl = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(clean)}`;
      const pr = await fetch(baseUrl);
      if (!pr.ok) return c.json({ error: `OpenAlex ${pr.status}` }, 502);
      const paper = await pr.json() as {
        id?: string; title?: string; display_name?: string; referenced_works?: string[];
        cited_by_api_url?: string; cited_by_count?: number;
      };
      const refIds = (paper.referenced_works ?? []).slice(0, 40);

      type Work = {
        id?: string; title?: string; display_name?: string; publication_year?: number; doi?: string;
        authorships?: Array<{ author?: { display_name?: string } }>;
        primary_location?: { source?: { display_name?: string } };
        cited_by_count?: number;
        abstract_inverted_index?: Record<string, number[]>;
        type?: string; open_access?: { is_oa?: boolean; oa_url?: string };
        updated_date?: string;
      };

      async function fetchById(id: string): Promise<Work | null> {
        try {
          const r = await fetch(`https://api.openalex.org/works/${encodeURIComponent(id.replace(/^https?:\/\/openalex\.org\//, ''))}`);
          if (!r.ok) return null;
          return await r.json() as Work;
        } catch { return null; }
      }
      const refs = (await Promise.all(refIds.map(fetchById))).filter((x): x is Work => !!x);

      // Citations (forward): one page of most-cited works that cite this paper
      let citations: Work[] = [];
      if (paper.cited_by_api_url) {
        try {
          const cr = await fetch(`${paper.cited_by_api_url}&per-page=30&sort=cited_by_count:desc`);
          if (cr.ok) {
            const cj = await cr.json() as { results?: Work[] };
            citations = cj.results ?? [];
          }
        } catch {}
      }

      const shape = (w: Work) => ({
        id: w.id,
        title: w.title ?? w.display_name ?? '',
        year: w.publication_year,
        doi: w.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') ?? '',
        authors: (w.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean).join(', '),
        journal: w.primary_location?.source?.display_name ?? '',
        citedByCount: w.cited_by_count ?? 0,
        abstract: decodeInvertedIndex(w.abstract_inverted_index),
        type: w.type ?? '',
        openAccessUrl: w.open_access?.oa_url ?? '',
        openAlexUpdated: w.updated_date ?? '',
      });

      return c.json({
        paper: { title: paper.title ?? paper.display_name, citedByCount: paper.cited_by_count ?? 0 },
        references: refs.map(shape),
        citations: citations.map(shape),
        fetchedAt: new Date().toISOString(),
        source: 'OpenAlex',
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // AI triage: given the parent paper context + a list of references (with abstracts),
  // ask Claude which ones to add and why. Returns ranked recommendations with reasons.
  // Body: { parent: {title,year,abstract}, candidates: [{title,authors,year,doi,journal,abstract,citedByCount}] }
  app.post('/api/zotero/references/triage', async (c) => {
    const body = await c.req.json<{
      parent: { title: string; year?: number; abstract?: string; doi?: string };
      candidates: Array<{ title: string; authors?: string; year?: number; doi?: string; journal?: string; abstract?: string; citedByCount?: number }>;
      researchTopic?: string;
      force?: boolean;
    }>();
    if (!body.candidates?.length) return c.json({ error: 'candidates required' }, 400);

    if (!deps) return c.json({ error: 'AI triage not configured (deps missing)' }, 500);
    const store = deps.getStore();

    // Cache-first lookup by parent DOI (saves tokens)
    if (body.parent.doi && !body.force) {
      const cache = (store as unknown as { zoteroAiTriage?: Record<string, { recommendations: unknown[]; generatedAt: string }> }).zoteroAiTriage ?? {};
      const cached = cache[body.parent.doi];
      if (cached) return c.json({ recommendations: cached.recommendations, fromCache: true, generatedAt: cached.generatedAt });
    }

    const anthropicRow = store.providers.find((p) => p.type === 'anthropic' && p.enabled && p.apiKey);
    if (!anthropicRow?.apiKey) return c.json({ error: 'No Anthropic provider configured' }, 503);
    if (!deps.anthropicCache.current) {
      deps.anthropicCache.current = new AnthropicProvider(anthropicRow.apiKey, anthropicRow.baseUrl || undefined);
    }

    const topic = body.researchTopic ?? 'BIM (Building Information Modelling) adoption in Kuwait and the GCC region';
    const candList = body.candidates.slice(0, 30).map((c, i) =>
      `${i + 1}. "${c.title}" (${c.year ?? 'n.d.'}) — ${c.authors ?? 'unknown'}${c.journal ? ` | ${c.journal}` : ''}${c.citedByCount ? ` | ${c.citedByCount} citations` : ''}\n   Abstract: ${c.abstract?.slice(0, 600) ?? '(no abstract)'}`
    ).join('\n\n');

    const sys = `أنت مساعد بحثي خبير. مهمتك: مراجعة قائمة من المراجع لورقة معيّنة وتحديد أيّها يستحق الإضافة لمكتبة الباحث.

موضوع بحث الباحث: ${topic}

ستحصل على:
- الورقة الأم (السياق)
- قائمة مرشّحة (مراجعها أو الاستشهادات بها)

أعطني مخرجاً JSON بهذه الصيغة فقط (بدون أي نص قبله أو بعده):
{
  "recommendations": [
    { "index": 1, "decision": "add" | "skip" | "maybe", "priority": "high" | "medium" | "low", "reason": "سبب موجز بالعربية في سطرين كحد أقصى" }
  ]
}

قواعد:
- "add" فقط للأوراق التي تخدم الموضوع مباشرة (BIM، تبني التكنولوجيا في البناء، الكويت/الخليج، المنهجيات ذات الصلة)
- "skip" للأوراق غير ذات الصلة أو القديمة جداً (قبل 2010 إلا للأوراق الكلاسيكية المهمة)
- "maybe" للأوراق المحتملة ذات الصلة الجزئية
- اذكر السبب بالعربية، مرتبطاً بأبستراكت الورقة الفعلي
- رتّب بالـ priority: high للأوراق الأكثر صلة وأهمية`;

    const user = `## الورقة الأم
"${body.parent.title}" (${body.parent.year ?? 'n.d.'})
Abstract: ${body.parent.abstract?.slice(0, 600) ?? '(no abstract)'}

## المرشّحون (${body.candidates.length})
${candList}

أعطني JSON الفرز الآن.`;

    try {
      let out = '';
      for await (const chunk of deps.anthropicCache.current.chat({
        model: 'claude-haiku-4-5-20251001',
        systemPrompt: sys,
        messages: [{ role: 'user', content: user }],
        maxTokens: 3000,
        temperature: 0.3,
      })) {
        if (chunk.type === 'text') out += chunk.content;
        if (chunk.type === 'done' || chunk.type === 'error') break;
      }
      // Extract JSON
      const m = out.match(/\{[\s\S]*\}/);
      if (!m) return c.json({ error: 'Could not parse AI response', raw: out.slice(0, 500) }, 500);
      const parsed = JSON.parse(m[0]) as { recommendations: Array<{ index: number; decision: string; priority: string; reason: string }> };
      const recs = parsed.recommendations ?? [];
      const generatedAt = new Date().toISOString();
      // Cache by parent DOI
      if (body.parent.doi) {
        const s = store as unknown as { zoteroAiTriage?: Record<string, { recommendations: unknown[]; generatedAt: string }> };
        if (!s.zoteroAiTriage) s.zoteroAiTriage = {};
        s.zoteroAiTriage[body.parent.doi] = { recommendations: recs, generatedAt };
        deps.saveStore?.();
      }
      return c.json({ recommendations: recs, fromCache: false, generatedAt });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Cached AI suggestions store (saves tokens — only regenerate on demand) ──
  // Stored in store.zoteroAiSuggestions: { [itemKey]: { suggestions, generatedAt } }

  app.get('/api/zotero/ai-suggest/:key', (c) => {
    if (!deps) return c.json({ cached: null });
    const key = c.req.param('key');
    const cache = (deps.getStore() as unknown as { zoteroAiSuggestions?: Record<string, { suggestions: unknown[]; generatedAt: string }> }).zoteroAiSuggestions ?? {};
    const entry = cache[key];
    if (!entry) return c.json({ cached: null });
    return c.json({ cached: entry.suggestions, generatedAt: entry.generatedAt });
  });

  // Same for AI Triage cache (per parent DOI)
  app.get('/api/zotero/triage/:doi', (c) => {
    if (!deps) return c.json({ cached: null });
    const doi = c.req.param('doi');
    const cache = (deps.getStore() as unknown as { zoteroAiTriage?: Record<string, { recommendations: unknown[]; generatedAt: string }> }).zoteroAiTriage ?? {};
    const entry = cache[doi];
    if (!entry) return c.json({ cached: null });
    return c.json({ cached: entry.recommendations, generatedAt: entry.generatedAt });
  });

  // AI-suggest related papers for a given paper (by DOI or title).
  // Body: { doi?: string, title?: string, context?: string }
  // Returns: { suggestions: [{ title, authors, year, doi, reason }] }
  app.post('/api/zotero/ai-suggest', async (c) => {
    const body = await c.req.json<{ doi?: string; title?: string; context?: string; itemKey?: string; force?: boolean }>().catch(() => ({} as { doi?: string; title?: string; context?: string; itemKey?: string; force?: boolean }));
    if (!body.doi && !body.title) return c.json({ error: 'doi or title required' }, 400);

    // Cache-first: skip the call if we already have suggestions for this item
    // and the user didn't pass force=true.
    if (deps && body.itemKey && !body.force) {
      const cache = (deps.getStore() as unknown as { zoteroAiSuggestions?: Record<string, { suggestions: unknown[]; generatedAt: string }> }).zoteroAiSuggestions ?? {};
      const cached = cache[body.itemKey];
      if (cached) return c.json({ suggestions: cached.suggestions, fromCache: true, generatedAt: cached.generatedAt });
    }

    // Prefer OpenAlex's "related_works" when we have a DOI (algorithmic).
    const clean = body.doi?.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    try {
      if (clean) {
        const pr = await fetch(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(clean)}`);
        if (pr.ok) {
          const paper = await pr.json() as { related_works?: string[] };
          const relIds = (paper.related_works ?? []).slice(0, 15);
          const shape = async (id: string) => {
            const r = await fetch(`https://api.openalex.org/works/${encodeURIComponent(id.replace(/^https?:\/\/openalex\.org\//, ''))}`);
            if (!r.ok) return null;
            const w = await r.json() as { id?: string; title?: string; display_name?: string; publication_year?: number; doi?: string; authorships?: Array<{ author?: { display_name?: string } }>; primary_location?: { source?: { display_name?: string } }; cited_by_count?: number; abstract_inverted_index?: Record<string, number[]> };
            return {
              id: w.id,
              title: w.title ?? w.display_name ?? '',
              year: w.publication_year,
              doi: w.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') ?? '',
              authors: (w.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean).join(', '),
              journal: w.primary_location?.source?.display_name ?? '',
              citedByCount: w.cited_by_count ?? 0,
              reason: 'OpenAlex related work (algorithmic similarity)',
            };
          };
          const results = (await Promise.all(relIds.map(shape))).filter((x): x is NonNullable<typeof x> => !!x);
          // Cache for next time
          if (deps && body.itemKey) {
            const s = deps.getStore() as unknown as { zoteroAiSuggestions?: Record<string, { suggestions: unknown[]; generatedAt: string }> };
            if (!s.zoteroAiSuggestions) s.zoteroAiSuggestions = {};
            s.zoteroAiSuggestions[body.itemKey] = { suggestions: results, generatedAt: new Date().toISOString() };
            deps.saveStore?.();
          }
          return c.json({ suggestions: results, fromCache: false, generatedAt: new Date().toISOString() });
        }
      }
      // Fallback: search OpenAlex by title
      if (body.title) {
        const sr = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(body.title)}&per-page=15&sort=cited_by_count:desc`);
        if (sr.ok) {
          const sj = await sr.json() as { results?: Array<{ id?: string; title?: string; display_name?: string; publication_year?: number; doi?: string; authorships?: Array<{ author?: { display_name?: string } }>; primary_location?: { source?: { display_name?: string } }; cited_by_count?: number }> };
          const suggestions = (sj.results ?? []).map((w) => ({
            id: w.id,
            title: w.title ?? w.display_name ?? '',
            year: w.publication_year,
            doi: w.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') ?? '',
            authors: (w.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean).join(', '),
            journal: w.primary_location?.source?.display_name ?? '',
            citedByCount: w.cited_by_count ?? 0,
            reason: 'Title search match',
          }));
          if (deps && body.itemKey) {
            const s = deps.getStore() as unknown as { zoteroAiSuggestions?: Record<string, { suggestions: unknown[]; generatedAt: string }> };
            if (!s.zoteroAiSuggestions) s.zoteroAiSuggestions = {};
            s.zoteroAiSuggestions[body.itemKey] = { suggestions, generatedAt: new Date().toISOString() };
            deps.saveStore?.();
          }
          return c.json({ suggestions, fromCache: false, generatedAt: new Date().toISOString() });
        }
      }
      return c.json({ suggestions: [] });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // Import a single external paper into Zotero (from AI suggestion / reference browser)
  // Body: { title, authors?, year?, doi?, abstract?, url? }
  app.post('/api/zotero/import-external', async (c) => {
    const body = await c.req.json<{
      title: string; authors?: string; year?: number; doi?: string;
      abstractNote?: string; url?: string;
    }>();
    if (!body.title?.trim()) return c.json({ error: 'title required' }, 400);
    try {
      const authorsList = (body.authors ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((full) => {
        const parts = full.split(/\s+/);
        return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] ?? '' };
      });
      const itemKey = await createZoteroItem({
        title: body.title.trim(),
        authors: authorsList.length > 0 ? authorsList : undefined,
        year: body.year,
        doi: body.doi,
        url: body.url,
        itemType: 'journalArticle',
        abstractNote: body.abstractNote,
      });
      await auditLog({ action: 'zotero.import-external', source: 'platform:user', meta: { itemKey, title: body.title, doi: body.doi } });
      return c.json({ ok: true, itemKey });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Library refresh tracker — reminds user every 2 weeks ────────────
  // No auto-refresh (saves API quota + cost). Just records when user pressed Refresh
  // last and reports staleness so the UI can show a banner.
  app.get('/api/zotero/refresh-status', (c) => {
    if (!deps) return c.json({ lastRefreshAt: null, daysSince: null, overdue: false });
    const store = deps.getStore() as unknown as { zoteroLastRefreshAt?: string };
    const last = store.zoteroLastRefreshAt;
    if (!last) return c.json({ lastRefreshAt: null, daysSince: null, overdue: true, thresholdDays: 14 });
    const days = Math.floor((Date.now() - new Date(last).getTime()) / (24 * 60 * 60 * 1000));
    return c.json({ lastRefreshAt: last, daysSince: days, overdue: days >= 14, thresholdDays: 14 });
  });

  app.post('/api/zotero/refresh-status/mark', async (c) => {
    if (!deps) return c.json({ error: 'no deps' }, 500);
    const store = deps.getStore() as unknown as { zoteroLastRefreshAt?: string };
    store.zoteroLastRefreshAt = new Date().toISOString();
    deps.saveStore?.();
    invalidateZoteroCache();  // R17 — refresh means user wants fresh data
    await auditLog({ action: 'zotero.library-refresh', source: 'platform:user', meta: { at: store.zoteroLastRefreshAt } });
    return c.json({ ok: true, lastRefreshAt: store.zoteroLastRefreshAt });
  });

  // ── AI auto-classify a Zotero item — suggests tags + reading priority + status ──
  // Body: { itemKey: string, apply?: boolean }
  // If apply=true, applies the suggested tags directly to the Zotero item.
  // Otherwise returns a preview the user can edit before applying.
  app.post('/api/zotero/items/:key/ai-classify', async (c) => {
    if (!deps) return c.json({ error: 'no deps' }, 500);
    const key = c.req.param('key');
    const body = await c.req.json<{ apply?: boolean }>().catch(() => ({} as { apply?: boolean }));

    const store = deps.getStore();
    const anthropicRow = store.providers.find((p) => p.type === 'anthropic' && p.enabled && p.apiKey);
    if (!anthropicRow?.apiKey) return c.json({ error: 'No Anthropic provider configured' }, 503);
    if (!deps.anthropicCache.current) {
      deps.anthropicCache.current = new AnthropicProvider(anthropicRow.apiKey, anthropicRow.baseUrl || undefined);
    }

    try {
      const { zoteroFetchFullItem, zoteroReplaceTags } = await import('@ruhool/core');
      const full = await zoteroFetchFullItem(key);
      const d = full.data as Record<string, unknown>;
      const title = String(d.title ?? '');
      const abstract = String(d.abstractNote ?? '');
      const authors = Array.isArray(d.creators)
        ? (d.creators as Array<{ firstName?: string; lastName?: string }>).map((c) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()).join(', ')
        : '';
      const existingTags = ((d.tags as Array<{ tag: string }> | undefined) ?? []).map((t) => t.tag);

      const sys = `أنت مصنّف بحثي خبير في موضوع "تبني نمذجة معلومات البناء (BIM) في الكويت ودول الخليج". مهمتك: اقرأ ورقة وأرجع JSON دقيق فقط.

أرجع JSON بهذه الصيغة بالضبط (بدون أي نص قبله أو بعده):
{
  "tags": ["tag1", "tag2", ...],
  "readingPriority": "high" | "medium" | "low",
  "readingStatus": "to-read" | "reading" | "read" | "skip",
  "rating": 0 | 1 | 2 | 3,
  "relevance": "high" | "medium" | "low",
  "reason": "سبب التصنيف بالعربية في سطرين كحد أقصى"
}

قواعد التاقات (3-7 تاقات):
- subject tags: BIM, adoption, methodology, case-study, contracts, education, GCC, Kuwait, etc.
- theory tags لو واضحة: TOE, UTAUT, Diffusion, Institutional
- region tags لو منطقة محددة: UK, Saudi, UAE, Qatar
- اكتب بالإنجليزية، lowercase، بدون مسافات (استخدم - أو _)

readingPriority:
- high = صلة مباشرة بـ BIM adoption في GCC، أو ورقة كلاسيكية مهمة
- medium = صلة موضوعية لكن ليست مباشرة
- low = صلة سطحية أو منهجية فقط

rating (تقييم استباقي):
- 3 = ورقة أساسية، يجب قراءتها
- 2 = مهمة لمراجعة الأدبيات
- 1 = للاستشهاد فقط
- 0 = لم تُحدد بعد`;

      const user = `## الورقة
العنوان: ${title}
المؤلفون: ${authors}
السنة: ${d.date ?? 'n.d.'}
النوع: ${d.itemType ?? ''}

## Abstract
${abstract.slice(0, 2000) || '(لا يوجد abstract)'}

## التاقات الحالية
${existingTags.length > 0 ? existingTags.join(', ') : '(لا يوجد)'}

أعطني JSON التصنيف الآن.`;

      let out = '';
      for await (const chunk of deps.anthropicCache.current.chat({
        model: 'claude-haiku-4-5-20251001',
        systemPrompt: sys,
        messages: [{ role: 'user', content: user }],
        maxTokens: 800,
        temperature: 0.3,
      })) {
        if (chunk.type === 'text') out += chunk.content;
        if (chunk.type === 'done' || chunk.type === 'error') break;
      }
      const m = out.match(/\{[\s\S]*\}/);
      if (!m) return c.json({ error: 'Could not parse AI response', raw: out.slice(0, 500) }, 500);
      const parsed = JSON.parse(m[0]) as {
        tags: string[]; readingPriority: string; readingStatus: string;
        rating: number; relevance: string; reason: string;
      };

      // Optionally apply directly
      if (body.apply) {
        const newTags = [
          ...existingTags.filter((t) => !/^⭐+$/.test(t) && !['to-read', 'reading', 'read', 'skip'].includes(t)),
          ...parsed.tags,
          parsed.readingStatus,
          ...(parsed.rating > 0 ? ['⭐'.repeat(parsed.rating)] : []),
        ];
        await zoteroReplaceTags(key, [...new Set(newTags)]);
        await auditLog({ action: 'zotero.ai-classify-applied', source: 'platform:user', meta: { itemKey: key, tags: parsed.tags, priority: parsed.readingPriority } });
      }

      return c.json({ ...parsed, applied: !!body.apply });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // Apply (add) tags to an existing Zotero item without removing existing tags.
  // Body: { itemKey, addTags: string[] }
  app.post('/api/zotero/items/apply-tags', async (c) => {
    const body = await c.req.json<{ itemKey: string; addTags: string[] }>();
    if (!body.itemKey || !Array.isArray(body.addTags)) return c.json({ error: 'itemKey and addTags required' }, 400);
    try {
      const { zoteroFetchFullItem, zoteroReplaceTags } = await import('@ruhool/core');
      const full = await zoteroFetchFullItem(body.itemKey);
      const existing = ((full.data.tags as Array<{ tag: string }> | undefined) ?? []).map((t) => t.tag);
      const merged = [...new Set([...existing, ...body.addTags.filter(Boolean)])];
      await zoteroReplaceTags(body.itemKey, merged);
      await auditLog({ action: 'zotero.apply-tags', source: 'platform:user', meta: { itemKey: body.itemKey, added: body.addTags } });
      return c.json({ ok: true, tags: merged });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── AI suggestion approvals — defer/approve/reject workflow ──────────
  // Stores pending suggestions so user can review them later (not deleted on refresh).
  // For now, kept lightweight in memory; could move to audit log later.
  app.post('/api/zotero/suggestions/defer', async (c) => {
    const body = await c.req.json<{ items: Array<{ title: string; doi?: string; year?: number; authors?: string; reason?: string }> }>();
    await auditLog({ action: 'zotero.suggestion.deferred', source: 'platform:user', meta: { count: body.items.length, items: body.items.slice(0, 20) } });
    return c.json({ ok: true, deferred: body.items.length });
  });
  app.post('/api/zotero/suggestions/reject', async (c) => {
    const body = await c.req.json<{ doi?: string; title: string }>();
    await auditLog({ action: 'zotero.suggestion.rejected', source: 'platform:user', meta: body });
    return c.json({ ok: true });
  });

  app.get('/api/zotero/search', async (c) => {
    const q = c.req.query('q') ?? '';
    if (!q.trim()) return c.json({ items: [] });
    try {
      const items = await zoteroSearchByTitle(q, 20);
      return c.json({ items });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // Push a source from the platform → Zotero (creates a new Zotero item)
  // Body: { title, authors?, year?, doi?, type?, abstractNote? }
  app.post('/api/zotero/push', async (c) => {
    const body = await c.req.json<{
      title: string;
      authors?: string;
      year?: number;
      doi?: string;
      type?: string;
      abstractNote?: string;
    }>();
    if (!body.title?.trim()) return c.json({ error: 'title required' }, 400);
    try {
      // Convert "First Last, Other Author" string → [{firstName, lastName}]
      const authorsList = (body.authors ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((full) => {
        const parts = full.split(/\s+/);
        return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] ?? '' };
      });
      const itemKey = await createZoteroItem({
        title: body.title.trim(),
        authors: authorsList.length > 0 ? authorsList : undefined,
        year: body.year,
        doi: body.doi,
        itemType: body.type ?? 'journalArticle',
        abstractNote: body.abstractNote,
      });
      await auditLog({ action: 'zotero.push', source: 'platform:user', meta: { itemKey, title: body.title } });
      return c.json({ ok: true, itemKey });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // Sync entire Zotero collection → vault (creates notes for any missing)
  // Body: { collectionKey?, dryRun? }
  app.post('/api/zotero/sync-collection', async (c) => {
    const body = await c.req.json<{ collectionKey?: string; dryRun?: boolean }>().catch(() => ({} as { collectionKey?: string; dryRun?: boolean }));
    try {
      const items = await zoteroListItems(body.collectionKey, 200);
      const today = new Date().toISOString().slice(0, 10);
      const result: Array<{ itemKey: string; title: string; status: string; path?: string; error?: string }> = [];

      for (const item of items) {
        const safeTitle = item.title.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
        const yearStr = item.year ? `${item.year}-` : '';
        const relPath = `01 PhD/01 Sources/Papers/${yearStr}${safeTitle}.md`;

        if (await noteExists(relPath)) {
          result.push({ itemKey: item.itemKey, title: item.title, status: 'exists', path: relPath });
          continue;
        }

        if (body.dryRun) {
          result.push({ itemKey: item.itemKey, title: item.title, status: 'will-create', path: relPath });
          continue;
        }

        try {
          const paper = await fetchZoteroPaper(item.itemKey);
          const meta = paper.meta;
          const fm: Record<string, unknown> = {
            Citekey: item.itemKey,
            Type: meta.itemType ?? 'journalArticle',
            Year: meta.year ?? null,
            Authors: meta.authors ?? null,
            Added_On: today,
            DOI: meta.doi ?? null,
            Journal: meta.journal ?? null,
            zoteroItemKey: item.itemKey,
            tags: [],
            Reading_status: 'To Read',
            reading_priority: 'medium',
            notes_exported: false,
          };
          const yamlBlock = writeFrontmatter(fm, Object.keys(fm));
          const content = [
            '---', yamlBlock, '---', '',
            `# ${meta.title ?? item.title}`,
            '',
            meta.abstractNote ? `> [!abstract]- Abstract\n> ${meta.abstractNote.replace(/\n/g, '\n> ')}\n` : '',
            '## 📝 ملاحظاتي', '',
            '## 🔆 Highlights', '',
            '## 🔗 Related', '',
          ].join('\n');
          await writeNoteRaw(relPath, content);
          result.push({ itemKey: item.itemKey, title: item.title, status: 'created', path: relPath });
        } catch (err) {
          result.push({ itemKey: item.itemKey, title: item.title, status: 'failed', error: err instanceof Error ? err.message : String(err) });
        }
      }

      const created = result.filter((r) => r.status === 'created').length;
      const skipped = result.filter((r) => r.status === 'exists').length;
      const failed = result.filter((r) => r.status === 'failed').length;

      if (!body.dryRun) {
        await auditLog({
          action: 'zotero.sync-collection',
          source: 'platform:user',
          meta: { collectionKey: body.collectionKey, created, skipped, failed },
        });
      }

      return c.json({ result, summary: { total: items.length, created, skipped, failed } });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
}
