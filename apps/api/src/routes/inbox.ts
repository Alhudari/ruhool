/**
 * Quick-Capture (Inbox) — fleeting thoughts, images, and ideas captured
 * anywhere in the platform that user can triage later or have Rumman organize.
 *
 *   GET    /api/inbox                 — list pending captures (newest first)
 *   POST   /api/inbox                 — capture { kind, content, image? }
 *   PATCH  /api/inbox/:id             — update title/content
 *   DELETE /api/inbox/:id             — discard
 *   POST   /api/inbox/:id/promote     — move to a real location: { destination, frontmatter? }
 *   POST   /api/inbox/:id/ask-rumman  — ask Rumman where this should go
 */
import type { Hono } from 'hono';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { writeNoteRaw, getVaultRoot, writeFrontmatter } from '@ruhool/core';
import { auditLog } from '../services/audit-log.js';

export type InboxKind = 'note' | 'image' | 'link' | 'voice-memo';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  title?: string;
  content?: string;
  imagePath?: string;   // vault-relative path of saved image
  url?: string;
  tags?: string[];
  capturedAt: string;
  capturedFrom?: string; // 'manual' | 'rumman' | 'shwasha' | 'mudawwin'
  promoted?: boolean;
  promotedTo?: string;
}

interface Deps {
  getStore: () => unknown;
  saveStore: () => void;
}

function getInboxStore(store: unknown): InboxItem[] {
  const s = store as { inboxItems?: InboxItem[] };
  if (!s.inboxItems) s.inboxItems = [];
  return s.inboxItems;
}

export function registerInboxRoutes(app: Hono, { getStore, saveStore }: Deps): void {

  // ── List ─────────────────────────────────────────────────────────────
  app.get('/api/inbox', (c) => {
    const items = getInboxStore(getStore())
      .filter((i) => !i.promoted)
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
    return c.json({ items, total: items.length });
  });

  // ── Capture ──────────────────────────────────────────────────────────
  // Body: { kind, title?, content?, image?: { base64, mimeType, name }, url?, tags?, capturedFrom? }
  app.post('/api/inbox', async (c) => {
    const body = await c.req.json<{
      kind: InboxKind;
      title?: string;
      content?: string;
      image?: { base64: string; mimeType: string; name?: string };
      url?: string;
      tags?: string[];
      capturedFrom?: string;
    }>();

    const id = crypto.randomUUID();
    const item: InboxItem = {
      id,
      kind: body.kind,
      title: body.title,
      content: body.content,
      url: body.url,
      tags: body.tags ?? [],
      capturedAt: new Date().toISOString(),
      capturedFrom: body.capturedFrom ?? 'manual',
    };

    // If image, save to vault Inbox/images/
    if (body.image?.base64) {
      try {
        const vaultRoot = getVaultRoot();
        const ext = body.image.mimeType.split('/')[1] || 'png';
        const stamp = Date.now();
        const name = (body.image.name?.replace(/[^\w.-]/g, '_') || `capture-${stamp}.${ext}`);
        const relPath = `00 Inbox/images/${stamp}-${name}`;
        const absPath = path.join(vaultRoot, relPath);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        const buf = Buffer.from(body.image.base64, 'base64');
        await fs.writeFile(absPath, buf);
        item.imagePath = relPath;
      } catch { /* image save failed but item still captured */ }
    }

    getInboxStore(getStore()).push(item);
    saveStore();
    await auditLog({ action: `inbox.capture.${item.kind}`, source: `platform:${item.capturedFrom}`, meta: { id, hasImage: !!item.imagePath } });
    return c.json(item, 201);
  });

  // ── Update ───────────────────────────────────────────────────────────
  app.patch('/api/inbox/:id', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json<Partial<Pick<InboxItem, 'title' | 'content' | 'tags' | 'url'>>>();
    const items = getInboxStore(getStore());
    const item = items.find((i) => i.id === id);
    if (!item) return c.json({ error: 'not found' }, 404);
    Object.assign(item, body);
    saveStore();
    return c.json(item);
  });

  // ── Discard ──────────────────────────────────────────────────────────
  app.delete('/api/inbox/:id', async (c) => {
    const { id } = c.req.param();
    const store = getStore() as { inboxItems?: InboxItem[] };
    const before = store.inboxItems?.length ?? 0;
    store.inboxItems = (store.inboxItems ?? []).filter((i) => i.id !== id);
    if (store.inboxItems.length === before) return c.json({ error: 'not found' }, 404);
    saveStore();
    await auditLog({ action: 'inbox.discard', source: 'platform:user', meta: { id } });
    return c.json({ ok: true });
  });

  // ── Promote: move to a real vault location ──────────────────────────
  // Body: { destination, frontmatter?: Record<string, unknown> }
  app.post('/api/inbox/:id/promote', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json<{ destination: string; frontmatter?: Record<string, unknown> }>();
    if (!body.destination) return c.json({ error: 'destination required' }, 400);
    const items = getInboxStore(getStore());
    const item = items.find((i) => i.id === id);
    if (!item) return c.json({ error: 'not found' }, 404);

    const fm: Record<string, unknown> = {
      created: item.capturedAt.slice(0, 10),
      promoted_from_inbox: true,
      tags: item.tags ?? [],
      ...(body.frontmatter ?? {}),
    };
    const keyOrder = Object.keys(fm);
    const yaml = writeFrontmatter(fm, keyOrder);
    const title = item.title || (item.content?.split('\n')[0]?.slice(0, 60)) || `Capture ${item.capturedAt.slice(0, 10)}`;
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 100);
    const finalPath = body.destination.endsWith('.md') ? body.destination : `${body.destination}/${safeTitle}.md`;

    const lines = [
      '---', yaml, '---', '',
      `# ${title}`, '',
      item.content ?? '',
    ];
    if (item.imagePath) lines.push('', `![[${item.imagePath}]]`);
    if (item.url) lines.push('', `🔗 ${item.url}`);

    try {
      await writeNoteRaw(finalPath, lines.join('\n'));
      item.promoted = true;
      item.promotedTo = finalPath;
      saveStore();
      await auditLog({ action: 'inbox.promote', path: finalPath, source: 'platform:user', meta: { id, kind: item.kind } });
      return c.json({ ok: true, path: finalPath });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });
}
