'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Play, Sparkles, RotateCw } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Demo {
  name: string;
  tool: string;
  description: string;
  topic: string;
  durationSeconds: number;
  isNew?: boolean;
}

interface JobState {
  status: 'idle' | 'rendering' | 'complete' | 'failed';
  progress: number;
  videoUrl?: string;
  error?: string;
}

interface RenderMeta {
  id: string;
  filename: string;
  source?: string;
  tool?: string;
  title?: string;
  archived?: boolean;
}

interface BatchState {
  status: 'running' | 'complete' | 'failed';
  total: number;
  completed: number;
  current?: string;
}

export function DemosGallery() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobState>>({});
  const [loading, setLoading] = useState(true);
  const [existingByTool, setExistingByTool] = useState<Record<string, string>>({});
  const [batch, setBatch] = useState<BatchState | null>(null);

  const loadRenders = useCallback(async () => {
    try {
      const renders: RenderMeta[] = await fetch(`${API_BASE}/api/renders`).then((r) => r.json());
      const map: Record<string, string> = {};
      for (const r of renders) {
        if (r.source === 'demo' && r.tool && !r.archived) {
          // Keep the most recent (listRenders returns newest-first)
          if (!map[r.tool]) map[r.tool] = `${API_BASE}/api/videos/${r.filename}`;
        }
      }
      setExistingByTool(map);
    } catch {
      setExistingByTool({});
    }
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/studio/demos`)
      .then((r) => r.json())
      .then((d) => {
        setDemos(d.demos || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    loadRenders();
  }, [loadRenders]);

  const renderDemo = async (demo: Demo) => {
    setJobs((j) => ({ ...j, [demo.name]: { status: 'rendering', progress: 0 } }));

    try {
      const fileRes = await fetch(`${API_BASE}/api/studio/demos/${demo.name}`).then((r) => r.json());
      if (!fileRes.code) throw new Error('Could not read demo file');

      const renderRes = await fetch(`${API_BASE}/api/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: fileRes.code,
          width: 1080,
          height: 1920,
          fps: 30,
          duration: demo.durationSeconds,
          format: 'mp4',
        }),
      }).then((r) => r.json());

      if (!renderRes.ok) throw new Error(renderRes.error || 'Render failed');

      const poll = setInterval(async () => {
        const status = await fetch(`${API_BASE}/api/render/${renderRes.jobId}`).then((r) => r.json());
        setJobs((j) => ({
          ...j,
          [demo.name]: {
            status: status.status,
            progress: status.progress || 0,
            videoUrl: status.downloadUrl ? `${API_BASE}${status.downloadUrl}` : undefined,
            error: status.error,
          },
        }));
        if (status.status === 'complete' || status.status === 'failed') {
          clearInterval(poll);
          loadRenders();
        }
      }, 1500);
    } catch (err) {
      setJobs((j) => ({
        ...j,
        [demo.name]: { status: 'failed', progress: 0, error: err instanceof Error ? err.message : 'Error' },
      }));
    }
  };

  const renderAll = async (force = false) => {
    try {
      const res = await fetch(`${API_BASE}/api/studio/demos/render-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || 'Batch failed');

      setBatch({ status: 'running', total: demos.length, completed: 0 });
      const poll = setInterval(async () => {
        const status: BatchState = await fetch(`${API_BASE}/api/studio/demos/render-all/${res.batchId}`).then((r) => r.json());
        setBatch(status);
        if (status.status === 'complete' || status.status === 'failed') {
          clearInterval(poll);
          loadRenders();
        }
      }, 2000);
    } catch (err) {
      setBatch({ status: 'failed', total: demos.length, completed: 0, current: err instanceof Error ? err.message : 'Error' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  const missingCount = demos.filter((d) => !existingByTool[d.tool]).length;
  const batchRunning = batch?.status === 'running';

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'IBM Plex Sans Arabic, sans-serif' }}>
            مكتبة العروض التوضيحية
          </h1>
          <p className="text-zinc-400" style={{ fontFamily: 'IBM Plex Sans Arabic, sans-serif' }}>
            عروض قصيرة لكل أداة Remotion متوفرة في الاستوديو
          </p>
        </div>
        <div className="flex gap-2">
          {missingCount > 0 && (
            <button
              onClick={() => renderAll(false)}
              disabled={batchRunning}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold py-2 px-4 rounded-lg flex items-center gap-2 text-sm"
              style={{ fontFamily: 'IBM Plex Sans Arabic, sans-serif' }}
            >
              {batchRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {batchRunning
                ? `تصيير ${batch?.completed ?? 0}/${batch?.total ?? demos.length}…`
                : `تصيير الكل (${missingCount})`}
            </button>
          )}
          <button
            onClick={() => renderAll(true)}
            disabled={batchRunning}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 text-sm"
            style={{ fontFamily: 'IBM Plex Sans Arabic, sans-serif' }}
            title="إعادة تصيير الكل"
          >
            <RotateCw className="w-4 h-4" />
            إعادة التصيير
          </button>
        </div>
      </div>

      {batch && (
        <div className="mb-8 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-sm mb-2" style={{ fontFamily: 'IBM Plex Sans Arabic, sans-serif' }}>
            <span className="text-zinc-300">
              {batch.status === 'running' && `جاري التصيير: ${batch.current || ''}`}
              {batch.status === 'complete' && 'اكتمل التصيير ✓'}
              {batch.status === 'failed' && `فشل: ${batch.current || ''}`}
            </span>
            <span className="text-zinc-500 font-mono">
              {batch.completed}/{batch.total}
            </span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${batch.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`}
              style={{ width: `${(batch.completed / Math.max(batch.total, 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {demos.map((demo) => {
          const job = jobs[demo.name];
          const rendering = job?.status === 'rendering';
          const jobComplete = job?.status === 'complete';
          const failed = job?.status === 'failed';
          const existingUrl = existingByTool[demo.tool];
          const videoUrl = job?.videoUrl || existingUrl;
          const hasVideo = !!videoUrl;

          return (
            <div
              key={demo.name}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-3 hover:border-amber-500/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <span className="text-xs font-mono bg-zinc-800 text-amber-400 px-2 py-1 rounded">{demo.tool}</span>
                <div className="flex items-center gap-2">
                  {demo.isNew && (
                    <span
                      className="text-[10px] font-bold bg-gradient-to-r from-emerald-400 to-teal-400 text-black px-2 py-0.5 rounded-full tracking-wide"
                      style={{ fontFamily: 'IBM Plex Sans Arabic, sans-serif' }}
                    >
                      جديد
                    </span>
                  )}
                  <span className="text-xs text-zinc-500">{demo.durationSeconds}s</span>
                </div>
              </div>
              <h3
                className="text-xl font-bold text-white"
                style={{ fontFamily: 'IBM Plex Sans Arabic, sans-serif', direction: 'rtl' }}
              >
                {demo.topic}
              </h3>
              <p className="text-sm text-zinc-400 flex-1">{demo.description}</p>

              {hasVideo && <video src={videoUrl} controls className="w-full rounded-lg bg-black" />}
              {failed && <p className="text-xs text-red-400">{job?.error}</p>}
              {rendering && (
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 transition-all" style={{ width: `${job?.progress || 0}%` }} />
                </div>
              )}

              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => renderDemo(demo)}
                  disabled={rendering || batchRunning}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 text-sm"
                  style={{ fontFamily: 'IBM Plex Sans Arabic, sans-serif' }}
                >
                  {rendering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {Math.round(job?.progress || 0)}%
                    </>
                  ) : jobComplete || existingUrl ? (
                    <>
                      <Play className="w-4 h-4" /> إعادة التصدير
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" /> تصدير
                    </>
                  )}
                </button>
                {hasVideo && (
                  <a
                    href={videoUrl}
                    download
                    className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
