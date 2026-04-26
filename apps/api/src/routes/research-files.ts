/**
 * Research Files Browser — serves files from PhD OneDrive folders.
 *
 * Future: Research Clusters will have jurisdiction (ISO 3166-1 alpha-3)
 * and dimension fields to support cross-platform sync with external
 * research projects (BIM Mandate Map, etc.)
 */
import type { Hono } from 'hono';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

const PHD_ROOT = 'C:\\Users\\alhud\\OneDrive - University of Birmingham\\PhD';

const ALLOWED_SUBFOLDER_PREFIXES = [
  '02_Supervision',
  '03_Literature Review',
  '04_Research Design',
  '05_Thesis Writing',
  '06_Tools and Platforms',
  '07_Training and Development',
];

const VIEWABLE_TYPES = new Set(['.pdf','.jpg','.jpeg','.png','.gif','.webp','.jfif','.svg','.mp4','.webm','.mov','.csv','.txt','.md']);

type ViewMode = 'pdf' | 'image' | 'video' | 'table' | 'text' | 'open-in-app' | 'list-contents';

function getViewMode(ext: string): ViewMode {
  switch (ext) {
    case '.pdf': return 'pdf';
    case '.jpg': case '.jpeg': case '.png': case '.gif': case '.webp': case '.jfif': case '.svg': return 'image';
    case '.mp4': case '.webm': case '.mov': case '.avi': return 'video';
    case '.csv': case '.xlsx': case '.xls': return 'table';
    case '.txt': case '.md': case '.docx': case '.doc': return 'text';
    case '.zip': case '.rar': case '.7z': return 'list-contents';
    default: return 'open-in-app';
  }
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.csv': 'text/csv', '.txt': 'text/plain', '.md': 'text/markdown',
  };
  return map[ext] ?? 'application/octet-stream';
}

function isAllowedPath(absPath: string): boolean {
  const norm = absPath.replace(/\\/g, '/');
  const root = PHD_ROOT.replace(/\\/g, '/');
  if (!norm.startsWith(root + '/')) return false;
  const rel = norm.slice(root.length + 1);
  return ALLOWED_SUBFOLDER_PREFIXES.some(p => rel.startsWith(p));
}

