import type { Hono } from 'hono';
import crypto from 'node:crypto';
import type { NoteRecord, StoreData } from '../store/types.js';

export interface NotesRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  saveNoteFile: (note: NoteRecord) => void;
  deleteNoteFile: (noteId: string) => void;
}

/**
 * Notes CRUD routes (REL-01 stage 2d).
 */
export function registerNotesRoutes(app: Hono, deps: NotesRoutesDeps): void {
  const { getStore, saveStore, saveNoteFile, deleteNoteFile } = deps;

  app.get('/api/notes', (c) => {
    const store = getStore();
    const paperId = c.req.query('paperId');
    const noteType = c.req.query('type');
    const includeArchived = c.req.query('archived') === 'true';
    let notes = store.notes || [];
    if (!includeArchived) notes = notes.filter((n) => !n.archived);
    if (paperId) notes = notes.filter((n) => n.paperId === paperId);
    if (noteType) notes = notes.filter((n) => n.type === noteType);
    return c.json(notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  });

  app.put('/api/notes/:id/archive', async (c) => {
    const store = getStore();
    const note = (store.notes || []).find((n) => n.id === c.req.param('id'));
    if (!note) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json().catch(() => ({}));
    note.archived = body.archived !== false;
    saveStore();
    return c.json({ ok: true });
  });

  app.post('/api/notes', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ paperId: string; section: string; type: NoteRecord['type']; content: string; themes?: string[] }>();
    const paper = (store.papers || []).find((p) => p.id === body.paperId);
    if (!paper) return c.json({ error: 'Paper not found' }, 404);

    const note: NoteRecord = {
      id: crypto.randomUUID(), paperId: body.paperId, section: body.section,
      type: body.type, content: body.content, themes: body.themes || [],
      createdAt: new Date().toISOString(),
    };
    if (!store.notes) store.notes = [];
    store.notes.push(note);
    saveNoteFile(note);
    saveStore();
    return c.json(note, 201);
  });

  app.put('/api/notes/:id', async (c) => {
    const store = getStore();
    const note = (store.notes || []).find((n) => n.id === c.req.param('id'));
    if (!note) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<Partial<NoteRecord>>();
    if (body.section !== undefined) note.section = body.section;
    if (body.type !== undefined) note.type = body.type;
    if (body.content !== undefined) note.content = body.content;
    if (body.themes !== undefined) note.themes = body.themes;
    saveNoteFile(note);
    saveStore();
    return c.json(note);
  });

  app.delete('/api/notes/:id', (c) => {
    const store = getStore();
    if (!store.notes) return c.json({ error: 'Not found' }, 404);
    const idx = store.notes.findIndex((n) => n.id === c.req.param('id'));
    if (idx === -1) return c.json({ error: 'Not found' }, 404);
    deleteNoteFile(store.notes[idx].id);
    store.notes.splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });
}
