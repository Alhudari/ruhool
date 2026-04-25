// Export / import routes — extracted from index.ts (REL-01 stage 2d).
// Handlers:
//   POST /api/export           — full JSON export (optionally with base64 media)
//   POST /api/import           — restore from export (merge or replace)
//   GET  /api/export/preview   — size estimate for each media folder

import fs from 'node:fs';
import path from 'node:path';
import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';

export interface ExportRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  dataDir: string;
}

export function registerExportRoutes(app: Hono, deps: ExportRoutesDeps): void {
  const { getStore, saveStore, dataDir } = deps;
  const dirOf = (...p: string[]) => path.join(dataDir, ...p);

  app.post('/api/export', async (c) => {
    const body = await c.req.json<{
      includeData?: boolean;
      includeVideos?: boolean;
      includeImages?: boolean;
      includeAudio?: boolean;
      includeStatements?: boolean;
      includeUploads?: boolean;
      sanitize?: boolean;
    }>().catch(() => ({ includeData: true } as {
      includeData?: boolean; includeVideos?: boolean; includeImages?: boolean;
      includeAudio?: boolean; includeStatements?: boolean; includeUploads?: boolean; sanitize?: boolean;
    }));

    const store = getStore();
    const exportData: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      exportedBy: 'Ruhool platform',
      version: '1.0',
    };

    if (body.includeData !== false) {
      const storeCopy = JSON.parse(JSON.stringify(store)) as Record<string, unknown>;
      if (body.sanitize) {
        storeCopy.apiKeys = {};
        if (Array.isArray(storeCopy.providers)) {
          storeCopy.providers = (storeCopy.providers as Array<Record<string, unknown>>).map((p) => ({ ...p, apiKey: '' }));
        }
        if (storeCopy.notifications && typeof storeCopy.notifications === 'object') {
          const n = storeCopy.notifications as Record<string, unknown>;
          if (n.smtpPass) n.smtpPass = '';
        }
      }
      exportData.store = storeCopy;
    }

    try {
      const metaFile = dirOf('videos', '_renders.json');
      if (fs.existsSync(metaFile)) exportData.renders = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    } catch { /* ignore */ }

    const collectFiles = (dir: string): Array<{ filename: string; sizeBytes: number; base64: string }> => {
      if (!fs.existsSync(dir)) return [];
      const out: Array<{ filename: string; sizeBytes: number; base64: string }> = [];
      for (const fn of fs.readdirSync(dir)) {
        if (fn.startsWith('_') || fn.startsWith('.')) continue;
        const fp = path.join(dir, fn);
        const stat = fs.statSync(fp);
        if (!stat.isFile()) continue;
        out.push({ filename: fn, sizeBytes: stat.size, base64: fs.readFileSync(fp).toString('base64') });
      }
      return out;
    };
    if (body.includeVideos) exportData.videos = collectFiles(dirOf('videos'));
    if (body.includeImages) exportData.images = collectFiles(dirOf('studio-assets'));
    if (body.includeAudio) {
      exportData.audio = collectFiles(dirOf('audio'));
      exportData.voiceSamples = collectFiles(dirOf('voice-samples'));
    }
    if (body.includeStatements) {
      exportData.statements = collectFiles(dirOf('statements'));
      exportData.subscriptionFiles = collectFiles(dirOf('subscription-files'));
    }
    if (body.includeUploads) exportData.uploads = collectFiles(dirOf('uploads'));

    const json = JSON.stringify(exportData);
    const filename = `ruhool-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(json, {
      headers: {
        'content-type': 'application/json',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  });

  app.post('/api/import', async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!file || typeof file === 'string') return c.json({ error: 'file required' }, 400);
    const merge = body.merge === 'true';
    const restoreMedia = body.restoreMedia !== 'false';
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(await (file as File).text()) as Record<string, unknown>;
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    const store = getStore();
    const summary: Record<string, number | string> = { restored: 0 };

    try {
      const storeFile = dirOf('.store.json');
      fs.copyFileSync(storeFile, storeFile + '.backup-' + Date.now());
    } catch { /* ignore */ }

    if (data.store) {
      if (merge) {
        const incoming = data.store as Record<string, unknown>;
        for (const [k, v] of Object.entries(incoming)) {
          if (Array.isArray(v) && Array.isArray((store as unknown as Record<string, unknown>)[k])) {
            const existing = (store as unknown as Record<string, unknown[]>)[k];
            const existingIds = new Set(existing.map((x) => (x as { id?: string }).id).filter(Boolean));
            for (const item of v as unknown[]) {
              const id = (item as { id?: string }).id;
              if (!id || !existingIds.has(id)) existing.push(item);
            }
          } else {
            (store as unknown as Record<string, unknown>)[k] = v;
          }
        }
      } else {
        Object.assign(store, data.store);
      }
      saveStore();
      summary.dataRestored = 'yes';
    }

    if (restoreMedia) {
      // F-012: validate filename to prevent path traversal.
      // Only basenames allowed; reject path separators, drive letters, "..", and absolute paths.
      const isSafeBasename = (name: string): boolean => {
        if (typeof name !== 'string' || name.length === 0 || name.length > 255) return false;
        if (name.includes('/') || name.includes('\\')) return false;
        if (name === '.' || name === '..') return false;
        if (/^[a-zA-Z]:/.test(name)) return false; // Windows drive letter
        // Allow only safe chars: alphanumerics, dot, underscore, hyphen, parens, spaces
        if (!/^[a-zA-Z0-9._\- ()]+$/.test(name)) return false;
        return true;
      };
      const MAX_FILES_PER_KIND = 5000;
      const MAX_BYTES_PER_FILE = 200 * 1024 * 1024; // 200 MB

      const writeFiles = (arr: Array<{ filename: string; base64: string }> | undefined, dir: string): number => {
        if (!arr) return 0;
        const safeDir = path.resolve(dir);
        fs.mkdirSync(safeDir, { recursive: true });
        let n = 0;
        const slice = arr.slice(0, MAX_FILES_PER_KIND);
        for (const f of slice) {
          if (!isSafeBasename(f.filename)) continue; // skip unsafe
          const fp = path.resolve(safeDir, f.filename);
          // Defense in depth: ensure resolved path is still inside safeDir
          if (!fp.startsWith(safeDir + path.sep) && fp !== safeDir) continue;
          const buf = Buffer.from(f.base64, 'base64');
          if (buf.length > MAX_BYTES_PER_FILE) continue;
          if (!merge || !fs.existsSync(fp)) {
            fs.writeFileSync(fp, buf);
            n++;
          }
        }
        return n;
      };
      summary.videos = writeFiles(data.videos as Array<{ filename: string; base64: string }>, dirOf('videos'));
      summary.images = writeFiles(data.images as Array<{ filename: string; base64: string }>, dirOf('studio-assets'));
      summary.audio = writeFiles(data.audio as Array<{ filename: string; base64: string }>, dirOf('audio'));
      summary.voiceSamples = writeFiles(data.voiceSamples as Array<{ filename: string; base64: string }>, dirOf('voice-samples'));
      summary.statements = writeFiles(data.statements as Array<{ filename: string; base64: string }>, dirOf('statements'));
      summary.subscriptionFiles = writeFiles(data.subscriptionFiles as Array<{ filename: string; base64: string }>, dirOf('subscription-files'));
      summary.uploads = writeFiles(data.uploads as Array<{ filename: string; base64: string }>, dirOf('uploads'));
    }

    if (data.renders) {
      try {
        const metaFile = dirOf('videos', '_renders.json');
        fs.writeFileSync(metaFile, JSON.stringify(data.renders, null, 2));
        summary.rendersMeta = 'restored';
      } catch { /* ignore */ }
    }

    return c.json({ ok: true, summary, note: 'Old store backed up to .store.json.backup-<timestamp>' });
  });

  app.get('/api/export/preview', (c) => {
    const sizeOf = (dir: string): { count: number; bytes: number } => {
      if (!fs.existsSync(dir)) return { count: 0, bytes: 0 };
      let count = 0, bytes = 0;
      for (const fn of fs.readdirSync(dir)) {
        if (fn.startsWith('_') || fn.startsWith('.')) continue;
        const fp = path.join(dir, fn);
        const s = fs.statSync(fp);
        if (s.isFile()) { count++; bytes += s.size; }
      }
      return { count, bytes };
    };
    return c.json({
      videos: sizeOf(dirOf('videos')),
      images: sizeOf(dirOf('studio-assets')),
      audio: sizeOf(dirOf('audio')),
      voiceSamples: sizeOf(dirOf('voice-samples')),
      statements: sizeOf(dirOf('statements')),
      subscriptionFiles: sizeOf(dirOf('subscription-files')),
      uploads: sizeOf(dirOf('uploads')),
      storeSize: fs.existsSync(dirOf('.store.json')) ? fs.statSync(dirOf('.store.json')).size : 0,
    });
  });
}
