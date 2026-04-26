/**
 * Library Matrix routes — literature review imports + matrix schemas + Excel export.
 *
 * Concepts:
 * - The user's PhD vault contains markdown files with rich frontmatter
 *   (Citekey, Authors, aims, methodology, key_findings, etc.).
 * - We parse those frontmatter blocks and import them as LibraryEntity records
 *   with a matching customFields blob — preserving every property.
 * - Each EntityType gets its own MatrixSchema so academic papers can have
 *   different columns from books, reports, or grey literature.
 */
import crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Hono } from 'hono';
import type { StoreData, LibraryEntity, MatrixColumn, MatrixSchema, EntityType } from '../store/types.js';
import { IMMUTABLE_TOP_LEVEL_KEYS } from '../store/library-immutable.js';

export interface LibraryMatrixDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Frontmatter parser — handles YAML-like blocks at top of .md files.
// Doesn't pull in a YAML dep; covers the shape this codebase uses.

interface ParsedFrontmatter {
  raw: Record<string, unknown>;
  body: string;
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  const out: Record<string, unknown> = {};
  if (!content.startsWith('---')) return { raw: out, body: content };
  const end = content.indexOf('\n---', 3);
  if (end === -1) return { raw: out, body: content };
  const fm = content.slice(3, end).trim();
  const body = content.slice(end + 4).trimStart();

  const lines = fm.split('\n');
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  const flushList = () => {
    if (currentKey !== null && currentList !== null) {
      out[currentKey] = currentList;
    }
    currentList = null;
  };

  for (const line of lines) {
    if (!line.trim()) { flushList(); currentKey = null; continue; }
    // List item under previous key
    if (line.startsWith('  - ') || line.startsWith('- ')) {
      const item = line.replace(/^\s*-\s*/, '').trim();
      if (currentList === null) currentList = [];
      // Strip surrounding quotes
      const v = item.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
      currentList.push(v);
      continue;
    }
    // key: value
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (m) {
      flushList();
      currentKey = m[1];
      const rawValue = m[2].trim();
      if (rawValue === '') {
        // Will be a list (next lines) or empty value
        currentList = [];
        out[currentKey] = '';
      } else {
        // Strip surrounding quotes
        const v = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
        out[currentKey] = v;
        currentList = null;
      }
    }
  }
  flushList();
  return { raw: out, body };
}

// ────────────────────────────────────────────────────────────────────────────
// Default matrix schema for `paper` type — mirrors the user's PhD vault columns.

