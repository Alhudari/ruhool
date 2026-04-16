// Studio Demo Library + one-click render — extracted from index.ts (REL-01 stage 2d).
// Handlers:
//   GET    /api/studio/demos
//   POST   /api/studio/demos/render-all
//   GET    /api/studio/demos/render-all/:batchId
//   GET    /api/studio/demos/:name
//   GET    /api/studio/demos/:name/preflight
//   POST   /api/studio/demos/:name/render

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Hono } from 'hono';
import type { AudioPlan, CostLine } from '../services/render-audio.js';
import type { RenderQueueState } from '../state/render-queue.js';
import type { CapabilityResult } from '../services/capability-checkers.js';

export interface StudioDemoMeta {
  name: string;
  tool: string;
  description: string;
  topic: string;
  durationSeconds: number;
  isNew?: boolean;
  autoAudio?: 'elevenlabs-tts' | 'stable-audio-music' | 'elevenlabs-sfx' | 'platform-intro';
}

export interface DemoBatchJob {
  status: 'running' | 'complete' | 'failed';
  total: number;
  completed: number;
  current?: string;
  results: Array<{ name: string; ok: boolean; filename?: string; error?: string }>;
  startedAt: string;
  finishedAt?: string;
}

export interface StudioDemosDeps {
  demosDir: string;
  videosDir: string;
  studioDemos: StudioDemoMeta[];
  demoRequirements: Record<string, { keyField: string; capability: string; serviceName: string; signupUrl: string }>;
  demoMapCost: Record<string, { service: string; cost: number } | undefined>;
  getApiKey: (field: string) => string | undefined;
  capabilityCheckers: Record<string, (key: string) => Promise<Record<string, CapabilityResult>>>;
  renderVideo: (opts: {
    code: string;
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
    source: string;
    tool: string;
    title: string;
    description: string;
  }) => Promise<{ ok: boolean; filename?: string; error?: string; durationMs?: number }>;
  listRenders: () => Array<{ source?: string; tool?: string; archived?: boolean; filename: string }>;
  muxAudioOntoVideo: (videoFilename: string, plan: AudioPlan) => Promise<{ ok: boolean; filename?: string }>;
  attachCostToRender: (filename: string, costLines: CostLine[]) => void;
  renderQueueState: RenderQueueState;
  logActivity: (agent: string, summary: string, conversationId?: string, meta?: { agentId?: string }) => void;
}

