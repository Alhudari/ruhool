/**
 * R16 — In-platform inbox for reports + onboarding messages.
 *
 * Abdullah doesn't have Resend wired yet, and wanted a place in the
 * platform to read reports as if they arrived in an email client. This
 * mirrors every successful compose into `store.reportInbox[]` and
 * exposes CRUD over it.
 */
import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';

export interface ReportsInboxRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

export function registerReportsInboxRoutes(app: Hono, deps: ReportsInboxRoutesDeps): void {
  const { getStore, saveStore } = deps;

  // GET /api/reports/inbox — paginated newest-first. Lightweight shape
  // (no html) so the list renders fast; open a single item to fetch
  // the full body.
  app.get('/api/reports/inbox', (c) => {
    const store = getStore();
    const showArchived = c.req.query('archived') === 'true';
    const all = (store.reportInbox ?? []).filter(i => {
      if (i.deletedAt) return false;
      if (!showArchived && i.archivedAt) return false;
      return true;
    });
    const total = all.length;
    const rawLimit = parseInt(c.req.query('limit') ?? '50', 10);
    const rawOffset = parseInt(c.req.query('offset') ?? '0', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 50;
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
    const end = Math.max(0, total - offset);
    const start = Math.max(0, end - limit);
    const page = all.slice(start, end).reverse().map((i) => ({
      id: i.id,
      reportId: i.reportId,
      runId: i.runId,
      subject: i.subject,
      from: i.from,
      sentAt: i.sentAt,
      read: i.read,
      starred: i.starred ?? false,
      tags: i.tags ?? [],
      preview: (i.bodyMarkdown ?? '').slice(0, 180),
    }));
    const unread = all.filter((i) => !i.read).length;
    return c.json({ items: page, total, unread, offset, limit });
  });

  // GET /api/reports/inbox/:id — full item including html + bodyMarkdown.
  app.get('/api/reports/inbox/:id', (c) => {
    const store = getStore();
    const item = (store.reportInbox ?? []).find((i) => i.id === c.req.param('id'));
    if (!item) return c.json({ error: 'not found' }, 404);
    return c.json(item);
  });

  // PATCH /api/reports/inbox/:id  { read?, starred?, archived? }
  app.patch('/api/reports/inbox/:id', async (c) => {
    const store = getStore();
    const item = (store.reportInbox ?? []).find((i) => i.id === c.req.param('id'));
    if (!item) return c.json({ error: 'not found' }, 404);
    const body = await c.req.json().catch(() => ({})) as { read?: boolean; starred?: boolean; archived?: boolean };
    if (typeof body.read === 'boolean') item.read = body.read;
    if (typeof body.starred === 'boolean') item.starred = body.starred;
    if (typeof body.archived === 'boolean') {
      item.archivedAt = body.archived ? new Date().toISOString() : undefined;
    }
    saveStore();
    return c.json(item);
  });

  // DELETE /api/reports/inbox/:id — soft delete (sets deletedAt)
  // Use ?permanent=true for hard delete
  app.delete('/api/reports/inbox/:id', (c) => {
    const store = getStore();
    if (!store.reportInbox) store.reportInbox = [];
    const item = store.reportInbox.find((i) => i.id === c.req.param('id'));
    if (!item) return c.json({ error: 'not found' }, 404);
    if (c.req.query('permanent') === 'true') {
      store.reportInbox = store.reportInbox.filter(i => i.id !== c.req.param('id'));
    } else {
      item.deletedAt = new Date().toISOString();
    }
    saveStore();
    return c.json({ ok: true });
  });

  // POST /api/reports/inbox/:id/restore — undo soft delete
  app.post('/api/reports/inbox/:id/restore', (c) => {
    const store = getStore();
    const item = (store.reportInbox ?? []).find((i) => i.id === c.req.param('id'));
    if (!item) return c.json({ error: 'not found' }, 404);
    delete item.deletedAt;
    delete item.archivedAt;
    saveStore();
    return c.json({ ok: true });
  });

  // POST /api/reports/inbox/mark-all-read — batch convenience.
  app.post('/api/reports/inbox/mark-all-read', (c) => {
    const store = getStore();
    let changed = 0;
    for (const i of (store.reportInbox ?? [])) {
      if (!i.read) { i.read = true; changed += 1; }
    }
    if (changed > 0) saveStore();
    return c.json({ changed });
  });
}
