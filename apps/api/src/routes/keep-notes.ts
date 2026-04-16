import type { Hono } from 'hono';
import crypto from 'node:crypto';
import type { KeepNote, StoreData } from '../store/types.js';

export interface KeepNotesRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

/**
 * Keep-notes CRUD routes (REL-01 stage 2d).
 */
export function registerKeepNotesRoutes(app: Hono, deps: KeepNotesRoutesDeps): void {
  const { getStore, saveStore } = deps;

  app.get('/api/keep-notes', (c) => {
    const store = getStore();
    if (!store.keepNotes) store.keepNotes = [];
    const archived = c.req.query('archived');
    let notes = [...store.keepNotes];
    if (archived !== undefined) notes = notes.filter(n => n.archived === (archived === 'true'));
    notes.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return c.json(notes);
  });

  app.post('/api/keep-notes', async (c) => {
    const store = getStore();
    if (!store.keepNotes) store.keepNotes = [];
    const body = await c.req.json<Partial<KeepNote>>();
    const now = new Date().toISOString();
    const note: KeepNote = {
      id: crypto.randomUUID(),
      title: body.title || '',
      content: body.content || '',
      type: body.type || 'text',
      items: body.items || [],
      color: body.color || 'none',
      pinned: body.pinned || false,
      archived: body.archived || false,
      labels: body.labels || [],
      reminders: body.reminders || [],
      images: body.images || [],
      order: body.order ?? store.keepNotes.length,
      createdAt: now,
      updatedAt: now,
    };
    store.keepNotes.push(note);
    saveStore();
    return c.json(note, 201);
  });

  app.put('/api/keep-notes/:id', async (c) => {
    const store = getStore();
    if (!store.keepNotes) store.keepNotes = [];
    const id = c.req.param('id');
    const note = store.keepNotes.find(n => n.id === id);
    if (!note) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<Partial<KeepNote>>();
    Object.assign(note, body, { updatedAt: new Date().toISOString() });
    saveStore();
    return c.json(note);
  });

  app.delete('/api/keep-notes/:id', (c) => {
    const store = getStore();
    if (!store.keepNotes) store.keepNotes = [];
    const id = c.req.param('id');
    const idx = store.keepNotes.findIndex(n => n.id === id);
    if (idx === -1) return c.json({ error: 'Not found' }, 404);
    store.keepNotes.splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });

  app.put('/api/keep-notes/:id/archive', (c) => {
    const store = getStore();
    if (!store.keepNotes) store.keepNotes = [];
    const id = c.req.param('id');
    const note = store.keepNotes.find(n => n.id === id);
    if (!note) return c.json({ error: 'Not found' }, 404);
    note.archived = !note.archived;
    note.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(note);
  });

  app.put('/api/keep-notes/:id/pin', (c) => {
    const store = getStore();
    if (!store.keepNotes) store.keepNotes = [];
    const id = c.req.param('id');
    const note = store.keepNotes.find(n => n.id === id);
    if (!note) return c.json({ error: 'Not found' }, 404);
    note.pinned = !note.pinned;
    note.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(note);
  });
}
