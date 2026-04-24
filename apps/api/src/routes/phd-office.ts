/**
 * Word + Excel export endpoints — for delivering content to supervisors.
 *
 *   GET  /api/export/word/atomic-notes      — all atomic notes as HTML/.doc
 *   GET  /api/export/word/note?path=...     — single note as HTML/.doc
 *   GET  /api/export/excel/research-matrix  — literature matrix as .xlsx
 *
 * Word: emits an HTML document with .doc extension; Microsoft Word opens it
 *       natively and lets you save-as proper .docx. Avoids the docx npm dep.
 * Excel: uses the existing `xlsx` package to build a real .xlsx workbook.
 */
import type { Hono } from 'hono';
import * as XLSX from 'xlsx';
import { listNotes, readNote } from '@ruhool/core';

// Minimal Markdown → HTML for export (handles common cases — no full parser needed)
function mdToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => `<strong>${b ?? a}</strong>`)
    .replace(/^/, '<p>')
    .concat('</p>');
}

const HTML_DOC_TEMPLATE = (title: string, body: string, isRTL: boolean) => `<!DOCTYPE html>
<html dir="${isRTL ? 'rtl' : 'ltr'}" lang="${isRTL ? 'ar' : 'en'}">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: 'Segoe UI', 'Tajawal', Arial, sans-serif; line-height: 1.6; max-width: 720px; margin: 2cm auto; padding: 0 1cm; color: #1a1a1a; }
  h1 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 6px; }
  h2 { color: #1e40af; margin-top: 1.2em; }
  h3 { color: #1e3a8a; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: 'Consolas', monospace; font-size: 0.9em; }
  ul { padding-${isRTL ? 'right' : 'left'}: 1.5em; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }
  blockquote { border-${isRTL ? 'right' : 'left'}: 4px solid #93c5fd; padding-${isRTL ? 'right' : 'left'}: 1em; color: #4b5563; margin-${isRTL ? 'right' : 'left'}: 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;

export function registerPhdOfficeRoutes(app: Hono): void {

  // ── Word: single atomic note ─────────────────────────────────────────
  app.get('/api/export/word/note', async (c) => {
    const relPath = c.req.query('path');
    if (!relPath) return c.json({ error: 'path query required' }, 400);
    try {
      const note = await readNote(relPath);
      const isRTL = /[\u0600-\u06FF]/.test(note.body);
      const body = mdToHtml(note.body);
      const html = HTML_DOC_TEMPLATE(note.name, body, isRTL);
      const filename = `${note.name.replace(/[^\w\u0600-\u06FF\s.-]/g, '')}.doc`;
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'application/msword',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Word: all atomic notes as one bundled document ───────────────────
  app.get('/api/export/word/atomic-notes', async (c) => {
    try {
      const paths = await listNotes({ subPath: '01 PhD/03 Atomic Notes' });
      const notes = await Promise.all(paths.map(async (p) => {
        try { return await readNote(p); } catch { return null; }
      }));
      const valid = notes.filter(Boolean) as Array<{ name: string; body: string; path: string }>;
      const sections = valid.map((n) => {
        const body = mdToHtml(n.body);
        return `<h1>${n.name}</h1>\n<p style="color:#6b7280;font-size:0.85em">${n.path}</p>\n${body}\n<hr />`;
      }).join('\n');
      const html = HTML_DOC_TEMPLATE('Atomic Notes — Ruhool Export', sections, true);
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'application/msword',
          'Content-Disposition': `attachment; filename="atomic-notes-${new Date().toISOString().slice(0,10)}.doc"`,
        },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Word: empty academic chapter skeleton ─────────────────────────
  // ?type=lit-review|methodology|results|discussion|intro|conclusion|full-thesis
  app.get('/api/export/word/chapter-skeleton', (c) => {
    const type = c.req.query('type') ?? 'full-thesis';
    const isRTL = (c.req.query('lang') ?? 'en') === 'ar';

    const sections: Record<string, Array<{ ar: string; en: string; level: number }>> = {
      'intro': [
        { ar: '1. المقدمة', en: '1. Introduction', level: 1 },
        { ar: '1.1 خلفية البحث', en: '1.1 Research Background', level: 2 },
        { ar: '1.2 بيان المشكلة', en: '1.2 Problem Statement', level: 2 },
        { ar: '1.3 أهداف البحث', en: '1.3 Research Objectives', level: 2 },
        { ar: '1.4 الأسئلة البحثية', en: '1.4 Research Questions', level: 2 },
        { ar: '1.5 أهمية البحث', en: '1.5 Significance', level: 2 },
        { ar: '1.6 نطاق البحث وحدوده', en: '1.6 Scope & Limitations', level: 2 },
        { ar: '1.7 هيكل الأطروحة', en: '1.7 Thesis Structure', level: 2 },
      ],
      'lit-review': [
        { ar: '2. مراجعة الأدبيات', en: '2. Literature Review', level: 1 },
        { ar: '2.1 مقدمة الفصل', en: '2.1 Chapter Introduction', level: 2 },
        { ar: '2.2 الإطار النظري', en: '2.2 Theoretical Framework', level: 2 },
        { ar: '2.3 الدراسات السابقة', en: '2.3 Previous Studies', level: 2 },
        { ar: '2.4 BIM في السياق العالمي', en: '2.4 BIM in Global Context', level: 2 },
        { ar: '2.5 BIM في الخليج والكويت', en: '2.5 BIM in GCC & Kuwait', level: 2 },
        { ar: '2.6 الفجوة البحثية', en: '2.6 Research Gap', level: 2 },
        { ar: '2.7 ملخص الفصل', en: '2.7 Chapter Summary', level: 2 },
      ],
      'methodology': [
        { ar: '3. المنهجية', en: '3. Methodology', level: 1 },
        { ar: '3.1 فلسفة البحث', en: '3.1 Research Philosophy', level: 2 },
        { ar: '3.2 منهج البحث', en: '3.2 Research Approach', level: 2 },
        { ar: '3.3 تصميم البحث', en: '3.3 Research Design (Mixed Methods)', level: 2 },
        { ar: '3.4 مجتمع وعيّنة البحث', en: '3.4 Population & Sample', level: 2 },
        { ar: '3.5 أدوات جمع البيانات', en: '3.5 Data Collection Instruments', level: 2 },
        { ar: '3.6 الاستبيان', en: '3.6 Questionnaire Design', level: 3 },
        { ar: '3.7 المقابلات شبه المنظّمة', en: '3.7 Semi-structured Interviews', level: 3 },
        { ar: '3.8 تحليل البيانات (SEM-PLS)', en: '3.8 Data Analysis (SEM-PLS)', level: 2 },
        { ar: '3.9 الاعتبارات الأخلاقية', en: '3.9 Ethical Considerations', level: 2 },
      ],
      'results': [
        { ar: '4. النتائج', en: '4. Results', level: 1 },
        { ar: '4.1 الخصائص الديموغرافية', en: '4.1 Demographic Profile', level: 2 },
        { ar: '4.2 نتائج التحليل الكمي', en: '4.2 Quantitative Findings', level: 2 },
        { ar: '4.3 نتائج التحليل النوعي', en: '4.3 Qualitative Findings', level: 2 },
        { ar: '4.4 ملخص النتائج', en: '4.4 Summary of Findings', level: 2 },
      ],
      'discussion': [
        { ar: '5. المناقشة', en: '5. Discussion', level: 1 },
        { ar: '5.1 تفسير النتائج', en: '5.1 Interpretation of Results', level: 2 },
        { ar: '5.2 ربط بالأدبيات', en: '5.2 Linking to Literature', level: 2 },
        { ar: '5.3 الإسهام النظري', en: '5.3 Theoretical Contribution', level: 2 },
        { ar: '5.4 الإسهام التطبيقي', en: '5.4 Practical Contribution', level: 2 },
        { ar: '5.5 محدودية الدراسة', en: '5.5 Study Limitations', level: 2 },
      ],
      'conclusion': [
        { ar: '6. الخاتمة', en: '6. Conclusion', level: 1 },
        { ar: '6.1 ملخص البحث', en: '6.1 Research Summary', level: 2 },
        { ar: '6.2 الإجابة على الأسئلة البحثية', en: '6.2 Answering Research Questions', level: 2 },
        { ar: '6.3 التوصيات', en: '6.3 Recommendations', level: 2 },
        { ar: '6.4 الأبحاث المستقبلية', en: '6.4 Future Research', level: 2 },
      ],
    };

    const buildChapter = (key: string): string => {
      const items = sections[key] ?? [];
      return items.map((s) => {
        const tag = `h${s.level}`;
        const placeholder = isRTL ? '<p style="color:#9ca3af;font-style:italic">[اكتب هنا...]</p>' : '<p style="color:#9ca3af;font-style:italic">[Write here...]</p>';
        return `<${tag}>${isRTL ? s.ar : s.en}</${tag}>\n${placeholder}\n`;
      }).join('\n');
    };

    let body = '';
    let title = '';
    if (type === 'full-thesis') {
      title = isRTL ? 'هيكل الأطروحة الكامل' : 'Full Thesis Skeleton';
      body = ['intro', 'lit-review', 'methodology', 'results', 'discussion', 'conclusion']
        .map(buildChapter).join('\n<hr />\n');
    } else if (sections[type]) {
      title = isRTL ? sections[type][0].ar : sections[type][0].en;
      body = buildChapter(type);
    } else {
      return c.json({ error: 'unknown chapter type', validTypes: Object.keys(sections).concat(['full-thesis']) }, 400);
    }

    const html = `<!DOCTYPE html>
