import type { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';

export interface TrashItem {
  id: string;
  type: 'library';
  originalId: string;
  deletedAt: string;
}

export interface TrashRoutesDeps {
  trashMetaPath: string;
  studioAssetsDir: string;
  parseLibraryId: (id: string) => { kind: string; rest: string } | null;
  archiveRender: (id: string, archived: boolean) => void;
  deleteRender: (id: string) => void;
}

/** Load current trash list from metadata file. */
export function loadTrashFrom(trashMetaPath: string): TrashItem[] {
  try { return JSON.parse(fs.readFileSync(trashMetaPath, 'utf-8')); } catch { return []; }
}

/** Persist trash list to metadata file. */
export function saveTrashTo(trashMetaPath: string, t: TrashItem[]): void {
  fs.writeFileSync(trashMetaPath, JSON.stringify(t, null, 2));
}

/**
 * /api/trash routes — list, restore, permanent delete, empty.
 * Extracted from index.ts (REL-01 stage 2d, step 12).
 */
export function registerTrashRoutes(app: Hono, deps: TrashRoutesDeps): void {
  const { trashMetaPath, studioAssetsDir, parseLibraryId, archiveRender, deleteRender } = deps;

  app.get('/api/trash', (c) => c.json(loadTrashFrom(trashMetaPath)));

  app.post('/api/trash/:originalId/restore', (c) => {
    const originalId = c.req.param('originalId');
    const trash = loadTrashFrom(trashMetaPath);
    const idx = trash.findIndex((t) => t.originalId === originalId);
    if (idx === -1) return c.json({ error: 'Not in trash' }, 404);
    trash.splice(idx, 1);
    saveTrashTo(trashMetaPath, trash);
    const parsed = parseLibraryId(originalId);
    if (parsed?.kind === 'render') archiveRender(parsed.rest, false);
    return c.json({ ok: true });
  });

  app.delete('/api/trash/:originalId', (c) => {
    const originalId = c.req.param('originalId');
    const trash = loadTrashFrom(trashMetaPath);
    const idx = trash.findIndex((t) => t.originalId === originalId);
    if (idx === -1) return c.json({ error: 'Not in trash' }, 404);
    const [item] = trash.splice(idx, 1);
    saveTrashTo(trashMetaPath, trash);

    const parsed = parseLibraryId(item.originalId);
    if (parsed?.kind === 'render') {
      deleteRender(parsed.rest);
    } else if (parsed?.kind === 'studio-asset') {
      const filename = parsed.rest;
      if (!filename.includes('..') && !filename.includes('/') && !filename.includes('\\')) {
        const fp = path.join(studioAssetsDir, filename);
        try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
      }
    }
    return c.json({ ok: true, permanentlyDeleted: true });
  });

  app.delete('/api/trash', (c) => {
    const trash = loadTrashFrom(trashMetaPath);
    for (const item of trash) {
      const parsed = parseLibraryId(item.originalId);
      if (parsed?.kind === 'render') { deleteRender(parsed.rest); }
      else if (parsed?.kind === 'studio-asset') {
        const fp = path.join(studioAssetsDir, parsed.rest);
        try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
      }
    }
    saveTrashTo(trashMetaPath, []);
    return c.json({ ok: true, count: trash.length });
  });
}