export function registerResearchFilesRoutes(app: Hono): void {

  // ── GET /api/research/roots ───────────────────────────────────────
  app.get('/api/research/roots', (c) => {
    const roots = ALLOWED_SUBFOLDER_PREFIXES.map(sub => ({
      name: sub,
      path: path.join(PHD_ROOT, sub),
      label: sub.replace(/^\d+_/, ''),
    }));
    return c.json({ roots });
  });

  // ── GET /api/research/browse?path= ──────────────────────────────
  app.get('/api/research/browse', async (c) => {
    const reqPath = c.req.query('path') ?? PHD_ROOT;
    const absPath = path.isAbsolute(reqPath) ? reqPath : path.join(PHD_ROOT, reqPath);

    if (!isAllowedPath(absPath) && absPath !== PHD_ROOT) {
      return c.json({ error: 'Path not allowed' }, 403);
    }

    try {
      const entries = await fs.readdir(absPath, { withFileTypes: true });
      const result = await Promise.all(
        entries
          .filter(e => !e.name.startsWith('.'))
          .map(async (e) => {
            const full = path.join(absPath, e.name);
            const ext = path.extname(e.name).toLowerCase();
            let size = 0;
            let modifiedAt = '';
            try {
              const stat = await fs.stat(full);
              size = stat.size;
              modifiedAt = stat.mtime.toISOString();
            } catch { /* ignore */ }
            return {
              name: e.name,
              path: full,
              type: e.isDirectory() ? 'folder' : 'file',
              ext,
              size,
              modifiedAt,
              viewMode: e.isDirectory() ? 'folder' : getViewMode(ext),
            };
          })
      );
      // Folders first, then files, both alphabetical
      result.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return c.json({ path: absPath, entries: result });
    } catch (err) {
      return c.json({ error: `Cannot read path: ${err instanceof Error ? err.message : err}` }, 500);
    }
  });

  // ── GET /api/research/file?path= ─────────────────────────────────
  app.get('/api/research/file', async (c) => {
    const reqPath = c.req.query('path');
    if (!reqPath) return c.json({ error: 'path required' }, 400);
    const absPath = path.isAbsolute(reqPath) ? reqPath : path.join(PHD_ROOT, reqPath);

    if (!isAllowedPath(absPath)) return c.json({ error: 'Path not allowed' }, 403);

    const ext = path.extname(absPath).toLowerCase();
    if (!VIEWABLE_TYPES.has(ext)) return c.json({ error: 'File type not viewable inline; open in app' }, 403);

    try {
      await fs.access(absPath, fsSync.constants.R_OK);
      const stat = await fs.stat(absPath);
      const mime = getMimeType(ext);
      const stream = createReadStream(absPath);
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        headers: {
          'Content-Type': mime,
          'Content-Length': String(stat.size),
          'Content-Disposition': `inline; filename="${path.basename(absPath)}"`,
          'Cache-Control': 'private, max-age=300',
        },
      });
    } catch (err) {
      return c.json({ error: `Cannot read file: ${err instanceof Error ? err.message : err}` }, 404);
    }
  });

  // ── GET /api/research/file-meta?path= ────────────────────────────
  app.get('/api/research/file-meta', async (c) => {
    const reqPath = c.req.query('path');
    if (!reqPath) return c.json({ error: 'path required' }, 400);
    const absPath = path.isAbsolute(reqPath) ? reqPath : path.join(PHD_ROOT, reqPath);
    if (!isAllowedPath(absPath)) return c.json({ error: 'Path not allowed' }, 403);
    try {
      const stat = await fs.stat(absPath);
      const ext = path.extname(absPath).toLowerCase();
      return c.json({ name: path.basename(absPath), path: absPath, size: stat.size, ext, modifiedAt: stat.mtime.toISOString(), viewMode: getViewMode(ext) });
    } catch {
      return c.json({ error: 'Not found' }, 404);
    }
  });

  // ── GET /api/research/zip-contents?path= ─────────────────────────
  app.get('/api/research/zip-contents', async (c) => {
    const reqPath = c.req.query('path');
    if (!reqPath) return c.json({ error: 'path required' }, 400);
    const absPath = path.isAbsolute(reqPath) ? reqPath : path.join(PHD_ROOT, reqPath);
    if (!isAllowedPath(absPath)) return c.json({ error: 'Path not allowed' }, 403);
    const ext = path.extname(absPath).toLowerCase();
    if (ext !== '.zip') return c.json({ error: 'Only ZIP files supported' }, 400);
    // Read ZIP central directory without full extract
    try {
      const buf = await fs.readFile(absPath);
      // Simple ZIP end-of-central-directory scan
      const entries: Array<{ name: string; size: number; isDir: boolean }> = [];
      let offset = 0;
      while (offset < buf.length - 4) {
        if (buf.readUInt32LE(offset) === 0x04034b50) { // local file header
          const nameLen = buf.readUInt16LE(offset + 26);
          const extraLen = buf.readUInt16LE(offset + 28);
          const compSize = buf.readUInt32LE(offset + 18);
          const uncompSize = buf.readUInt32LE(offset + 22);
          const name = buf.slice(offset + 30, offset + 30 + nameLen).toString('utf8');
          entries.push({ name, size: uncompSize, isDir: name.endsWith('/') });
          offset += 30 + nameLen + extraLen + compSize;
        } else {
          offset++;
        }
      }
      return c.json({ entries: entries.slice(0, 200), total: entries.length });
    } catch (err) {
      return c.json({ error: `Cannot read ZIP: ${err instanceof Error ? err.message : err}` }, 500);
    }
  });
}