const DEFAULT_PAPER_COLUMNS: MatrixColumn[] = [
  { key: 'title',                 labelEn: 'Title',              labelAr: 'العنوان',          kind: 'string', visible: true,  width: 360, order: 0,  source: 'top-level' },
  { key: 'authors',               labelEn: 'Authors',            labelAr: 'المؤلفون',          kind: 'string', visible: true,  width: 200, order: 1,  source: 'top-level' },
  { key: 'year',                  labelEn: 'Year',               labelAr: 'السنة',             kind: 'number', visible: true,  width: 70,  order: 2,  source: 'top-level' },
  { key: 'citekey',               labelEn: 'Citekey',            labelAr: 'مفتاح الاستشهاد',   kind: 'string', visible: false, width: 180, order: 3,  source: 'top-level' },
  { key: 'doi',                   labelEn: 'DOI',                labelAr: 'DOI',               kind: 'string', visible: false, width: 180, order: 4,  source: 'top-level' },
  { key: 'url',                   labelEn: 'URL',                labelAr: 'الرابط',            kind: 'url',    visible: false, width: 180, order: 5,  source: 'top-level' },
  { key: 'tags',                  labelEn: 'Tags',               labelAr: 'الوسوم',           kind: 'tags',   visible: true,  width: 180, order: 6,  source: 'top-level' },
  { key: 'readingStatus',         labelEn: 'Reading Status',     labelAr: 'حالة القراءة',     kind: 'select', options: ['to-read','skimming','reading','paused','done'], visible: true, width: 120, order: 7, source: 'top-level' },
  { key: 'readingDepth',          labelEn: 'Reading Depth',      labelAr: 'عمق القراءة',      kind: 'select', options: ['title-abstract-conclusion','scan-only','selective','full'], visible: true, width: 140, order: 8, source: 'top-level' },
  { key: 'aims',                  labelEn: 'Aims',               labelAr: 'الأهداف',           kind: 'text',   visible: true,  width: 280, order: 9,  source: 'custom' },
  { key: 'research_questions',    labelEn: 'Research Questions', labelAr: 'أسئلة البحث',      kind: 'list',   visible: false, width: 280, order: 10, source: 'custom' },
  { key: 'methodology',           labelEn: 'Methodology',        labelAr: 'المنهجية',          kind: 'text',   visible: true,  width: 240, order: 11, source: 'custom' },
  { key: 'sample_type_and_size',  labelEn: 'Sample',             labelAr: 'العينة',            kind: 'text',   visible: false, width: 200, order: 12, source: 'custom' },
  { key: 'Case_study',            labelEn: 'Case Study',         labelAr: 'دراسة حالة',        kind: 'string', visible: false, width: 140, order: 13, source: 'custom' },
  { key: 'key_themes',            labelEn: 'Key Themes',         labelAr: 'المحاور',           kind: 'list',   visible: true,  width: 220, order: 14, source: 'custom' },
  { key: 'key_findings',          labelEn: 'Key Findings',       labelAr: 'النتائج',           kind: 'list',   visible: true,  width: 280, order: 15, source: 'custom' },
  { key: 'strengths',             labelEn: 'Strengths',          labelAr: 'نقاط القوة',        kind: 'list',   visible: false, width: 200, order: 16, source: 'custom' },
  { key: 'limitations',           labelEn: 'Limitations',        labelAr: 'القيود',            kind: 'list',   visible: false, width: 200, order: 17, source: 'custom' },
  { key: 'relevant_to_my_study',  labelEn: 'Relevance',          labelAr: 'الصلة',             kind: 'string', visible: true,  width: 100, order: 18, source: 'custom' },
  { key: 'why_relevant',          labelEn: 'Why Relevant',       labelAr: 'سبب الصلة',         kind: 'list',   visible: false, width: 240, order: 19, source: 'custom' },
  { key: 'Resource_quality',      labelEn: 'Quality',            labelAr: 'الجودة',            kind: 'string', visible: false, width: 160, order: 20, source: 'custom' },
  { key: 'keep_or_discard',       labelEn: 'Keep/Discard',       labelAr: 'احتفاظ/استبعاد',   kind: 'select', options: ['Keep','Discard','Maybe'], visible: false, width: 110, order: 21, source: 'custom' },
  { key: 'PRISMA_1_stage',        labelEn: 'PRISMA-1',           labelAr: 'PRISMA-1',          kind: 'string', visible: false, width: 110, order: 22, source: 'custom' },
  { key: 'PRISMA_2_stage',        labelEn: 'PRISMA-2',           labelAr: 'PRISMA-2',          kind: 'string', visible: false, width: 110, order: 23, source: 'custom' },
  { key: 'my_notes',              labelEn: 'My Notes',           labelAr: 'ملاحظاتي',           kind: 'text',   visible: false, width: 280, order: 24, source: 'top-level' },
];

const DEFAULT_BOOK_COLUMNS: MatrixColumn[] = [
  { key: 'title',     labelEn: 'Title',     labelAr: 'العنوان',  kind: 'string', visible: true,  width: 320, order: 0, source: 'top-level' },
  { key: 'authors',   labelEn: 'Authors',   labelAr: 'المؤلفون', kind: 'string', visible: true,  width: 200, order: 1, source: 'top-level' },
  { key: 'year',      labelEn: 'Year',      labelAr: 'السنة',    kind: 'number', visible: true,  width: 70,  order: 2, source: 'top-level' },
  { key: 'publisher', labelEn: 'Publisher', labelAr: 'الناشر',   kind: 'string', visible: true,  width: 180, order: 3, source: 'top-level' },
  { key: 'isbn',      labelEn: 'ISBN',      labelAr: 'ISBN',     kind: 'string', visible: false, width: 140, order: 4, source: 'top-level' },
  { key: 'tags',      labelEn: 'Tags',      labelAr: 'الوسوم',  kind: 'tags',   visible: true,  width: 180, order: 5, source: 'top-level' },
  { key: 'readingStatus', labelEn: 'Status', labelAr: 'الحالة', kind: 'select', options: ['to-read','skimming','reading','paused','done'], visible: true, width: 120, order: 6, source: 'top-level' },
];

