/**
 * Generated artifact file server — Phase 5.
 *
 * Serves image/audio/video bytes produced by the generation services from
 * `data/<kind>/generated/<filename>`. Path traversal is blocked by validating
 * `<filename>` against a strict regex. Bearer auth is enforced globally by
 * `registerBearerAuth`, so no per-route guard is required here.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Hono } from 'hono';

export interface GeneratedFilesRoutesDeps {
  dataDir: string;
}

const ALLOWED_KINDS: Record<string, { dir: string; mimeDefault: string }> = {
  images: { dir: 'images', mimeDefault: 'image/png' },
  audio: { dir: 'audio', mimeDefault: 'audio/mpeg' },
  video: { dir: 'videos', mimeDefault: 'video/mp4' },
};

const FILENAME_RE = /^[A-Za-z0-9._-]+$/;

function mimeFor(kind: string, filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (kind === 'images') {
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    return 'image/png';
  }
  if (kind === 'audio') {
    if (ext === '.mp3') return 'audio/mpeg';
    if (ext === '.wav') return 'audio/wav';
    if (ext === '.ogg') return 'audio/ogg';
    return 'audio/mpeg';
  }
  if (kind === 'video') {
    if (ext === '.mp4') return 'video/mp4';
    if (ext === '.webm') return 'video/webm';
    return 'video/mp4';
  }
  return 'application/octet-stream';
}

export function registerGeneratedFilesRoutes(app: Hono, deps: GeneratedFilesRoutesDeps): void {
  const { dataDir } = deps;

  app.get('/api/files/:kind/generated/:filename', (c) => {
    const kind = c.req.param('kind');
    const filename = c.req.param('filename');
    const spec = ALLOWED_KINDS[kind];
    if (!spec) return c.json({ error: 'unknown kind' }, 400);
    if (!FILENAME_RE.test(filename)) return c.json({ error: 'bad filename' }, 400);

    const baseDir = path.resolve(path.join(dataDir, spec.dir, 'generated'));
    const full = path.resolve(path.join(baseDir, filename));
    // Path traversal guard — must be under baseDir.
    if (!full.startsWith(baseDir + path.sep) && full !== baseDir) {
      return c.json({ error: 'forbidden' }, 403);
    }
    if (!fs.existsSync(full)) return c.json({ error: 'not found' }, 404);

    const stat = fs.statSync(full);
    const bytes = fs.readFileSync(full);
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': mimeFor(kind, filename),
        'content-length': String(stat.size),
        'cache-control': 'private, max-age=60',
      },
    });
  });
}
