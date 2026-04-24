/**
 * Unified Sources hub — surfaces every kind of input the user pulls from
 * across the vault: papers, books, courses, case studies, conferences, people.
 *
 * Each "source" is a vault note with a `kind` field (auto-detected from folder
 * or frontmatter). Folder paths follow the new Ruhool vault structure
 * (vault-init.ts). Kinds:
 *   - paper      → 01 PhD/01 Sources/Papers
 *   - book       → 01 PhD/01 Sources/Books
 *   - course     → 01 PhD/01 Sources/Courses
 *   - report     → 01 PhD/01 Sources/Reports
 *   - thesis     → 01 PhD/01 Sources/Theses
 *   - standard   → 01 PhD/01 Sources/Standards
 *   - case-study → 01 PhD/08 Case Studies
 *   - conference → 01 PhD/07 Conferences
 *   - person     → 01 PhD/05 People
 *   - org        → 01 PhD/06 Organisations
 */
import type { Hono } from 'hono';
import { listNotes, readNote, writeNoteRaw, noteExists, writeFrontmatter } from '@ruhool/core';
import { auditLog } from '../services/audit-log.js';

interface SourceKindConfig {
  folder: string;
  ar: string;
  en: string;
  // Default frontmatter fields specific to this kind
  defaultFields: () => Record<string, unknown>;
}

const KINDS: Record<string, SourceKindConfig> = {
  paper: {
    folder: '01 PhD/01 Sources/Papers',
    ar: 'ورقة أكاديمية', en: 'Academic Paper',
    defaultFields: () => ({ Type: 'journalArticle', Year: null, Authors: null, DOI: null, Reading_status: 'To Read' }),
  },
  book: {
    folder: '01 PhD/01 Sources/Books',
    ar: 'كتاب', en: 'Book',
    defaultFields: () => ({ Type: 'book', Year: null, Authors: null, Publisher: null, Format: 'physical', source_origin: 'manual' }),
  },
  course: {
    folder: '01 PhD/01 Sources/Courses',
    ar: 'كورس', en: 'Course',
    defaultFields: () => ({ Type: 'course', Provider: null, Year: null, Duration_hours: null, Status: 'Enrolled', Certificate: false }),
  },
  report: {
    folder: '01 PhD/01 Sources/Reports',
    ar: 'تقرير', en: 'Report',
    defaultFields: () => ({ Type: 'report', Year: null, Publisher: null, URL: null, Country: null }),
  },
  thesis: {
    folder: '01 PhD/01 Sources/Theses',
    ar: 'رسالة علمية', en: 'Thesis',
    defaultFields: () => ({ Type: 'thesis', Year: null, Author: null, University: null, Degree: null, URL: null }),
  },
  standard: {
    folder: '01 PhD/01 Sources/Standards',
    ar: 'كود/معيار', en: 'Standard',
    defaultFields: () => ({ Type: 'standard', Year: null, Issuer: null, Code_number: null, Scope: null }),
  },
  'case-study': {
    folder: '01 PhD/08 Case Studies',
    ar: 'دراسة حالة', en: 'Case Study',
    defaultFields: () => ({ Type: 'case-study', Country: null, City: null, Project_name: null, Owner: null, Value: null, Duration: null, Year_completed: null, BIM_used: null, Relevance_to_research: null }),
  },
  conference: {
    folder: '01 PhD/07 Conferences',
    ar: 'مؤتمر', en: 'Conference',
    defaultFields: () => ({ Type: 'conference', Year: null, Location: null, Attended: false, Presented: false, URL: null }),
  },
  person: {
    folder: '01 PhD/05 People',
    ar: 'شخصية', en: 'Person',
    defaultFields: () => ({ Type: 'person', Affiliation: null, Email: null, Role: null, Notes: null }),
  },
  org: {
    folder: '01 PhD/06 Organisations',
    ar: 'منظّمة', en: 'Organisation',
    defaultFields: () => ({ Type: 'organisation', Country: null, URL: null, Sector: null, Notes: null }),
  },
};

interface SourceSummary {
  kind: string;
  kindAr: string;
  kindEn: string;
  path: string;
  name: string;
  title?: string;
  // Common derived fields
  year?: number;
  authors?: string;
  status?: string;
  preview?: string;
  // Kind-specific extras spread through
  meta: Record<string, unknown>;
  mtime: number;
}