const DEFAULT_REPORT_COLUMNS: MatrixColumn[] = [
  { key: 'title',     labelEn: 'Title',     labelAr: 'العنوان',  kind: 'string', visible: true,  width: 360, order: 0, source: 'top-level' },
  { key: 'authors',   labelEn: 'Author/Org',labelAr: 'المؤلف/الجهة', kind: 'string', visible: true, width: 200, order: 1, source: 'top-level' },
  { key: 'year',      labelEn: 'Year',      labelAr: 'السنة',    kind: 'number', visible: true,  width: 70,  order: 2, source: 'top-level' },
  { key: 'publisher', labelEn: 'Issuer',    labelAr: 'الجهة المصدرة', kind: 'string', visible: true, width: 180, order: 3, source: 'top-level' },
  { key: 'tags',      labelEn: 'Tags',      labelAr: 'الوسوم',  kind: 'tags',   visible: true,  width: 200, order: 4, source: 'top-level' },
  { key: 'readingStatus', labelEn: 'Status', labelAr: 'الحالة', kind: 'select', options: ['to-read','skimming','reading','paused','done'], visible: true, width: 120, order: 5, source: 'top-level' },
];

function defaultColumnsForType(type: EntityType): MatrixColumn[] {
  if (type === 'paper') return DEFAULT_PAPER_COLUMNS;
  if (type === 'book') return DEFAULT_BOOK_COLUMNS;
  if (type === 'report') return DEFAULT_REPORT_COLUMNS;
  // Generic fallback
  return [
    { key: 'title',     labelEn: 'Title',  labelAr: 'العنوان',  kind: 'string', visible: true, width: 320, order: 0, source: 'top-level' },
    { key: 'tags',      labelEn: 'Tags',   labelAr: 'الوسوم',  kind: 'tags',   visible: true, width: 200, order: 1, source: 'top-level' },
    { key: 'readingStatus', labelEn: 'Status', labelAr: 'الحالة', kind: 'select', options: ['to-read','skimming','reading','paused','done'], visible: true, width: 120, order: 2, source: 'top-level' },
  ];
}

function ensureSchema(store: StoreData, type: EntityType): MatrixSchema {
  if (!store.matrixSchemas) store.matrixSchemas = [];
  let schema = store.matrixSchemas.find(s => s.type === type);
  if (!schema) {
    schema = { type, columns: defaultColumnsForType(type), updatedAt: new Date().toISOString() };
    store.matrixSchemas.push(schema);
  }
  return schema;
}

// ────────────────────────────────────────────────────────────────────────────
// Excel/CSV export — produces CSV (importable into Excel directly)

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = Array.isArray(v) ? v.map(String).join(' | ') : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function entitiesToCsv(entities: LibraryEntity[], schema: MatrixSchema, visibleOnly: boolean): string {
  const cols = schema.columns
    .filter(c => visibleOnly ? c.visible : true)
    .sort((a, b) => a.order - b.order);
  const header = cols.map(c => csvCell(c.labelEn)).join(',');
  const lines = [header];
  for (const e of entities) {
    const row = cols.map(c => {
      if (c.source === 'top-level') {
        const v = (e as unknown as Record<string, unknown>)[c.key];
        return csvCell(v);
      }
      return csvCell(e.customFields?.[c.key]);
    });
    lines.push(row.join(','));
  }
  return '﻿' + lines.join('\n'); // BOM so Excel reads UTF-8 correctly
}

// ────────────────────────────────────────────────────────────────────────────

