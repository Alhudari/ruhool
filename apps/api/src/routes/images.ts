import type { Hono } from 'hono';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { StoreData } from '../store/types.js';

export interface ImagesRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  imagesDir: string;
}

export interface ImageRecord {
  id: string;
  filename: string;
  originalName: string;
  mime: string;
  bytes: number;
  uploadedAt: string;
  conversationId?: string;
  ocrText?: string;
  classification?: string;
  tags?: string[];
}

/**
 * Image library (Al-Fatin vision) upload / list / serve / delete routes.
 */
export function registerImagesRoutes(app: Hono, deps: ImagesRoutesDeps): void {
  const { getStore, saveStore, imagesDir } = deps;

  // POST /api/images/upload  (multipart: files[], conversationId?)
  app.post('/api/images/upload', async (c) => {
    const store = getStore();
    try {
      const form = await c.req.formData();
      const convId = (form.get('conversationId') as string) || undefined;
      const files = form.getAll('files').filter((f) => f instanceof File) as File[];
      if (files.length === 0) return c.json({ error: 'No files uploaded' }, 400);

      const results: Array<ImageRecord & { base64: string }> = [];
      for (const f of files) {
        const buf = Buffer.from(await f.arrayBuffer());
        const id = crypto.randomUUID();
        const ext = (f.name.match(/\.[a-z0-9]+$/i)?.[0] || '.jpg').toLowerCase();
        const filename = `${id}${ext}`;
        fs.writeFileSync(path.join(imagesDir, filename), buf);
        const rec: ImageRecord = {
          id, filename, originalName: f.name || filename,
          mime: f.type || 'image/jpeg', bytes: buf.length,
          uploadedAt: new Date().toISOString(),
          conversationId: convId,
        };
        if (!(store as unknown as { images?: unknown }).images) {
          (store as unknown as { images: ImageRecord[] }).images = [];
        }
        ((store as unknown as { images: ImageRecord[] }).images).unshift(rec);
        results.push({ ...rec, base64: buf.toString('base64') });
      }
      saveStore();
      return c.json({ ok: true, images: results });
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : 'Upload failed' }, 500);
    }
  });

  // GET /api/images/:filename  — serve raw image
  app.get('/api/images/:filename', (c) => {
    const name = c.req.param('filename');
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return c.json({ error: 'Invalid filename' }, 400);
    const p = path.join(imagesDir, name);
    if (!fs.existsSync(p)) return c.json({ error: 'Not found' }, 404);
    const buf = fs.readFileSync(p);
    const ext = (name.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
    return new Response(buf, { headers: { 'content-type': mime, 'cache-control': 'public, max-age=86400' } });
  });

  // GET /api/images  — library listing (metadata only)
  app.get('/api/images', (c) => {
    const store = getStore();
    const list = ((store as unknown as { images?: ImageRecord[] }).images) || [];
    return c.json({ images: list });
  });

  // DELETE /api/images/:id
  app.delete('/api/images/:id', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const list = ((store as unknown as { images?: ImageRecord[] }).images) || [];
    const idx = list.findIndex((x) => x.id === id);
    if (idx < 0) return c.json({ error: 'Not found' }, 404);
    const [removed] = list.splice(idx, 1);
    try { fs.unlinkSync(path.join(imagesDir, removed.filename)); } catch {}
    saveStore();
    return c.json({ ok: true });
  });
}