<html dir="${isRTL ? 'rtl' : 'ltr'}" lang="${isRTL ? 'ar' : 'en'}">
<head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: 'Times New Roman', 'Tajawal', serif; line-height: 1.8; max-width: 720px; margin: 2.5cm auto; padding: 0 1cm; }
  h1 { color: #1e3a8a; border-bottom: 3px double #1e3a8a; padding-bottom: 8px; }
  h2 { color: #1e40af; margin-top: 1.5em; }
  h3 { color: #2563eb; }
  hr { page-break-after: always; border: none; }
</style></head>
<body><h1>${title}</h1>${body}</body></html>`;

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'application/msword',
        'Content-Disposition': `attachment; filename="${title.replace(/[^\w\u0600-\u06FF]/g, '-')}.doc"`,
      },
    });
  });

  // ── Excel: atomic notes ────────────────────────────────────────────
  app.get('/api/export/excel/atomic-notes', async (c) => {
    try {
      const paths = await listNotes({ subPath: '01 PhD/02 Atomic Notes' });
      const rows: Record<string, unknown>[] = [];
      for (const p of paths) {
        try {
          const n = await readNote(p);
          rows.push({
            'Title': n.name,
            'Path': n.path,
            'Tags': Array.isArray(n.frontmatter.tags) ? (n.frontmatter.tags as string[]).join(', ') : '',
            'Type': n.frontmatter.type ?? '',
            'Created': n.frontmatter.created ?? '',
            'Source': n.frontmatter.source ?? '',
            'Word Count': n.body.split(/\s+/).filter(Boolean).length,
            'Preview': n.body.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.slice(0, 200) ?? '',
          });
        } catch { /* skip */ }
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = Object.keys(rows[0] ?? {}).map((h) => ({ wch: Math.min(60, Math.max(12, h.length)) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Atomic Notes');
      return new Response(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="atomic-notes-${new Date().toISOString().slice(0,10)}.xlsx"`,
        },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Excel: meetings ────────────────────────────────────────────────
  app.get('/api/export/excel/meetings', async (c) => {
    try {
      const candidates = ['01 PhD/04 Supervision/Meetings', '01 PhD/01 Supervision/Supervision Interaction Points'];
      let paths: string[] = [];
      for (const folder of candidates) {
        paths = await listNotes({ subPath: folder, recursive: false }).catch(() => [] as string[]);
        if (paths.length > 0) break;
      }
      const rows: Record<string, unknown>[] = [];
      for (const p of paths) {
        try {
          const n = await readNote(p);
          rows.push({
            'No.': n.frontmatter['No.'] ?? n.name,
            'Date': n.frontmatter.date ?? n.frontmatter.Date ?? '',
            'Location': n.frontmatter.Location ?? '',
            'Attendees': Array.isArray(n.frontmatter.Attendees) ? (n.frontmatter.Attendees as string[]).join(', ') : (n.frontmatter.Attendees ?? ''),
            'Summary': n.frontmatter.Summary ?? '',
            'Next Meeting': n.frontmatter.Next_Meeting ?? '',
            'Open Tasks': n.tasks.filter((t) => !t.done).length,
            'Done Tasks': n.tasks.filter((t) => t.done).length,
            'Path': n.path,
          });
        } catch { /* skip */ }
      }
      rows.sort((a, b) => String(b.Date ?? '').localeCompare(String(a.Date ?? '')));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = Object.keys(rows[0] ?? {}).map((h) => ({ wch: Math.min(60, Math.max(12, h.length)) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Meetings');
      return new Response(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="meetings-${new Date().toISOString().slice(0,10)}.xlsx"`,
        },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Excel: any vault folder (generic) ──────────────────────────────
  // ?path=01 PhD/05 People  → exports any folder's notes with their frontmatter
  app.get('/api/export/excel/folder', async (c) => {
    const folder = c.req.query('path');
    if (!folder) return c.json({ error: 'path query required' }, 400);
    try {
      const paths = await listNotes({ subPath: folder });
      const rows: Record<string, unknown>[] = [];
      // Collect all unique frontmatter keys
      const allKeys = new Set<string>(['Title', 'Path']);
      const allNotes = await Promise.all(paths.map(async (p) => { try { return await readNote(p); } catch { return null; } }));
      const valid = allNotes.filter(Boolean) as NonNullable<typeof allNotes[number]>[];
      for (const n of valid) {
        Object.keys(n.frontmatter).forEach((k) => allKeys.add(k));
      }
      const keysOrder = ['Title', 'Path', ...Array.from(allKeys).filter((k) => k !== 'Title' && k !== 'Path')];
      for (const n of valid) {
        const row: Record<string, unknown> = {};
        row['Title'] = n.name;
        row['Path'] = n.path;
        for (const k of keysOrder.slice(2)) {
          const v = n.frontmatter[k];
          row[k] = Array.isArray(v) ? v.join(', ') : (v ?? '');
        }
        rows.push(row);
      }
      const ws = XLSX.utils.json_to_sheet(rows, { header: keysOrder });
      ws['!cols'] = keysOrder.map((h) => ({ wch: Math.min(50, Math.max(12, h.length)) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, folder.split('/').pop() ?? 'Folder');
      const safeName = folder.replace(/[\\/:*?"<>|]/g, '-').slice(0, 50);
      return new Response(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${safeName}-${new Date().toISOString().slice(0,10)}.xlsx"`,
        },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Excel: research matrix from literature ──────────────────────────
  app.get('/api/export/excel/research-matrix', async (c) => {
    try {
      const paths = await listNotes({ subPath: '01 PhD/02 Literature Review/Academic Literature' });
      const rows: Record<string, unknown>[] = [];

      for (const p of paths) {
        try {
          const note = await readNote(p);
          const fm = note.frontmatter;
          rows.push({
            'Citekey': fm.Citekey ?? '',
            'Title': note.name,
            'Authors': fm.Authors ?? '',
            'Year': fm.Year ?? '',
            'Type': fm.Type ?? '',
            'Journal': fm.Journal ?? '',
            'DOI': fm.DOI ?? '',
            'Reading Status': fm.Reading_status ?? '',
            'Priority': fm.reading_priority ?? '',
            'Order': fm.reading_order ?? '',
            'Notes Exported': fm.notes_exported ? 'Yes' : 'No',
            'Started': fm.started_at ?? '',
            'Finished': fm.finished_at ?? '',
            'My Notes': fm.my_notes ?? '',
            'Relevance': fm.relevant_to_my_study ?? '',
            'Path': note.path,
          });
        } catch { /* skip */ }
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      // Auto-size columns based on header length + first row
      const headers = Object.keys(rows[0] ?? {});
      ws['!cols'] = headers.map((h) => {
        const sample = String(rows[0]?.[h] ?? '');
        return { wch: Math.min(60, Math.max(12, h.length, sample.length)) };
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Research Matrix');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="research-matrix-${new Date().toISOString().slice(0,10)}.xlsx"`,
        },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
}
