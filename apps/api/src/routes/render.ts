// Remotion render + renders library — extracted from index.ts (REL-01 stage 2d).
// Handlers:
//   POST /api/render
//   POST /api/render/storyboard
//   GET  /api/render/:jobId
//   POST /api/render/preview
//   GET  /api/videos/:filename
//   GET  /api/renders
//   PUT  /api/renders/:id/archive
//   DELETE /api/renders/:id

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Hono } from 'hono';
import { renderVideo, renderPreview, listRenders, getVideoPath, archiveRender, deleteRender } from '../render.js';
import type { RenderQueueState } from '../state/render-queue.js';
import type { createLogActivity } from '../services/activity.js';
import type { AudioPlan } from '../services/render-audio.js';
export type { AudioPlan };

export interface RenderRoutesDeps {
  renderQueueState: RenderQueueState;
  muxAudioOntoVideo: (videoFilename: string, plan: AudioPlan) => Promise<{ ok: boolean; filename?: string }>;
  logActivity: ReturnType<typeof createLogActivity>;
  logger: { error: (obj: { err: unknown }, msg: string) => void };
}

export function registerRenderRoutes(app: Hono, deps: RenderRoutesDeps): void {
  const { renderQueueState, muxAudioOntoVideo, logActivity, logger } = deps;
  const { renderJobs } = renderQueueState;

  app.get('/api/render/queue/status', (c) => c.json(renderQueueState.queueStatus()));

  app.post('/api/render', async (c) => {
    const body = await c.req.json();
    const { code, width, height, fps, duration, format, startFrame, endFrame, audioPlan } = body;
    if (!code || typeof code !== 'string' || !code.trim()) {
      return c.json({ ok: false, error: 'Code is required' }, 400);
    }

    const jobId = crypto.randomUUID().slice(0, 8);
    renderJobs.set(jobId, { status: 'rendering', progress: 0 });

    (async () => {
      const progressInterval = setInterval(() => {
        const job = renderJobs.get(jobId);
        if (job && job.status === 'rendering' && job.progress < 90) {
          job.progress += 5 + Math.random() * 10;
          if (job.progress > 90) job.progress = 90;
        }
      }, 1000);

      const result = await renderVideo({
        code,
        width: width || 1080,
        height: height || 1920,
        fps: fps || 30,
        durationInFrames: duration ? duration * (fps || 30) : 150,
        outputFormat: (format === 'gif' || format === 'webm' || format === 'mp4') ? format : 'mp4',
        startFrame: typeof startFrame === 'number' ? startFrame : undefined,
        endFrame: typeof endFrame === 'number' ? endFrame : undefined,
      });

      if (result.ok && audioPlan && audioPlan.enabled && result.filename) {
        try {
          const muxed = await muxAudioOntoVideo(result.filename, audioPlan);
          if (muxed.ok) {
            renderJobs.set(jobId, {
              status: 'complete', progress: 100,
              filename: muxed.filename,
              downloadUrl: `/api/videos/${muxed.filename}`,
              durationMs: result.durationMs,
            });
            return;
          }
        } catch (e) {
          logger.error({ err: e }, 'Audio mux failed');
        }
      }

      clearInterval(progressInterval);

      if (result.ok) {
        renderJobs.set(jobId, {
          status: 'complete', progress: 100,
          filename: result.filename,
          downloadUrl: `/api/videos/${result.filename}`,
          durationMs: result.durationMs,
        });
        logActivity('system', `فيديو تم تصديره: ${result.filename}`, `المدة: ${result.durationMs}ms`, { agentId: 'creative' });
      } else {
        renderJobs.set(jobId, { status: 'failed', progress: 0, error: result.error });
      }
    })().catch((err) => { console.error({ err, jobId }, "render IIFE failed"); renderJobs.set(jobId, { status: "failed", progress: 0, error: String(err) }); });

    return c.json({ ok: true, jobId }, 202);
  });

  app.post('/api/render/storyboard', async (c) => {
    const { generateRemotionCode } = await import('../video-generator.js');
    const body = await c.req.json<{ scenes: Array<{ text: string; subtext?: string; background: string; textColor: string; fontSize?: number; transition: string; durationSeconds: number }>; width?: number; height?: number; fps?: number }>();

    if (!body.scenes || body.scenes.length === 0) return c.json({ ok: false, error: 'No scenes' }, 400);

    const w = body.width || 1080, h = body.height || 1920, fps = body.fps || 30;
    const code = generateRemotionCode({ scenes: body.scenes as any, width: w, height: h, fps });
    const totalFrames = body.scenes.reduce((sum, s) => sum + Math.round(s.durationSeconds * fps), 0);

    const jobId = crypto.randomUUID().slice(0, 8);
    renderJobs.set(jobId, { status: 'rendering', progress: 0 });

    (async () => {
      const interval = setInterval(() => { const j = renderJobs.get(jobId); if (j && j.status === 'rendering' && j.progress < 90) j.progress += 5 + Math.random() * 10; }, 1000);
      const result = await renderVideo({ code, width: w, height: h, fps, durationInFrames: totalFrames });
      clearInterval(interval);
      if (result.ok) {
        renderJobs.set(jobId, { status: 'complete', progress: 100, filename: result.filename, downloadUrl: `/api/videos/${result.filename}`, durationMs: result.durationMs });
      } else {
        renderJobs.set(jobId, { status: 'failed', progress: 0, error: result.error });
      }
    })().catch((err) => { console.error({ err, jobId }, "render IIFE failed"); renderJobs.set(jobId, { status: "failed", progress: 0, error: String(err) }); });

    return c.json({ ok: true, jobId }, 202);
  });

  app.get('/api/render/:jobId', (c) => {
    const job = renderJobs.get(c.req.param('jobId'));
    if (!job) return c.json({ error: 'Job not found' }, 404);
    return c.json(job);
  });

  app.post('/api/render/preview', async (c) => {
    const body = await c.req.json();
    const { code, width, height, fps, duration } = body;
    if (!code || typeof code !== 'string' || !code.trim()) {
      return c.json({ ok: false, error: 'Code is required' }, 400);
    }
    const result = await renderPreview({
      code,
      width: width || 1080,
      height: height || 1920,
      fps: fps || 30,
      durationInFrames: duration ? duration * (fps || 30) : 150,
    });
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, 500);
    }
    const imgPath = result.imagePath!;
    const imgData = fs.readFileSync(imgPath);
    const base64 = imgData.toString('base64');
    return c.json({
      ok: true,
      filename: result.filename,
      imageBase64: `data:image/png;base64,${base64}`,
      downloadUrl: `/api/videos/${result.filename}`,
    });
  });

  app.get('/api/videos/:filename', (c) => {
    const filename = c.req.param('filename');
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: 'Invalid filename' }, 400);
    }
    const filePath = getVideoPath(filename);
    if (!filePath) {
      return c.json({ error: 'File not found' }, 404);
    }
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filename).slice(1);
    const mimeMap: Record<string, string> = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      gif: 'image/gif',
      png: 'image/png',
    };
    c.header('Content-Type', mimeMap[ext] || 'application/octet-stream');
    c.header('Content-Disposition', `inline; filename="${filename}"`);
    return c.body(data);
  });

  app.get('/api/renders', (c) => {
    const includeArchived = c.req.query('archived') === 'true';
    const renders = listRenders().filter((r) => includeArchived || !r.archived);
    return c.json(renders);
  });

  app.put('/api/renders/:id/archive', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const ok = archiveRender(c.req.param('id'), body.archived !== false);
    if (!ok) return c.json({ error: 'Not found' }, 404);
    return c.json({ ok: true });
  });

  app.delete('/api/renders/:id', (c) => {
    const ok = deleteRender(c.req.param('id'));
    if (!ok) return c.json({ error: 'Not found' }, 404);
    return c.json({ ok: true });
  });
}