export function registerLibraryMatrixRoutes(app: Hono, deps: LibraryMatrixDeps): void {
  const { getStore, saveStore } = deps;

  // GET /api/library/matrix/schema/:type — return the column schema for an EntityType
  app.get('/api/library/matrix/schema/:type', (c) => {
    const type = c.req.param('type') as EntityType;
    const store = getStore();
    const schema = ensureSchema(store, type);
    return c.json(schema);
  });

  // PATCH /api/library/matrix/schema/:type — update columns (visibility, order, labels, add/remove)
  app.patch('/api/library/matrix/schema/:type', async (c) => {
    const type = c.req.param('type') as EntityType;
    const body = await c.req.json<{ columns: MatrixColumn[] }>();
    if (!Array.isArray(body.columns)) return c.json({ error: 'columns array required' }, 400);
    const store = getStore();
    const schema = ensureSchema(store, type);
    schema.columns = body.columns;
    schema.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(schema);
  });

  // POST /api/library/matrix/schema/:type/reset — restore defaults
  app.post('/api/library/matrix/schema/:type/reset', (c) => {
    const type = c.req.param('type') as EntityType;
    const store = getStore();
    if (!store.matrixSchemas) store.matrixSchemas = [];
    const idx = store.matrixSchemas.findIndex(s => s.type === type);
    const fresh: MatrixSchema = { type, columns: defaultColumnsForType(type), updatedAt: new Date().toISOString() };
    if (idx >= 0) store.matrixSchemas[idx] = fresh;
    else store.matrixSchemas.push(fresh);
    saveStore();
    return c.json(fresh);
  });

  // GET /api/library/matrix/:type — paginated list of entities of a type for the matrix
  app.get('/api/library/matrix/:type', (c) => {
    const type = c.req.param('type') as EntityType;
    const store = getStore();
    const limit = parseInt(c.req.query('limit') ?? '500', 10);
    const all = (store.libraryEntities ?? [])
      .filter(e => e.type === type && !e.deletedAt)
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return c.json({ entities: all.slice(0, limit), total: all.length });
  });

  // GET /api/library/matrix/:type/export.csv — download CSV
  app.get('/api/library/matrix/:type/export.csv', (c) => {
    const type = c.req.param('type') as EntityType;
    const visibleOnly = c.req.query('visibleOnly') !== 'false';
    const store = getStore();
    const schema = ensureSchema(store, type);
    const entities = (store.libraryEntities ?? [])
      .filter(e => e.type === type && !e.deletedAt)
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    const csv = entitiesToCsv(entities, schema, visibleOnly);
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${type}-matrix-${Date.now()}.csv"`);
    return c.body(csv);
  });

  // POST /api/library/matrix/import-vault — read .md files from a vault folder + create entities
  // body: { folderPath: string, type: EntityType, dryRun?: boolean }
  app.post('/api/library/matrix/import-vault', async (c) => {
    const body = await c.req.json<{ folderPath: string; type: EntityType; dryRun?: boolean }>();
    if (!body.folderPath || !body.type) return c.json({ error: 'folderPath and type required' }, 400);

    const store = getStore();
    if (!store.libraryEntities) store.libraryEntities = [];

    let files: string[] = [];
    try {
      const entries = await fs.readdir(body.folderPath, { withFileTypes: true });
      files = entries
        .filter(e => e.isFile() && e.name.endsWith('.md'))
        .map(e => path.join(body.folderPath, e.name));
    } catch (err) {
      return c.json({ error: `Cannot read folder: ${(err as Error).message}` }, 400);
    }

    const imported: Array<{ title: string; status: 'new' | 'updated' | 'skipped'; reason?: string }> = [];
    const now = new Date().toISOString();

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const { raw, body: noteBody } = parseFrontmatter(content);
        const title = path.basename(filePath, '.md').replace(/^[\d-]+\s*-?\s*/, '').trim();
        const citekey = String(raw.Citekey ?? '');
        const yearVal = Number(raw.Year);

        // Dedupe — by citekey if present, else by title
        const existing = store.libraryEntities.find(e =>
          (citekey && e.citekey === citekey) ||
          (!citekey && e.title === title && e.type === body.type)
        );

        // Build customFields: copy ALL frontmatter properties except top-level ones
        const TOP_LEVEL_KEYS = new Set([
          'Citekey', 'Type', 'Year', 'Authors', 'URL', 'DOI', 'tags',
          'Reading_status', 'Reading_depth',
        ]);
        const customFields: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(raw)) {
          if (!TOP_LEVEL_KEYS.has(k)) customFields[k] = v;
        }

        // Map Reading_status to lowercase enum used by Ruhool
        const rsRaw = String(raw.Reading_status ?? '').toLowerCase();
        let readingStatus: LibraryEntity['readingStatus'];
        if (rsRaw.includes('skim')) readingStatus = 'skimming';
        else if (rsRaw.includes('to read') || rsRaw.includes('to-read')) readingStatus = 'to-read';
        else if (rsRaw.includes('done') || rsRaw.includes('finish')) readingStatus = 'done';
        else if (rsRaw.includes('paus')) readingStatus = 'paused';
        else if (rsRaw.includes('read')) readingStatus = 'reading';
        else readingStatus = 'skimming'; // user said: as if scanned title/abstract/conclusion

        const tags = Array.isArray(raw.tags) ? (raw.tags as string[]) : [];

        if (existing) {
          // Don't overwrite — only fill missing fields
          if (body.dryRun) {
            imported.push({ title, status: 'skipped', reason: 'exists (dry-run)' });
            continue;
          }
          let touched = false;
          if (!existing.authors && raw.Authors) { existing.authors = String(raw.Authors); touched = true; }
          if (!existing.year && yearVal) { existing.year = yearVal; touched = true; }
          if (!existing.doi && raw.DOI) { existing.doi = String(raw.DOI); touched = true; }
          if (!existing.url && raw.URL) { existing.url = String(raw.URL); touched = true; }
          if (!existing.citekey && citekey) { existing.citekey = citekey; touched = true; }
          if (!existing.readingStatus) { existing.readingStatus = readingStatus; touched = true; }
          if (!existing.readingDepth) { existing.readingDepth = 'title-abstract-conclusion'; touched = true; }
          if (tags.length > 0) {
            const existingTags = new Set(existing.tags ?? []);
            for (const t of tags) existingTags.add(t);
            existing.tags = Array.from(existingTags);
            touched = true;
          }
          // Merge customFields without overwriting non-empty values
          if (!existing.customFields) existing.customFields = {};
          for (const [k, v] of Object.entries(customFields)) {
            if (existing.customFields[k] === undefined || existing.customFields[k] === '' || existing.customFields[k] === null) {
              existing.customFields[k] = v;
              touched = true;
            }
          }
          if (touched) {
            existing.updatedAt = now;
            imported.push({ title, status: 'updated' });
          } else {
            imported.push({ title, status: 'skipped', reason: 'no new fields' });
          }
        } else {
          if (body.dryRun) {
            imported.push({ title, status: 'new', reason: 'would create (dry-run)' });
            continue;
          }
          const entity: LibraryEntity = {
            id: crypto.randomUUID(),
            type: body.type,
            title,
            notes: noteBody.slice(0, 4000),
            subNotes: [],
            links: [],
            tags,
            authors: raw.Authors ? String(raw.Authors) : undefined,
            year: isNaN(yearVal) ? undefined : yearVal,
            doi: raw.DOI ? String(raw.DOI) : undefined,
            url: raw.URL ? String(raw.URL) : undefined,
            citekey: citekey || undefined,
            importSource: 'obsidian-vault',
            readingStatus,
            readingDepth: 'title-abstract-conclusion',
            customFields,
            createdAt: now,
            updatedAt: now,
          };
          store.libraryEntities.push(entity);
          imported.push({ title, status: 'new' });
        }
      } catch (err) {
        imported.push({ title: path.basename(filePath), status: 'skipped', reason: (err as Error).message });
      }
    }

    if (!body.dryRun) {
      // Ensure schema exists for this type
      ensureSchema(store, body.type);
      saveStore();
    }

    const stats = {
      total: imported.length,
      new: imported.filter(i => i.status === 'new').length,
      updated: imported.filter(i => i.status === 'updated').length,
      skipped: imported.filter(i => i.status === 'skipped').length,
    };
    return c.json({ ok: true, dryRun: !!body.dryRun, stats, imported });
  });

  // ── Library Matrix Agent (Phase 2) ──────────────────────────────────────────
  // The Librarian helps fill matrix cells based on entity metadata.
  // Returns proposals (NOT applied) — the user reviews and approves.
  app.post('/api/library/matrix/:type/:id/agent-fill', async (c) => {
    const type = c.req.param('type') as EntityType;
    if (!isValidEntityType(type)) return c.json({ error: 'Invalid type' }, 400);
    const id = c.req.param('id');
    const body: { columnKeys?: string[]; userInstructions?: string } = await c.req.json().catch(() => ({}));
    const requestedKeys = Array.isArray(body.columnKeys) ? body.columnKeys : [];

    const store = getStore();
    const entity = (store.libraryEntities ?? []).find((e) => e.id === id);
    if (!entity) return c.json({ error: 'Entity not found' }, 404);

    const hadSchema = !!store.matrixSchemas?.find((s) => s.type === type);
    const schema = ensureSchema(store, type);
    // ensureSchema mutates the store on first access — persist so we don't
    // leave an in-memory-only schema that vanishes on restart.
    if (!hadSchema) saveStore();
    const targetColumns = requestedKeys.length > 0
      ? schema.columns.filter((col) => requestedKeys.includes(col.key))
      : schema.columns.filter((col) => col.visible);
    if (targetColumns.length === 0) return c.json({ error: 'No columns to fill' }, 400);

    const apiKey = (store.providers ?? []).find((p) => p.type === 'anthropic' && p.enabled && p.apiKey)?.apiKey;
    if (!apiKey) return c.json({ error: 'Anthropic provider not configured' }, 503);

    // Build entity context for the agent — include everything we know.
    const entityCtx: Record<string, unknown> = {
      title: entity.title,
      authors: entity.authors,
      year: entity.year,
      doi: entity.doi,
      url: entity.url,
      abstract: entity.abstract,
      tags: entity.tags,
      type: entity.type,
      citekey: entity.citekey,
      notes: entity.notes?.slice(0, 4000),
      existing_fields: entity.customFields ?? {},
    };

    // Enrich the agent's context: it should know about the user's broader
    // library and writing voice — the user explicitly asked for an agent
    // that knows "ما كتبت وكل شي" (what I've written and everything).
    const sameTypeSiblings = (store.libraryEntities ?? [])
      .filter((e) => e.type === entity.type && e.id !== entity.id && !e.deletedAt)
      .slice(0, 8)
      .map((e) => ({
        title: e.title,
        authors: e.authors,
        year: e.year,
        tags: e.tags,
        // Sample of how the user filled this column on similar items — helps
        // the agent match the user's voice and conventions.
        sameKeyValues: targetColumns.reduce<Record<string, unknown>>((acc, col) => {
          const v = col.source === 'top-level'
            ? (e as unknown as Record<string, unknown>)[col.key]
            : e.customFields?.[col.key];
          if (v !== undefined && v !== null && v !== '') acc[col.key] = v;
          return acc;
        }, {}),
      }));
    const voiceProfile = (store as { userVoiceProfile?: { content?: string } }).userVoiceProfile?.content;
    const phdContext = {
      thesis_topic: 'BIM adoption in Kuwait',
      institution: 'University of Birmingham',
      started: '2026-01',
    };

    const columnsCtx = targetColumns.map((col) => ({
      key: col.key,
      label: col.labelEn,
      kind: col.kind,
      options: col.options,
      current: col.source === 'top-level'
        ? (entity as unknown as Record<string, unknown>)[col.key]
        : entity.customFields?.[col.key],
    }));

    const systemPrompt = `You are the Librarian agent for Abdullah's PhD platform (Ruhool). Abdullah's thesis is on BIM adoption in Kuwait at the University of Birmingham (started Jan 2026).

Your job: propose values for specific matrix columns about a single library entity, based on the entity's metadata.

Rules:
1. Be honest — if you cannot infer a value confidently from the metadata provided, return null for that column with reasoning explaining what info is missing.
2. NEVER fabricate authors, years, DOIs, page counts, or any factual claim.
3. For free-text columns (aims, methodology, key_findings, limitations, etc.) you may write 1-3 sentence summaries grounded in the abstract/notes. If no abstract or notes are provided, return null.
4. For tags/list columns, return an array of strings.
5. For "kind: select", choose only from the provided options or return null.
6. Output STRICT JSON matching this shape — no commentary, no markdown fences:
{
  "proposals": [
    { "columnKey": "<key>", "value": <value or null>, "reasoning": "<short why or what info is missing>", "confidence": "high" | "medium" | "low" }
  ]
}`;

    const userMsg = [
      `PhD context:\n${JSON.stringify(phdContext, null, 2)}`,
      `Entity to fill:\n${JSON.stringify(entityCtx, null, 2)}`,
      sameTypeSiblings.length > 0
        ? `Other entities of the same type the user has annotated (use as style/voice reference, NOT to copy values):\n${JSON.stringify(sameTypeSiblings, null, 2)}`
        : null,
      voiceProfile ? `User's writing voice profile (for free-text columns — match this register):\n${voiceProfile.slice(0, 1500)}` : null,
      `Columns to fill:\n${JSON.stringify(columnsCtx, null, 2)}`,
      body.userInstructions ? `Additional instructions from the user:\n${body.userInstructions}` : null,
      'Return the JSON now.',
    ].filter(Boolean).join('\n\n');

    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey });
      const res = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      });
      const text = res.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('\n')
        .trim();
      // Strip code fences if the model added them despite instructions.
      const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      let parsed: { proposals?: Array<{ columnKey: string; value: unknown; reasoning?: string; confidence?: string }> };
      try {
        parsed = JSON.parse(stripped);
      } catch {
        return c.json({ error: 'Agent returned non-JSON output', raw: text.slice(0, 1000) }, 502);
      }
      const proposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];
      // Attach column metadata so UI can render a clean diff
      const enriched = proposals
        .map((p) => {
          const col = targetColumns.find((c2) => c2.key === p.columnKey);
          if (!col) return null;
          return {
            columnKey: p.columnKey,
            label: col.labelEn,
            labelAr: col.labelAr,
            kind: col.kind,
            current: col.source === 'top-level'
              ? (entity as unknown as Record<string, unknown>)[col.key]
              : entity.customFields?.[col.key],
            proposed: p.value,
            reasoning: p.reasoning ?? '',
            confidence: p.confidence ?? 'medium',
            source: col.source ?? 'custom',
          };
        })
        .filter(Boolean);

      return c.json({ entityId: id, proposals: enriched });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Agent call failed: ${msg}` }, 502);
    }
  });

  // Suggest new matrix columns based on the user's existing library content +
  // their PhD context. Returns proposals only — never modifies the schema.
  app.post('/api/library/matrix/:type/suggest-columns', async (c) => {
    const type = c.req.param('type') as EntityType;
    if (!isValidEntityType(type)) return c.json({ error: 'Invalid type' }, 400);
    const body: { userInstructions?: string; sampleSize?: number } = await c.req.json().catch(() => ({}));
    const sampleSize = Math.min(typeof body.sampleSize === 'number' ? body.sampleSize : 15, 40);

    const store = getStore();
    const apiKey = (store.providers ?? []).find((p) => p.type === 'anthropic' && p.enabled && p.apiKey)?.apiKey;
    if (!apiKey) return c.json({ error: 'Anthropic provider not configured' }, 503);

    const schema = ensureSchema(store, type);
    const existingKeys = new Set(schema.columns.map((col) => col.key));

    // Sample real entities of this type so the agent sees what kind of data exists.
    const entities = (store.libraryEntities ?? [])
      .filter((e) => e.type === type && !e.deletedAt)
      .slice(0, sampleSize);

    if (entities.length === 0) {
      return c.json({ proposals: [], message: 'No entities of this type yet — add a few before asking for column suggestions' });
    }

    const sample = entities.map((e) => ({
      title: e.title,
      authors: e.authors,
      year: e.year,
      tags: e.tags,
      abstract: e.abstract?.slice(0, 400),
      // Include any custom fields the user already added — agent can spot patterns.
      customFields: e.customFields,
    }));

    const existingColumns = schema.columns.map((col) => ({
      key: col.key,
      label: col.labelEn,
      kind: col.kind,
    }));

    const systemPrompt = `You are the Librarian helping Abdullah extend his PhD library matrix on BIM adoption in Kuwait.