export function registerStudioDemosRoutes(app: Hono, deps: StudioDemosDeps): void {
  const {
    demosDir, videosDir, studioDemos, demoRequirements, demoMapCost,
    getApiKey, capabilityCheckers, renderVideo, listRenders,
    muxAudioOntoVideo, attachCostToRender, renderQueueState, logActivity,
  } = deps;
  const { renderJobs } = renderQueueState;

  app.get('/api/studio/demos', (c) => {
    return c.json({ demos: studioDemos });
  });

  const demoBatchJobs = new Map<string, DemoBatchJob>();

  app.post('/api/studio/demos/render-all', async (c) => {
    const body = await c.req.json().catch(() => ({})) as { force?: boolean };
    const force = !!body.force;
    const batchId = crypto.randomUUID().slice(0, 8);
    const job: DemoBatchJob = {
      status: 'running',
      total: studioDemos.length,
      completed: 0,
      results: [],
      startedAt: new Date().toISOString(),
    };
    demoBatchJobs.set(batchId, job);

    (async () => {
      try {
        for (const demo of studioDemos) {
          job.current = demo.name;

          if (!force) {
            const existing = listRenders().find(
              (r) => r.source === 'demo' && r.tool === demo.tool && !r.archived
            );
            if (existing) {
              job.results.push({ name: demo.name, ok: true, filename: existing.filename });
              job.completed++;
              continue;
            }
          }

          const filePath = path.join(demosDir, `${demo.name}.tsx`);
          if (!fs.existsSync(filePath)) {
            job.results.push({ name: demo.name, ok: false, error: 'File missing' });
            job.completed++;
            continue;
          }
          const code = fs.readFileSync(filePath, 'utf-8');
          const fps = 30;
          const result = await renderVideo({
            code,
            width: 1080,
            height: 1920,
            fps,
            durationInFrames: Math.round(demo.durationSeconds * fps),
            source: 'demo',
            tool: demo.tool,
            title: demo.topic,
            description: demo.description,
          });
          job.results.push({ name: demo.name, ok: result.ok, filename: result.filename, error: result.error });
          job.completed++;
        }
        job.status = 'complete';
        job.finishedAt = new Date().toISOString();
        logActivity('system', `عرض توضيحي: اكتمل تصيير ${job.completed}/${job.total}`, undefined, { agentId: 'creative' });
      } catch (err) {
        job.status = 'failed';
        job.finishedAt = new Date().toISOString();
        job.results.push({ name: job.current || '', ok: false, error: err instanceof Error ? err.message : 'Batch failed' });
      }
    })();

    return c.json({ ok: true, batchId }, 202);
  });

  app.get('/api/studio/demos/render-all/:batchId', (c) => {
    const job = demoBatchJobs.get(c.req.param('batchId'));
    if (!job) return c.json({ error: 'Batch not found' }, 404);
    return c.json(job);
  });

  app.get('/api/studio/demos/:name', (c) => {
    const name = c.req.param('name');
    const meta = studioDemos.find((d) => d.name === name);
    if (!meta) return c.json({ error: 'Demo not found' }, 404);
    const filePath = path.join(demosDir, `${name}.tsx`);
    if (!fs.existsSync(filePath)) return c.json({ error: 'File missing' }, 404);
    let code = fs.readFileSync(filePath, 'utf-8');
    const subs: Record<string, string> = {
      __MAPBOX_TOKEN__: getApiKey('mapboxToken') || '',
      __MAPTILER_KEY__: getApiKey('maptilerKey') || '',
      __GEOAPIFY_KEY__: getApiKey('geoapifyKey') || '',
      __THUNDERFOREST_KEY__: getApiKey('thunderforestKey') || '',
      __LUMA_KEY__: getApiKey('lumaApiKey') || '',
    };
    for (const [ph, val] of Object.entries(subs)) {
      if (code.includes(ph)) code = code.replaceAll(ph, val);
    }
    const missingKeys: string[] = [];
    if (/__[A-Z_]+__/.test(code)) {
      const m = code.match(/__([A-Z_]+)__/);
      if (m) missingKeys.push(m[1]);
    }
    return c.json({ name, code, tool: meta.tool, description: meta.description, topic: meta.topic, durationSeconds: meta.durationSeconds, missingKeys });
  });

  app.get('/api/studio/demos/:name/preflight', async (c) => {
    const name = c.req.param('name');
    const req = demoRequirements[name];
    if (!req) return c.json({ ok: true, message: 'No external service required' });

    const key = getApiKey(req.keyField);
    if (!key) {
      return c.json({
        ok: false,
        reason: 'missing_key',
        service: req.serviceName,
        field: req.keyField,
        signupUrl: req.signupUrl,
        message: `Missing API key for ${req.serviceName}`,
      });
    }

    const checker = capabilityCheckers[req.keyField];
    if (!checker) return c.json({ ok: true, message: 'Key present (no checker)' });
    const caps = await checker(key);
    const cap = caps[req.capability];
    if (!cap || !cap.ok) {
      return c.json({
        ok: false,
        reason: 'capability_disabled',
        service: req.serviceName,
        field: req.keyField,
        signupUrl: req.signupUrl,
        message: cap?.message || 'Capability not available',
        capabilities: caps,
      });
    }
    return c.json({ ok: true, message: `${req.serviceName} ready`, capabilities: caps });
  });

  app.post('/api/studio/demos/:name/render', async (c) => {
    const name = c.req.param('name');
    const meta = studioDemos.find((d) => d.name === name);
    if (!meta) return c.json({ error: 'Demo not found' }, 404);
    const filePath = path.join(demosDir, `${name}.tsx`);
    if (!fs.existsSync(filePath)) return c.json({ error: 'File missing' }, 404);

    const req = demoRequirements[name];
    if (req) {
      const key = getApiKey(req.keyField);
      if (!key) {
        return c.json({ ok: false, error: `Missing key for ${req.serviceName}`, reason: 'missing_key', signupUrl: req.signupUrl }, 400);
      }
      const checker = capabilityCheckers[req.keyField];
      if (checker) {
        const caps = await checker(key);
        const cap = caps[req.capability];
        if (!cap?.ok) {
          return c.json({
            ok: false,
            error: `${req.serviceName} not available: ${cap?.message || 'capability disabled'}`,
            reason: 'capability_disabled',
            service: req.serviceName,
            signupUrl: req.signupUrl,
            capabilities: caps,
          }, 400);
        }
      }
    }

    let code = fs.readFileSync(filePath, 'utf-8');
    const subs: Record<string, string> = {
      __MAPBOX_TOKEN__: getApiKey('mapboxToken') || '',
      __MAPTILER_KEY__: getApiKey('maptilerKey') || '',
      __GEOAPIFY_KEY__: getApiKey('geoapifyKey') || '',
      __THUNDERFOREST_KEY__: getApiKey('thunderforestKey') || '',
      __LUMA_KEY__: getApiKey('lumaApiKey') || '',
    };
    for (const [ph, val] of Object.entries(subs)) {
      if (code.includes(ph)) code = code.replaceAll(ph, val);
    }

    let audioPlan: AudioPlan | undefined;
    if (meta.autoAudio === 'elevenlabs-tts') {
      audioPlan = {
        enabled: true, backend: 'elevenlabs',
        segments: [{
          startSec: 1, endSec: meta.durationSeconds,
          kind: 'voice',
          text: 'السلام عليكم، هذا مثال على التعليق الصوتي العربي الذي يولّد تلقائياً من نص مكتوب',
          volume: 1.0,
        }],
      };
    } else if (meta.autoAudio === 'stable-audio-music') {
      audioPlan = {
        enabled: true, backend: 'stableaudio',
        segments: [{
          startSec: 0, endSec: meta.durationSeconds,
          kind: 'music',
          text: 'calm arabic oud music with light percussion, cinematic',
          volume: 0.8,
        }],
      };
    } else if (meta.autoAudio === 'platform-intro') {
      audioPlan = {
        enabled: true, backend: 'elevenlabs',
        segments: [
          { startSec: 0.5, endSec: 5,  kind: 'voice', text: 'مرحباً بك في منصة رحول', volume: 1.0 },
          { startSec: 5.5, endSec: 11, kind: 'voice', text: 'نصنع خرائط حقيقية بتفاصيل دقيقة', volume: 1.0 },
          { startSec: 11.5, endSec: 17, kind: 'voice', text: 'ونستخدم نماذج BIM بكل تفاصيلها الهندسية', volume: 1.0 },
          { startSec: 17.5, endSec: 23, kind: 'voice', text: 'مع تعليق صوتي وموسيقى تُولّد بالذكاء الاصطناعي', volume: 1.0 },
          { startSec: 23.5, endSec: 27, kind: 'voice', text: 'وبيانات تفاعلية بتصميم سينمائي', volume: 1.0 },
          { startSec: 27.5, endSec: 30, kind: 'voice', text: 'رحول. أبدع بلا حدود', volume: 1.0 },
          { startSec: 0,    endSec: 30, kind: 'music', text: 'cinematic uplifting electronic music with subtle arabic percussion, modern and inspiring, building up', volume: 0.25 },
        ],
      };
    } else if (meta.autoAudio === 'elevenlabs-sfx') {
      audioPlan = {
        enabled: true, backend: 'elevenlabs',
        segments: [{
          startSec: 0, endSec: Math.min(5, meta.durationSeconds),
          kind: 'sfx',
          text: 'whoosh transition sound',
          volume: 1.0,
        }],
      };
    }

    const jobId = crypto.randomUUID().slice(0, 8);
    const fps = 30;
    renderJobs.set(jobId, { status: 'rendering', progress: 0 });

    (async () => {
      const interval = setInterval(() => {
        const j = renderJobs.get(jobId);
        if (j && j.status === 'rendering' && j.progress < 90) j.progress += 5 + Math.random() * 10;
      }, 1000);

      const result = await renderVideo({
        code, width: 1080, height: 1920, fps,
        durationInFrames: meta.durationSeconds * fps,
        source: 'demo', tool: meta.tool, title: meta.topic, description: meta.description,
      });
      clearInterval(interval);

      if (!result.ok) {
        renderJobs.set(jobId, { status: 'failed', progress: 0, error: result.error });
        return;
      }

      const mapCost = demoMapCost[name];
      const preMapCostLines: CostLine[] = mapCost && mapCost.cost > 0
        ? [{ service: mapCost.service, units: 1, unitName: 'request', usd: mapCost.cost }]
        : [];

      if (audioPlan && result.filename) {
        const muxed = await muxAudioOntoVideo(result.filename, audioPlan);
        if (muxed.ok && muxed.filename) {
          if (preMapCostLines.length > 0) {
            const metaFile = path.join(videosDir, '_renders.json');
            try {
              const arr = JSON.parse(fs.readFileSync(metaFile, 'utf-8')) as Array<Record<string, unknown>>;
              const idx = arr.findIndex((e) => e.filename === muxed.filename);
              if (idx !== -1) {
                const existing = (arr[idx].costLines as CostLine[]) || [];
                const merged = [...existing, ...preMapCostLines];
                arr[idx].costLines = merged;
                arr[idx].costUSD = merged.reduce((s, l) => s + l.usd, 0);
                fs.writeFileSync(metaFile, JSON.stringify(arr, null, 2));
              }
            } catch { /* ignore */ }
          }
          renderJobs.set(jobId, { status: 'complete', progress: 100, filename: muxed.filename, downloadUrl: `/api/videos/${muxed.filename}`, durationMs: result.durationMs });
          return;
        }
      }

      if (result.filename && preMapCostLines.length > 0) {
        attachCostToRender(result.filename, preMapCostLines);
      }
      renderJobs.set(jobId, { status: 'complete', progress: 100, filename: result.filename, downloadUrl: `/api/videos/${result.filename}`, durationMs: result.durationMs });
    })();

    return c.json({ ok: true, jobId }, 202);
  });
}
