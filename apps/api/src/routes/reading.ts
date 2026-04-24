/**
 * Reading Session routes — safe, incremental note capture for ANY source.
 *
 * Sources supported:
 *   zotero  — imported from Zotero library
 *   papers  — uploaded PDF in /papers
 *   kindle  — Kindle copy-paste or screenshot
 *   web     — any web article
 *   physical — physical book / handwritten
 *   manual  — user writes notes directly, no AI
 *
 * Safety contract:
 *   - source='manual'     → NEVER auto-overwrite, ever.
 *   - source='ai-adopted' → Protected. Requires explicit user action to change.
 *   - source='ai-draft'   → AI can re-generate if user requests, but only for
 *                           pages not yet adopted.
 *   - Page conflict check → If notes exist for requested pageRange, return 409
 *     with the conflicting notes for user to review before proceeding.
 */
import type { Hono } from 'hono';
import crypto from 'node:crypto';
import type { StoreData, NoteRecord, ReadingSession } from '../store/types.js';
import { parseLocation } from '../services/citation/location-parser.js';
import { formatInText, formatReference, type CitationStyle, type CitationMeta } from '../services/citation/citation-formatter.js';

export interface ReadingRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

export function registerReadingRoutes(app: Hono, deps: ReadingRoutesDeps): void {
  const { getStore, saveStore } = deps;

  function ensure(store: StoreData) {
    if (!store.readingNoteSessions) store.readingNoteSessions = [];
    if (!store.notes) store.notes = [];
  }

  // ── Sessions: list ──────────────────────────────────────────────────
  app.get('/api/reading/sessions', (c) => {
    const store = getStore();
    ensure(store);
    const sessions = (store.readingNoteSessions || [])
      .filter(s => !s.archived)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return c.json(sessions);
  });

  // ── Sessions: get single ────────────────────────────────────────────
  app.get('/api/reading/sessions/:id', (c) => {
    const store = getStore();
    ensure(store);
    const s = store.readingNoteSessions!.find(x => x.id === c.req.param('id'));
    if (!s) return c.json({ error: 'not found' }, 404);

    // Attach notes to their pages
    const noteMap = new Map<string, NoteRecord>();
    for (const n of (store.notes || [])) {
      if (n.sessionId === s.id) noteMap.set(n.id, n);
    }
    const pagesWithNotes = s.pages.map(p => ({
      ...p,
      notes: p.noteIds.map(id => noteMap.get(id)).filter(Boolean),
    }));

    return c.json({ ...s, pages: pagesWithNotes });
  });

  // ── Sessions: create ─────────────────────────────────────────────────
  app.post('/api/reading/sessions', async (c) => {
    const store = getStore();
    ensure(store);
    const body = await c.req.json<Partial<ReadingSession> & { title: string }>().catch(() => ({ title: '' }) as Partial<ReadingSession> & { title: string });
    if (!body.title?.trim()) return c.json({ error: 'title required' }, 400);

    const session: ReadingSession = {
      id: 'rs-' + crypto.randomUUID().slice(0, 8),
      title: body.title.trim(),
      paperId: body.paperId,
      zoteroKey: body.zoteroKey,
      projectId: body.projectId,
      totalPages: body.totalPages,
      pages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.readingNoteSessions!.push(session);
    saveStore();
    return c.json(session, 201);
  });

  // ── Sessions: update ─────────────────────────────────────────────────
  app.put('/api/reading/sessions/:id', async (c) => {
    const store = getStore();
    ensure(store);
    const s = store.readingNoteSessions!.find(x => x.id === c.req.param('id'));
    if (!s) return c.json({ error: 'not found' }, 404);
    const body = await c.req.json<Partial<ReadingSession>>().catch(() => ({}));
    Object.assign(s, body, { id: s.id, createdAt: s.createdAt, updatedAt: new Date().toISOString() });
    saveStore();
    return c.json(s);
  });

  // ── Sessions: archive ────────────────────────────────────────────────
  app.delete('/api/reading/sessions/:id', (c) => {
    const store = getStore();
    ensure(store);
    const s = store.readingNoteSessions!.find(x => x.id === c.req.param('id'));
    if (!s) return c.json({ error: 'not found' }, 404);
    s.archived = true; s.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true });
  });

  // ── Notes: add (with conflict detection) ────────────────────────────
  app.post('/api/reading/sessions/:id/notes', async (c) => {
    const store = getStore();
    ensure(store);
    const s = store.readingNoteSessions!.find(x => x.id === c.req.param('id'));
    if (!s) return c.json({ error: 'session not found' }, 404);

    const body = await c.req.json<{
      pageRange: string;
      inputMethod: 'copy-paste' | 'image' | 'manual';
      notes: Array<{
        type: NoteRecord['type'];
        content: string;
        themes?: string[];
        source?: NoteRecord['source'];
        location?: string;
      }>;
      forceOverwrite?: boolean;
      location?: string;
    }>().catch(() => null);

    if (!body?.pageRange || !Array.isArray(body.notes)) {
      return c.json({ error: 'pageRange and notes[] required' }, 400);
    }

    // ── Safety check: find conflicting notes for this pageRange ────────
    const conflicting = (store.notes || []).filter(
      (n: NoteRecord) =>
        n.sessionId === s.id &&
        n.pageRange === body.pageRange &&
        (n.source === 'manual' || n.source === 'ai-adopted')
    );

    if (conflicting.length > 0 && !body.forceOverwrite) {
      return c.json({
        conflict: true,
        message: `يوجد ${conflicting.length} ملاحظة محمية لصفحات ${body.pageRange}. راجعها قبل الاستمرار.`,
        conflictingNotes: conflicting,
        hint: 'أضف forceOverwrite:true لاستبدال draft فقط، أو عدّل الملاحظات المعتمدة يدوياً.',
      }, 409);
    }

    // ── Determine source type ──────────────────────────────────────────
    const defaultSource: NoteRecord['source'] = body.inputMethod === 'manual' ? 'manual' : 'ai-draft';

    // ── Parse session-level location (applies to all notes if no per-note location) ──
    const sessionLocation = body.location ? parseLocation(body.location) : undefined;

    // ── Create note records ────────────────────────────────────────────
    const created: NoteRecord[] = body.notes
      .filter(n => n.content?.trim())
      .map(n => ({
        id: 'rn-' + crypto.randomUUID().slice(0, 8),
        paperId: s.paperId || s.id,
        section: `صفحات ${body.pageRange}`,
        type: n.type || 'claim',
        content: n.content.trim(),
        themes: n.themes || [],
        source: n.source || defaultSource,
        pageRange: body.pageRange,
        sessionId: s.id,
        bookTitle: s.title,
        zoteroKey: s.zoteroKey,
        location: n.location ? parseLocation(n.location) : sessionLocation,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as NoteRecord));

    store.notes!.push(...created);

    // ── Update session page record ─────────────────────────────────────
    const existingPage = s.pages.find(p => p.pageRange === body.pageRange);
    if (existingPage) {
      existingPage.noteIds.push(...created.map(n => n.id));
      existingPage.processedAt = new Date().toISOString();
    } else {
      s.pages.push({
        pageRange: body.pageRange,
        inputMethod: body.inputMethod,
        noteIds: created.map(n => n.id),
        processedAt: new Date().toISOString(),
      });
    }
    s.updatedAt = new Date().toISOString();

    saveStore();
    return c.json({ ok: true, created: created.length, noteIds: created.map(n => n.id) }, 201);
  });

  // ── Notes: adopt (protect from overwrite) ───────────────────────────
  app.put('/api/reading/sessions/:id/notes/:noteId/adopt', (c) => {
    const store = getStore();
    ensure(store);
    const note = (store.notes || []).find(
      (n: NoteRecord) => n.id === c.req.param('noteId') && n.sessionId === c.req.param('id')
    );
    if (!note) return c.json({ error: 'not found' }, 404);
    if (note.source === 'manual') return c.json({ ok: true, message: 'already manual (always protected)' });
    note.source = 'ai-adopted';
    note.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true, noteId: note.id, source: note.source });
  });

  // ── Notes: adopt all drafts in a page range ──────────────────────────
  app.put('/api/reading/sessions/:id/adopt-range', async (c) => {
    const store = getStore();
    ensure(store);
    const body = await c.req.json<{ pageRange?: string }>().catch(() => ({}) as { pageRange?: string });
    const sid = c.req.param('id');

    const drafts = (store.notes || []).filter(
      (n: NoteRecord) =>
        n.sessionId === sid &&
        n.source === 'ai-draft' &&
        (!body.pageRange || n.pageRange === body.pageRange)
    );

    for (const n of drafts) {
      n.source = 'ai-adopted';
      n.updatedAt = new Date().toISOString();
    }
    saveStore();
    return c.json({ ok: true, adopted: drafts.length });
  });

  // ── Notes: edit (suggest then confirm) ──────────────────────────────
  app.put('/api/reading/sessions/:id/notes/:noteId', async (c) => {
    const store = getStore();
    ensure(store);
    const note = (store.notes || []).find(
      (n: NoteRecord) => n.id === c.req.param('noteId') && n.sessionId === c.req.param('id')
    );
    if (!note) return c.json({ error: 'not found' }, 404);

    const body = await c.req.json<{ content?: string; type?: NoteRecord['type']; themes?: string[]; source?: NoteRecord['source']; location?: string }>().catch(() => ({}) as { content?: string; type?: NoteRecord['type']; themes?: string[]; source?: NoteRecord['source']; location?: string });

    // Editing is always allowed — user explicitly chose to edit
    if (body.content !== undefined) note.content = body.content;
    if (body.type !== undefined) note.type = body.type;
    if (body.themes !== undefined) note.themes = body.themes;
    if (body.source !== undefined) note.source = body.source;
    if (body.location !== undefined) note.location = parseLocation(body.location);
    note.updatedAt = new Date().toISOString();

    saveStore();
    return c.json(note);
  });

  // ── Notes: list for session ──────────────────────────────────────────
  app.get('/api/reading/sessions/:id/notes', (c) => {
    const store = getStore();
    ensure(store);
    const sid = c.req.param('id');
    const pageRange = c.req.query('pageRange');
    const source = c.req.query('source');

    let notes = (store.notes || []).filter((n: NoteRecord) => n.sessionId === sid);
    if (pageRange) notes = notes.filter((n: NoteRecord) => n.pageRange === pageRange);
    if (source) notes = notes.filter((n: NoteRecord) => n.source === source);

    return c.json(notes);
  });

  // ── Progress: covered pages ──────────────────────────────────────────
  app.get('/api/reading/sessions/:id/progress', (c) => {
    const store = getStore();
    ensure(store);
    const s = store.readingNoteSessions!.find(x => x.id === c.req.param('id'));
    if (!s) return c.json({ error: 'not found' }, 404);

    const notesByPage = new Map<string, { count: number; adopted: number; draft: number; manual: number }>();
    for (const n of (store.notes || []).filter((n: NoteRecord) => n.sessionId === s.id)) {
      const pr = n.pageRange || 'unknown';
      const existing = notesByPage.get(pr) || { count: 0, adopted: 0, draft: 0, manual: 0 };
      existing.count++;
      if (n.source === 'ai-adopted') existing.adopted++;
      else if (n.source === 'ai-draft') existing.draft++;
      else if (n.source === 'manual') existing.manual++;
      notesByPage.set(pr, existing);
    }

    return c.json({
      sessionId: s.id,
      title: s.title,
      totalPages: s.totalPages,
      processedRanges: s.pages.length,
      pages: Object.fromEntries(notesByPage),
      summary: {
        totalNotes: Array.from(notesByPage.values()).reduce((sum, v) => sum + v.count, 0),
        adopted: Array.from(notesByPage.values()).reduce((sum, v) => sum + v.adopted, 0),
        draft: Array.from(notesByPage.values()).reduce((sum, v) => sum + v.draft, 0),
        manual: Array.from(notesByPage.values()).reduce((sum, v) => sum + v.manual, 0),
      },
    });
  });

  // ── Citation: generate cite for a note ──────────────────────────────
  app.get('/api/reading/sessions/:id/notes/:noteId/cite', (c) => {
    const store = getStore();
    ensure(store);
    const note = (store.notes || []).find(
      (n: NoteRecord) => n.id === c.req.param('noteId') && n.sessionId === c.req.param('id')
    );
    if (!note) return c.json({ error: 'not found' }, 404);

    const session = store.readingNoteSessions!.find(x => x.id === c.req.param('id'));
    const styleParam = c.req.query('style') ?? 'harvard';
    const style: CitationStyle =
      styleParam === 'apa' || styleParam === 'birmingham' || styleParam === 'harvard'
        ? (styleParam as CitationStyle)
        : 'harvard';

    // Build CitationMeta from session.citationMeta + session title as title fallback
    const sm = session?.citationMeta ?? {};
    const meta: CitationMeta = {
      authors: sm.authors,
      year: sm.year,
      title: session?.title,
      publisher: sm.publisher,
      edition: sm.edition,
      city: sm.city,
      doi: sm.doi,
      journal: sm.journal,
      volume: sm.volume,
      issue: sm.issue,
      isKindleEdition: sm.isKindleEdition,
    };

    const inText = formatInText(meta, note.location, style);
    const reference = formatReference(meta, style);

    return c.json({ inText, reference });
  });

  // ── Impression: per-page ─────────────────────────────────────────────
  app.put('/api/reading/sessions/:id/pages/:pageRange/impression', async (c) => {
    const store = getStore();
    ensure(store);
    const s = store.readingNoteSessions!.find(x => x.id === c.req.param('id'));
    if (!s) return c.json({ error: 'not found' }, 404);

    const body = await c.req.json<{ impression?: string; impressionEn?: string }>().catch(() => ({} as { impression?: string; impressionEn?: string }));
    const pageRange = c.req.param('pageRange');

    let page = s.pages.find(p => p.pageRange === pageRange);
    if (!page) {
      page = { pageRange, inputMethod: 'manual', noteIds: [], processedAt: new Date().toISOString() };
      s.pages.push(page);
    }
    if (body.impression !== undefined) page.impression = body.impression;
    if (body.impressionEn !== undefined) page.impressionEn = body.impressionEn;
    s.updatedAt = new Date().toISOString();

    saveStore();
    return c.json({ ok: true, pageRange, impression: page.impression, impressionEn: page.impressionEn });
  });

  // ── Impression: session-level ────────────────────────────────────────
  app.put('/api/reading/sessions/:id/impression', async (c) => {
    const store = getStore();
    ensure(store);
    const s = store.readingNoteSessions!.find(x => x.id === c.req.param('id'));
    if (!s) return c.json({ error: 'not found' }, 404);

    const body = await c.req.json<{ impression?: string; impressionEn?: string }>().catch(() => ({} as { impression?: string; impressionEn?: string }));
    if (body.impression !== undefined) s.impression = body.impression;
    if (body.impressionEn !== undefined) s.impressionEn = body.impressionEn;
    s.updatedAt = new Date().toISOString();

    saveStore();
    return c.json({ ok: true, impression: s.impression, impressionEn: s.impressionEn });
  });

  // ── Citation: save/update session citationMeta ───────────────────────
  app.post('/api/reading/sessions/:id/citationMeta', async (c) => {
    const store = getStore();
    ensure(store);
    const s = store.readingNoteSessions!.find(x => x.id === c.req.param('id'));
    if (!s) return c.json({ error: 'not found' }, 404);

    const body = await c.req.json<ReadingSession['citationMeta']>().catch(() => ({}));
    s.citationMeta = { ...(s.citationMeta ?? {}), ...body };
    s.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true, citationMeta: s.citationMeta });
  });
}