You see the existing matrix columns and a sample of the real entities. Your job: propose NEW columns that would actually be useful for analyzing or filtering these entities — based on patterns you spot in the sample.

Rules:
1. Propose ONLY columns that are NOT already in the existing list. Use camelCase or snake_case for the key.
2. Be specific — generic columns like "notes" are useless. Examples of good additions for academic papers: "research_context_country", "BIM_maturity_level", "evidence_strength", "bim_dimension_focus".
3. Each column needs: key, labelEn, labelAr, kind (one of: string, text, number, tags, list, date, url, select, boolean), and reasoning grounded in what you saw.
4. For "select" kind, include 3-7 example options.
5. Limit to at most 5 proposals — quality over quantity.
6. Output STRICT JSON only — no fences, no commentary:
{
  "proposals": [
    { "key": "...", "labelEn": "...", "labelAr": "...", "kind": "...", "options": [...], "reasoning": "..." }
  ]
}`;

    const userMsg = `Existing columns:\n${JSON.stringify(existingColumns, null, 2)}\n\nSample entities (${entities.length}):\n${JSON.stringify(sample, null, 2)}${body.userInstructions ? `\n\nUser instructions: ${body.userInstructions}` : ''}\n\nReturn the JSON now.`;

    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey });
      const res = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      });
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n').trim();
      const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      let parsed: { proposals?: unknown };
      try { parsed = JSON.parse(stripped); }
      catch { return c.json({ error: 'Agent returned non-JSON output', raw: text.slice(0, 1000) }, 502); }

      const allowedKinds = new Set(['string', 'text', 'number', 'tags', 'list', 'date', 'url', 'select', 'boolean']);
      const rawProposals: Array<Record<string, unknown>> = Array.isArray(parsed.proposals)
        ? (parsed.proposals as Array<Record<string, unknown>>)
        : [];
      const proposals = rawProposals
        .filter((p): p is { key: string; labelEn: string; labelAr: string; kind: string; options?: unknown; reasoning?: unknown } =>
          typeof p.key === 'string' && p.key.length > 0
            && typeof p.labelEn === 'string'
            && typeof p.labelAr === 'string'
            && typeof p.kind === 'string'
            && allowedKinds.has(p.kind)
            && !existingKeys.has(p.key))
        .map((p) => ({
          key: p.key,
          labelEn: p.labelEn,
          labelAr: p.labelAr,
          kind: p.kind,
          options: Array.isArray(p.options) ? (p.options as unknown[]).filter((o): o is string => typeof o === 'string') : undefined,
          reasoning: typeof p.reasoning === 'string' ? p.reasoning : '',
        }))
        .slice(0, 5);

      return c.json({ proposals });
    } catch (err) {
      return c.json({ error: `Agent call failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  // Apply approved column proposals to the matrix schema (idempotent — skips
  // existing keys silently).
  app.post('/api/library/matrix/:type/add-columns', async (c) => {
    const type = c.req.param('type') as EntityType;
    if (!isValidEntityType(type)) return c.json({ error: 'Invalid type' }, 400);
    const body: { columns?: Array<{ key: string; labelEn: string; labelAr: string; kind: string; options?: string[] }> } =
      await c.req.json().catch(() => ({}));
    const requested = Array.isArray(body.columns) ? body.columns : [];
    if (requested.length === 0) return c.json({ error: 'No columns to add' }, 400);

    const allowedKinds = new Set<MatrixColumn['kind']>(['string', 'text', 'number', 'tags', 'list', 'date', 'url', 'select', 'boolean']);
    const store = getStore();
    const schema = ensureSchema(store, type);
    const existingKeys = new Set(schema.columns.map((col) => col.key));
    const startOrder = Math.max(0, ...schema.columns.map((col) => col.order)) + 1;

    let added = 0;
    for (let i = 0; i < requested.length; i++) {
      const r = requested[i];
      if (existingKeys.has(r.key)) continue;
      if (!allowedKinds.has(r.kind as MatrixColumn['kind'])) continue;
      schema.columns.push({
        key: r.key,
        labelEn: r.labelEn,
        labelAr: r.labelAr,
        kind: r.kind as MatrixColumn['kind'],
        options: Array.isArray(r.options) ? r.options : undefined,
        visible: true,
        order: startOrder + i,
        source: 'custom',
      });
      added++;
    }
    schema.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true, added, schema });
  });

  // Apply selected proposals — the user-approved subset.
  // Hardened: every proposed columnKey must exist in the type's schema, and
  // top-level writes must match the schema's declared `source` for that key.
  // Top-level keys that are immutable identifiers/relations are blocked outright.
  app.post('/api/library/matrix/:type/:id/apply-proposals', async (c) => {
    const type = c.req.param('type') as EntityType;
    if (!isValidEntityType(type)) return c.json({ error: 'Invalid type' }, 400);
    const id = c.req.param('id');
    const body: { proposals?: Array<{ columnKey: string; value: unknown; source?: 'top-level' | 'custom' }> } =
      await c.req.json().catch(() => ({}));
    const proposals = Array.isArray(body.proposals) ? body.proposals : [];
    if (proposals.length === 0) return c.json({ error: 'No proposals to apply' }, 400);

    const store = getStore();
    const entity = (store.libraryEntities ?? []).find((e) => e.id === id);
    if (!entity) return c.json({ error: 'Entity not found' }, 404);

    const schema = ensureSchema(store, type);
    const columnsByKey = new Map(schema.columns.map((col) => [col.key, col]));

    if (!entity.customFields) entity.customFields = {};
    const applied: string[] = [];
    const rejected: Array<{ columnKey: string; reason: string }> = [];
    for (const p of proposals) {
      const col = columnsByKey.get(p.columnKey);
      if (!col) {
        rejected.push({ columnKey: p.columnKey, reason: 'unknown column' });
        continue;
      }
      if (IMMUTABLE_TOP_LEVEL_KEYS.has(p.columnKey)) {
        rejected.push({ columnKey: p.columnKey, reason: 'immutable field' });
        continue;
      }
      const declaredSource = col.source ?? 'custom';
      if (p.source && p.source !== declaredSource) {
        rejected.push({ columnKey: p.columnKey, reason: 'source mismatch' });
        continue;
      }
      if (declaredSource === 'top-level') {
        (entity as unknown as Record<string, unknown>)[p.columnKey] = p.value;
      } else {
        entity.customFields[p.columnKey] = p.value;
      }
      applied.push(p.columnKey);
    }
    if (applied.length === 0 && rejected.length > 0) {
      return c.json({ error: 'All proposals rejected', rejected }, 400);
    }
    entity.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true, entity, applied, rejected });
  });
}

const ALLOWED_ENTITY_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([
  'paper', 'book', 'report', 'standard', 'my-writing', 'thesis-chapter',
  'person', 'organization', 'conference', 'project',
  'atomic-note', 'reading-session', 'research-cluster',
  'file', 'webpage', 'video', 'code-repo',
]);

function isValidEntityType(t: string): t is EntityType {
  return ALLOWED_ENTITY_TYPES.has(t as EntityType);
}