function extractTitle(name: string, body: string, fm: Record<string, unknown>): string {
  const fmTitle = fm.title ?? fm.Title;
  if (typeof fmTitle === 'string' && fmTitle.trim()) return fmTitle.trim();
  const h1 = body.match(/^#\s+(.+?)$/m);
  if (h1) return h1[1].replace(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g, '$1').trim();
  return name;
}

export function registerSourcesRoutes(app: Hono): void {

  // ── List all sources across kinds ────────────────────────────────────
  app.get('/api/sources', async (c) => {
    const kindFilter = c.req.query('kind');
    const wanted = kindFilter && KINDS[kindFilter] ? [kindFilter] : Object.keys(KINDS);

    const all: SourceSummary[] = [];
    for (const kind of wanted) {
      const cfg = KINDS[kind];
      try {
        const paths = await listNotes({ subPath: cfg.folder });
        const notes = await Promise.all(
          paths.slice(0, 200).map(async (p) => {
            try {
              const n = await readNote(p);
              const fm = n.frontmatter;
              const preview = n.body
                .replace(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g, '$1')
                .split(/\n{2,}/)
                .map((s) => s.trim())
                .find((s) => s && !s.startsWith('#') && !s.startsWith('>'))
                ?.slice(0, 200) ?? '';
              return {
                kind, kindAr: cfg.ar, kindEn: cfg.en,
                path: n.path, name: n.name,
                title: extractTitle(n.name, n.body, fm),
                year: (fm.Year ?? fm.year) as number | undefined,
                authors: (fm.Authors ?? fm.authors) as string | undefined,
                status: (fm.Status ?? fm.Reading_status ?? fm.status) as string | undefined,
                preview,
                meta: fm,
                mtime: n.mtime,
              } as SourceSummary;
            } catch { return null; }
          })
        );
        all.push(...notes.filter(Boolean) as SourceSummary[]);
      } catch { /* ignore missing folder */ }
    }

    // Sort newest first
    all.sort((a, b) => b.mtime - a.mtime);

    return c.json({
      sources: all,
      total: all.length,
      byKind: Object.entries(KINDS).reduce<Record<string, { count: number; ar: string; en: string }>>((acc, [k, v]) => {
        acc[k] = { count: all.filter((s) => s.kind === k).length, ar: v.ar, en: v.en };
        return acc;
      }, {}),
    });
  });

  // ── Read single source ───────────────────────────────────────────────
  app.get('/api/sources/:kind/*', async (c) => {
    const kind = c.req.param('kind');
    const relPath = decodeURIComponent(c.req.param('*') ?? '');
    if (!KINDS[kind]) return c.json({ error: 'unknown kind' }, 400);
    if (!relPath) return c.json({ error: 'path required' }, 400);
    try {
      const n = await readNote(relPath);
      return c.json({
        kind,
        path: n.path,
        name: n.name,
        title: extractTitle(n.name, n.body, n.frontmatter),
        frontmatter: n.frontmatter,
        body: n.body.replace(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g, '$1'),
        sections: n.sections,
        tasks: n.tasks,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT')) return c.json({ error: 'Not found' }, 404);
      return c.json({ error: msg }, 500);
    }
  });

  // ── Create new source ────────────────────────────────────────────────
  app.post('/api/sources', async (c) => {
    const body = await c.req.json<{
      kind: string;
      title: string;
      body?: string;
      meta?: Record<string, unknown>;
    }>();
    if (!body.kind || !KINDS[body.kind]) return c.json({ error: 'unknown kind' }, 400);
    if (!body.title?.trim()) return c.json({ error: 'title required' }, 400);

    const cfg = KINDS[body.kind];
    const safeTitle = body.title.trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
    const relPath = `${cfg.folder}/${safeTitle}.md`;

    if (await noteExists(relPath)) {
      return c.json({ error: 'source already exists', path: relPath }, 409);
    }

    const fm: Record<string, unknown> = {
      ...cfg.defaultFields(),
      ...(body.meta ?? {}),
      Added_On: new Date().toISOString().slice(0, 10),
      tags: [],
    };
    const keyOrder = Object.keys(fm);
    const yaml = writeFrontmatter(fm, keyOrder);

    const content = [
      '---',
      yaml,
      '---',
      '',
      `# ${body.title.trim()}`,
      '',
      body.body?.trim() ?? '',
      '',
      '## 📝 ملاحظاتي',
      '',
      '## 🔗 Related',
      '',
    ].join('\n');

    try {
      await writeNoteRaw(relPath, content);
      await auditLog({ action: `source.create.${body.kind}`, path: relPath, source: 'platform:user', meta: { title: body.title } });
      return c.json({ ok: true, path: relPath, kind: body.kind }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Update source frontmatter ────────────────────────────────────────
  app.patch('/api/sources/:kind/*', async (c) => {
    const kind = c.req.param('kind');
    const relPath = decodeURIComponent(c.req.param('*') ?? '');
    if (!KINDS[kind]) return c.json({ error: 'unknown kind' }, 400);

    const body = await c.req.json<{ meta?: Record<string, unknown>; bodyContent?: string }>();
    try {
      const n = await readNote(relPath);
      const fm = { ...n.frontmatter, ...(body.meta ?? {}) };
      const existingKeys = n.frontmatterKeyOrder.filter((k) => k in fm);
      const newKeys = Object.keys(fm).filter((k) => !existingKeys.includes(k));
      const keyOrder = [...existingKeys, ...newKeys];
      const yaml = writeFrontmatter(fm, keyOrder);
      const content = `---\n${yaml}\n---\n\n${body.bodyContent ?? n.body}`;
      await writeNoteRaw(relPath, content);
      await auditLog({ action: `source.update.${kind}`, path: relPath, source: 'platform:user' });
      return c.json({ ok: true, frontmatter: fm });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT')) return c.json({ error: 'Not found' }, 404);
      return c.json({ error: msg }, 500);
    }
  });
}
