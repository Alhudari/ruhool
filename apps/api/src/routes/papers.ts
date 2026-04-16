import type { Hono } from 'hono';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PaperRecord, StoreData } from '../store/types.js';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// Loose type to match the real logActivity signature without tightly coupling.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogActivity = (...args: any[]) => any;

export interface PapersRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  papersDir: string;
  ensurePapersDir: () => void;
  splitIntoSections: (text: string) => { title: string; content: string }[];
  deleteNoteFile: (noteId: string) => void;
  logActivity: LogActivity;
}

/**
 * Papers CRUD routes (REL-01 stage 2d, Phase B).
 * Extracted from apps/api/src/index.ts.
 */
export function registerPapersRoutes(app: Hono, deps: PapersRoutesDeps): void {
  const { getStore, saveStore, papersDir, ensurePapersDir, splitIntoSections, deleteNoteFile, logActivity } = deps;

  app.get('/api/papers', (c) => {
    const store = getStore();
    const includeArchived = c.req.query('archived') === 'true';
    const src = (store.papers || []).filter((p) => includeArchived || !p.archived);
    const papers = src.map((p) => ({
      id: p.id, filename: p.filename, title: p.title, authors: p.authors,
      pages: p.pages, textLength: p.textLength, createdAt: p.createdAt,
      archived: !!p.archived,
      noteCount: (store.notes || []).filter((n) => n.paperId === p.id).length,
      sectionCount: p.sections.length,
    }));
    return c.json(papers);
  });

  app.get('/api/papers/:id', (c) => {
    const store = getStore();
    const paper = (store.papers || []).find((p) => p.id === c.req.param('id'));
    if (!paper) return c.json({ error: 'Not found' }, 404);
    const notes = (store.notes || []).filter((n) => n.paperId === paper.id);
    return c.json({ ...paper, notes });
  });

  app.post('/api/papers', async (c) => {
    try {
      const store = getStore();
      const body = await c.req.parseBody();
      const file = body['file'];
      if (!file || typeof file === 'string') {
        return c.json({ error: 'No PDF file provided' }, 400);
      }

      const fileObj = file as File;
      const buffer = Buffer.from(await fileObj.arrayBuffer());
      const parsed = await pdfParse(buffer);
      const sections = splitIntoSections(parsed.text);

      ensurePapersDir();
      const paperId = crypto.randomUUID();
      const safeFilename = fileObj.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const pdfPath = path.join(papersDir, paperId + '_' + safeFilename);
      fs.writeFileSync(pdfPath, buffer);

      const titleField = body['title'];
      const authorsField = body['authors'];
      const paper: PaperRecord = {
        id: paperId, filename: fileObj.name,
        title: (typeof titleField === 'string' ? titleField : '') || fileObj.name.replace('.pdf', ''),
        authors: (typeof authorsField === 'string' ? authorsField : '') || '',
        pages: parsed.numpages || 0, textLength: parsed.text.length,
        sections, createdAt: new Date().toISOString(),
      };

      if (!store.papers) store.papers = [];
      store.papers.push(paper);
      logActivity('file_upload', `Paper uploaded: ${paper.title}`, `${paper.filename} — ${paper.pages} pages, ${sections.length} sections`, { metadata: { paperId: paper.id, pages: paper.pages, sections: sections.length } });
      saveStore();
      return c.json({ id: paper.id, filename: paper.filename, title: paper.title, pages: paper.pages, sectionCount: sections.length }, 201);
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : 'Failed to process PDF' }, 500);
    }
  });

  app.put('/api/papers/:id/archive', async (c) => {
    const store = getStore();
    if (!store.papers) return c.json({ error: 'Not found' }, 404);
    const paper = store.papers.find((p) => p.id === c.req.param('id'));
    if (!paper) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json().catch(() => ({}));
    paper.archived = body.archived !== false;
    saveStore();
    return c.json({ ok: true });
  });

  app.delete('/api/papers/:id', (c) => {
    const store = getStore();
    if (!store.papers) return c.json({ error: 'Not found' }, 404);
    const idx = store.papers.findIndex((p) => p.id === c.req.param('id'));
    if (idx === -1) return c.json({ error: 'Not found' }, 404);
    const paper = store.papers[idx];
    const safeFilename = paper.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const pdfPath = path.join(papersDir, paper.id + '_' + safeFilename);
    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    const noteIds = (store.notes || []).filter((n) => n.paperId === paper.id).map((n) => n.id);
    noteIds.forEach((nid) => deleteNoteFile(nid));
    store.notes = (store.notes || []).filter((n) => n.paperId !== paper.id);
    store.papers.splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });
}
