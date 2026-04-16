// Library batch operations + per-scene splice — extracted from index.ts (REL-01 stage 2d).
// Handlers:
//   POST /api/library/export-zip
//   POST /api/library/rerender-batch
//   GET  /api/library/rerender-status/:jobId
//   POST /api/creative/splice-scene

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Hono } from 'hono';
import type { RenderQueueState } from '../state/render-queue.js';

export interface LibraryRerenderDeps {
  videosDir: string;
  renderQueueState: RenderQueueState;
  logger: { error: (obj: { err: unknown }, msg: string) => void };
}

export function registerLibraryRerenderRoutes(app: Hono, deps: LibraryRerenderDeps): void {
  const { videosDir, renderQueueState, logger } = deps;
  const { rerenderJobs } = renderQueueState;

  app.post('/api/library/export-zip', async (c) => {
    const body = await c.req.json<{ filenames: string[] }>();
    if (!Array.isArray(body.filenames) || body.filenames.length === 0) {
      return c.json({ error: 'No filenames provided' }, 400);
    }
    const metaFile = path.join(videosDir, '_renders.json');
    const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf-8')) as Array<Record<string, unknown>> : [];
    const selectedMeta = body.filenames.map((fn) => meta.find((m) => m.filename === fn)).filter(Boolean);

    const archiverMod = (await import('archiver')).default;
    const { PassThrough } = await import('node:stream');
    const pass = new PassThrough();
    const zip = archiverMod('zip', { zlib: { level: 6 } });
    zip.pipe(pass);

    let appended = 0;
    for (const fn of body.filenames) {
      const full = path.join(videosDir, fn);
      if (fs.existsSync(full)) { zip.file(full, { name: fn }); appended++; }
    }
    zip.append(JSON.stringify({ exportedAt: new Date().toISOString(), files: selectedMeta }, null, 2), { name: 'metadata.json' });
    zip.finalize();

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const downloadName = `ruhool-library-${stamp}.zip`;
    return new Response(pass as unknown as ReadableStream, {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${downloadName}"`,
        'x-items-count': String(appended),
      },
    });
  });

  app.post('/api/library/rerender-batch', async (c) => {
    const body = await c.req.json<{ filenames: string[] }>();
    if (!Array.isArray(body.filenames) || body.filenames.length === 0) {
      return c.json({ error: 'No filenames provided' }, 400);
    }
    const metaFile = path.join(videosDir, '_renders.json');
    const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf-8')) as Array<Record<string, unknown>> : [];

    const jobId = crypto.randomUUID().slice(0, 10);
    rerenderJobs.set(jobId, { total: body.filenames.length, done: 0, current: null, status: 'queued', results: [], startedAt: new Date().toISOString() });

    (async () => {
      const job = rerenderJobs.get(jobId)!;
      job.status = 'running';
      const { exec } = await import('node:child_process');
      const execAsync = (await import('node:util')).promisify(exec);
      for (const fn of body.filenames) {
        job.current = fn;
        const info = meta.find((m) => m.filename === fn);
        const src = path.join(videosDir, fn);
        if (!fs.existsSync(src)) {
          job.results.push({ filename: fn, ok: false, error: 'File not found' });
          job.done++;
          continue;
        }
        const outName = `rerender-${crypto.randomUUID().slice(0, 8)}.mp4`;
        const out = path.join(videosDir, outName);
        try {
          await execAsync(`ffmpeg -y -i "${src}" -c:v libx264 -preset veryfast -crf 20 -c:a aac -movflags +faststart "${out}"`, { timeout: 600_000 });
          meta.unshift({
            id: outName.replace(/\.mp4$/, ''), filename: outName, format: 'mp4',
            width: info?.width || 1920, height: info?.height || 1080, fps: info?.fps || 30,
            renderedAt: new Date().toISOString(), sizeBytes: fs.statSync(out).size,
            source: 'rerender', title: `Re-render of ${fn}`, parentFilename: fn,
          });
          fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
          job.results.push({ filename: fn, ok: true });
        } catch (err) {
          job.results.push({ filename: fn, ok: false, error: err instanceof Error ? err.message : 'Render failed' });
        }
        job.done++;
      }
      job.current = null;
      job.status = 'completed';
    })().catch((err) => {
      const j = rerenderJobs.get(jobId);
      if (j) { j.status = 'failed'; j.current = null; }
      logger.error({ err }, '[rerender-batch] failed');
    });

    return c.json({ jobId, total: body.filenames.length });
  });

  app.get('/api/library/rerender-status/:jobId', (c) => {
    const job = rerenderJobs.get(c.req.param('jobId'));
    if (!job) return c.json({ error: 'Job not found' }, 404);
    return c.json(job);
  });

  app.post('/api/creative/splice-scene', async (c) => {
    const body = await c.req.json<{
      originalFilename: string;
      sceneStartSec: number;
      sceneEndSec: number;
      replacementFilename: string;
      outputFilename?: string;
    }>();
    if (!body.originalFilename || !body.replacementFilename) {
      return c.json({ error: 'Missing filenames' }, 400);
    }
    if (!(body.sceneEndSec > body.sceneStartSec) || body.sceneStartSec < 0) {
      return c.json({ error: 'Invalid scene range' }, 400);
    }
    const orig = path.join(videosDir, body.originalFilename);
    const repl = path.join(videosDir, body.replacementFilename);
    if (!fs.existsSync(orig) || !fs.existsSync(repl)) {
      return c.json({ error: 'File not found', orig: fs.existsSync(orig), repl: fs.existsSync(repl) }, 404);
    }
    const outName = body.outputFilename || `spliced-${Date.now()}.mp4`;
    const outPath = path.join(videosDir, outName);
    const workDir = path.join(videosDir, '.splice-' + crypto.randomUUID().slice(0, 8));
    fs.mkdirSync(workDir, { recursive: true });
    const prePath = path.join(workDir, 'pre.mp4');
    const postPath = path.join(workDir, 'post.mp4');
    const listPath = path.join(workDir, 'list.txt');

    const { exec } = await import('node:child_process');
    const execAsync = (await import('node:util')).promisify(exec);

    let origDurationSec = 0;
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=nokey=1:noprint_wrappers=1 "${orig}"`
      );
      origDurationSec = parseFloat(stdout.trim()) || 0;
    } catch {
      /* continue */
    }

    try {
      const parts: string[] = [];
      if (body.sceneStartSec > 0.05) {
        await execAsync(
          `ffmpeg -y -ss 0 -to ${body.sceneStartSec.toFixed(3)} -i "${orig}" -c copy -avoid_negative_ts make_zero "${prePath}"`,
          { timeout: 180_000 }
        );
        parts.push(prePath);
      }
      const normalizedRepl = path.join(workDir, 'repl.mp4');
      await execAsync(
        `ffmpeg -y -i "${repl}" -c:v libx264 -preset veryfast -crf 20 -c:a aac -movflags +faststart "${normalizedRepl}"`,
        { timeout: 300_000 }
      );
      parts.push(normalizedRepl);
      if (!origDurationSec || body.sceneEndSec < origDurationSec - 0.05) {
        await execAsync(
          `ffmpeg -y -ss ${body.sceneEndSec.toFixed(3)} -i "${orig}" -c copy -avoid_negative_ts make_zero "${postPath}"`,
          { timeout: 180_000 }
        );
        parts.push(postPath);
      }
      const normParts: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const n = path.join(workDir, `p${i}.mp4`);
        await execAsync(
          `ffmpeg -y -i "${p}" -c:v libx264 -preset veryfast -crf 20 -c:a aac -ar 48000 -movflags +faststart "${n}"`,
          { timeout: 300_000 }
        );
        normParts.push(n);
      }
      fs.writeFileSync(listPath, normParts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
      await execAsync(
        `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outPath}"`,
        { timeout: 300_000 }
      );

      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
      return c.json({ ok: true, filename: outName, partsJoined: normParts.length });
    } catch (err: unknown) {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
      return c.json({ error: err instanceof Error ? err.message : 'Splice failed' }, 500);
    }
  });
}
