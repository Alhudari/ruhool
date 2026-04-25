/**
 * Vault Trash — vault deletes go to .trash/{date}/{file} first.
 *
 *   POST /api/vault/trash               — move a vault path to .trash
 *   GET  /api/vault/trash               — list trashed items
 *   POST /api/vault/trash/restore       — restore a trashed item
 *   POST /api/vault/trash/purge         — purge items older than retentionDays
 */
import type { Hono } from 'hono';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getVaultRoot, moveInVault } from '@ruhool/core';
import { auditLog } from '../services/audit-log.js';

const TRASH_DIR = '.trash';
const DEFAULT_RETENTION = 30;

export function registerVaultTrashRoutes(app: Hono): void {

  app.post('/api/vault/trash', async (c) => {
    const body = await c.req.json<{ path: string }>();
    if (!body.path) return c.json({ error: 'path required' }, 400);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = path.basename(body.path);
    const trashPath = `${TRASH_DIR}/${stamp}/${Date.now()}-${filename}`;
    try {
      await moveInVault(body.path, trashPath);
      await auditLog({ action: 'vault.trash', path: body.path, source: 'platform:user', meta: { trashPath } });
      return c.json({ ok: true, trashPath });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get('/api/vault/trash', async (c) => {
    const dir = path.join(getVaultRoot(), TRASH_DIR);
    let stamps: string[] = [];
    try { stamps = await fs.readdir(dir); } catch { /* none */ }
    const items: Array<{ trashPath: string; name: string; trashedAt: string; sizeKB: number }> = [];
    for (const stamp of stamps) {
      const sub = path.join(dir, stamp);
      let files: string[] = [];
      try { files = await fs.readdir(sub); } catch { continue; }
      for (const f of files) {
        try {
          const st = await fs.stat(path.join(sub, f));
          items.push({
            trashPath: `${TRASH_DIR}/${stamp}/${f}`,
            name: f.replace(/^\d+-/, ''),
            trashedAt: stamp,
            sizeKB: Math.round(st.size / 1024),
          });
        } catch { /* skip */ }
      }
    }
    items.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
    return c.json({ items, total: items.length });
  });

  app.post('/api/vault/trash/restore', async (c) => {
    const body = await c.req.json<{ trashPath: string; restoreTo: string }>();
    if (!body.trashPath || !body.restoreTo) return c.json({ error: 'both paths required' }, 400);
    try {
      await moveInVault(body.trashPath, body.restoreTo);
      await auditLog({ action: 'vault.restore', path: body.restoreTo, source: 'platform:user', meta: { from: body.trashPath } });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/vault/trash/purge', async (c) => {
    const body = await c.req.json<{ retentionDays?: number }>().catch(() => ({ retentionDays: DEFAULT_RETENTION }));
    const days = body.retentionDays ?? DEFAULT_RETENTION;
    const dir = path.join(getVaultRoot(), TRASH_DIR);
    let stamps: string[] = [];
    try { stamps = await fs.readdir(dir); } catch { return c.json({ purged: 0 }); }
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    let purged = 0;
    for (const stamp of stamps) {
      if (stamp >= cutoff) continue;
      try {
        await fs.rm(path.join(dir, stamp), { recursive: true, force: true });
        purged++;
      } catch { /* skip */ }
    }
    await auditLog({ action: 'vault.trash.purge', source: 'platform:user', meta: { purged, retentionDays: days } });
    return c.json({ purged });
  });
}
