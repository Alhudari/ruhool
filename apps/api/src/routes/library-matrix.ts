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
}
