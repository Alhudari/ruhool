import type { Hono } from 'hono';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface StudioRoutesDeps {
  dataDir: string;
}

/**
 * Studio asset upload / list / serve / delete routes.
 * Heavier demo + render endpoints remain in index.ts for now.
 */
export function registerStudioRoutes(app: Hono, deps: StudioRoutesDeps): void {
  const STUDIO_ASSETS_DIR = path.join(deps.dataDir, 'studio-assets');

  function ensureStudioAssetsDir() {
    if (!fs.existsSync(STUDIO_ASSETS_DIR)) fs.mkdirSync(STUDIO_ASSETS_DIR, { recursive: true });
  }

  app.post('/api/studio/upload', async (c) => {
    ensureStudioAssetsDir();
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!file || typeof file === 'string') return c.json({ error: 'File required' }, 400);
    const blob = file as unknown as File;
    const ext = path.extname(blob.name).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.gif'];
    if (!allowed.includes(ext)) return c.json({ error: `File type ${ext} not allowed. Allowed: ${allowed.join(', ')}` }, 400);
    const id = crypto.randomUUID().slice(0, 8);
    const filename = `${id}${ext}`;
    const buffer = Buffer.from(await blob.arrayBuffer());
    fs.writeFileSync(path.join(STUDIO_ASSETS_DIR, filename), buffer);
    const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
    return c.json({
      filename,
      url: `/api/studio/assets/${filename}`,
      type: isImage ? 'image' : 'video',
      size: buffer.length,
    }, 201);
  });

  app.get('/api/studio/assets', (c) => {
    ensureStudioAssetsDir();
    const files = fs.readdirSync(STUDIO_ASSETS_DIR);
    const assets = files
      .filter((f) => !f.startsWith('.'))
      .map((f) => {
        const ext = path.extname(f).toLowerCase();
        const stats = fs.statSync(path.join(STUDIO_ASSETS_DIR, f));
        const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
        return {
          filename: f,
          url: `/api/studio/assets/${f}`,
          type: isImage ? 'image' : 'video',
          size: stats.size,
        };
      });
    return c.json(assets);
  });

  app.get('/api/studio/assets/:filename', (c) => {
    const filename = c.req.param('filename');
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: 'Invalid filename' }, 400);
    }
    ensureStudioAssetsDir();
    const filePath = path.join(STUDIO_ASSETS_DIR, filename);
    if (!fs.existsSync(filePath)) return c.json({ error: 'Not found' }, 404);
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
      mp4: 'video/mp4', mov: 'video/quicktime',
    };
    c.header('Content-Type', mimeMap[ext] || 'application/octet-stream');
    return c.body(data);
  });

  app.delete('/api/studio/assets/:filename', (c) => {
    const filename = c.req.param('filename');
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: 'Invalid filename' }, 400);
    }
    ensureStudioAssetsDir();
    const filePath = path.join(STUDIO_ASSETS_DIR, filename);
    if (!fs.existsSync(filePath)) return c.json({ error: 'Not found' }, 404);
    fs.unlinkSync(filePath);
    return c.json({ ok: true });
  });
}
