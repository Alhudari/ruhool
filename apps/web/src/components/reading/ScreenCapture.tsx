'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Loader2,
  MonitorPlay,
  Sparkles,
  StopCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';

interface CaptureResult {
  pageAnalysis: {
    id?: string;
    pageNumber?: number;
    analysis?: {
      main_idea?: string;
      tags?: string[];
    };
  };
  session?: unknown;
  costWarning?: boolean;
}

interface CaptureRow {
  id: string; // local uuid
  pageNumber: number;
  label?: string;
  fileName?: string;
  thumbnail: string; // data url
  status: 'pending' | 'done' | 'error';
  mainIdea?: string;
  tags?: string[];
  error?: string;
}

interface ScreenCaptureProps {
  sessionId: string;
}

export function ScreenCapture({ sessionId }: ScreenCaptureProps) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thumbsEndRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [fileName, setFileName] = useState('');
  const [specialPrompt, setSpecialPrompt] = useState('');
  const [deep, setDeep] = useState(false);
  const [captures, setCaptures] = useState<CaptureRow[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [costWarning, setCostWarning] = useState(false);

  const startStream = useCallback(async () => {
    setStreamError(null);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error(isRTL
          ? 'متصفحك لا يدعم التقاط الشاشة.'
          : 'Your browser does not support screen capture.');
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStreaming(true);
      // If the user stops sharing from the browser UI.
      stream.getVideoTracks().forEach((t) => {
        t.addEventListener('ended', () => stopStream());
      });
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : 'Failed to start capture');
      setStreaming(false);
    }
  }, [isRTL]);

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreaming(false);
  }, []);

  useEffect(() => {
    // Auto-start on mount — the source page just created the session and
    // the user expects the picker immediately.
    void startStream();
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshot = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streaming) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1] ?? '';
    if (!base64) return;

    const localId = crypto.randomUUID();
    const row: CaptureRow = {
      id: localId,
      pageNumber,
      label: specialPrompt.trim() || undefined,
      fileName: fileName.trim() || undefined,
      thumbnail: dataUrl,
      status: 'pending',
    };
    setCaptures((prev) => [...prev, row]);
    setCapturing(true);

    try {
      const body: Record<string, unknown> = {
        pageNumber,
        imageBase64: base64,
        mimeType: 'image/png',
        deep,
      };
      if (fileName.trim()) body.fileName = fileName.trim();
      if (specialPrompt.trim()) body.specialPrompt = specialPrompt.trim();

      const res = await apiFetch<CaptureResult>(
        `/api/shwasha/sessions/${sessionId}/captures`,
        { method: 'POST', body: JSON.stringify(body) }
      );
      if (res.costWarning) setCostWarning(true);

      setCaptures((prev) =>
        prev.map((r) =>
          r.id === localId
            ? {
                ...r,
                status: 'done',
                mainIdea: res.pageAnalysis?.analysis?.main_idea,
                tags: res.pageAnalysis?.analysis?.tags,
              }
            : r
        )
      );
      // Auto-increment page number for the next capture.
      setPageNumber((n) => n + 1);
    } catch (e) {
      setCaptures((prev) =>
        prev.map((r) =>
          r.id === localId
            ? { ...r, status: 'error', error: e instanceof Error ? e.message : 'Capture failed' }
            : r
        )
      );
    } finally {
      setCapturing(false);
      setTimeout(() => thumbsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const finish = () => {
    stopStream();
    router.push(`/shwasha/read?session=${sessionId}`);
  };

  const capturedCount = captures.length;
  const pendingCount = useMemo(
    () => captures.filter((c) => c.status === 'pending').length,
    [captures]
  );

  return (
    <div className="flex flex-col h-full">
      {costWarning && (
        <div className="shrink-0 flex items-center gap-2 text-xs px-4 py-2 border-b border-warning/30 bg-warning/10 text-warning">
          <AlertTriangle size={14} />
          {isRTL
            ? 'تنبيه التكلفة: وضع الكاتب الكامل يكلف حوالي عشرة أضعاف الوضع الاعتيادي.'
            : 'Cost warning: full-context mode costs roughly 10× the normal mode.'}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Left — live preview + controls */}
        <div className="flex-1 min-h-0 lg:basis-[65%] lg:max-w-[65%] flex flex-col border-b lg:border-b-0 lg:border-e border-border bg-surface">
          <div className="flex-1 min-h-0 relative bg-black">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-contain"
            />
            {!streaming && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-on-surface-tertiary">
                <MonitorPlay size={28} />
                <p className="text-sm">
                  {streamError
                    ? streamError
                    : isRTL
                      ? 'اختر نافذة أو شاشة للمتابعة.'
                      : 'Pick a window or screen to continue.'}
                </p>
                <button
                  onClick={() => void startStream()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors"
                >
                  <MonitorPlay size={14} />
                  {isRTL ? 'بدء المشاركة' : 'Start sharing'}
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-border p-3 space-y-2 shrink-0 bg-surface">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-on-surface-tertiary">
                  {isRTL ? 'رقم الصفحة' : 'Page #'}
                </span>
                <input
                  type="number"
                  min={1}
                  value={pageNumber}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!Number.isNaN(n) && n > 0) setPageNumber(n);
                  }}
                  className="px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-[11px] text-on-surface-tertiary">
                  {isRTL ? 'اسم الملف (اختياري)' : 'File name (optional)'}
                </span>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder={isRTL ? 'مثلاً: chapter-3.pdf' : 'e.g. chapter-3.pdf'}
                  className="px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-on-surface-tertiary">
                {isRTL ? 'توجيه خاص (اختياري)' : 'Special prompt (optional)'}
              </span>
              <input
                type="text"
                value={specialPrompt}
                onChange={(e) => setSpecialPrompt(e.target.value)}
                dir="auto"
                placeholder={isRTL
                  ? 'مثلاً: ركّز على المعادلات والأرقام'
                  : 'e.g. focus on equations and figures'}
                className="px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <label
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-[var(--radius)] cursor-pointer border transition-colors',
                  deep
                    ? 'bg-accent/10 text-accent border-accent/40'
                    : 'bg-surface-secondary text-on-surface-secondary border-border'
                )}
                title={isRTL ? 'استخدم نموذج Opus الأقوى' : 'Use the stronger Opus model'}
              >
                <input
                  type="checkbox"
                  checked={deep}
                  onChange={(e) => setDeep(e.target.checked)}
                  className="hidden"
                />
                <Sparkles size={10} />
                {isRTL ? 'تحليل عميق' : 'Deep'}
              </label>

              <button
                onClick={snapshot}
                disabled={!streaming || capturing}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {capturing ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                {isRTL ? 'التقاط' : 'Capture'}
              </button>

              {streaming && (
                <button
                  onClick={stopStream}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius)] text-sm bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary transition-colors"
                >
                  <StopCircle size={14} />
                  {isRTL ? 'إيقاف المشاركة' : 'Stop sharing'}
                </button>
              )}

              <button
                onClick={finish}
                disabled={capturedCount === 0 || pendingCount > 0}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius)] text-sm transition-colors',
                  'bg-success/10 text-success hover:bg-success/20 border border-success/30',
                  'disabled:opacity-50 ms-auto'
                )}
              >
                {isRTL ? 'إنهاء والمراجعة' : 'Finish & review'}
                <ArrowRight size={14} className={isRTL ? 'rotate-180' : ''} />
              </button>
            </div>
          </div>
        </div>

        {/* Right — thumbnails + analyses */}
        <div className="flex-1 min-h-0 lg:basis-[35%] lg:max-w-[35%] bg-surface-secondary/30 flex flex-col">
          <div className="px-4 py-2 border-b border-border shrink-0 flex items-center justify-between">
            <p className="text-xs font-medium text-on-surface-secondary">
              {isRTL ? `التقاطات — ${capturedCount}` : `Captures — ${capturedCount}`}
            </p>
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-on-surface-tertiary">
                <Loader2 size={10} className="animate-spin" />
                {isRTL ? `${pendingCount} قيد التحليل` : `${pendingCount} analyzing`}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-2">
            {captures.length === 0 && (
              <div className="text-center text-xs text-on-surface-tertiary py-8">
                {isRTL
                  ? 'لا توجد التقاطات بعد. اضغط "التقاط" لبدء التحليل.'
                  : 'No captures yet. Press "Capture" to analyze a frame.'}
              </div>
            )}
            {captures.map((c) => (
              <div
                key={c.id}
                className="rounded-[var(--radius-lg)] border border-border bg-surface p-2 flex gap-2"
              >
                <img
                  src={c.thumbnail}
                  alt={`Page ${c.pageNumber}`}
                  className="w-20 h-14 object-cover rounded-[var(--radius)] border border-border shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-surface-secondary text-on-surface-secondary">
                      p{c.pageNumber}
                    </span>
                    {c.fileName && (
                      <span className="text-[11px] text-on-surface-tertiary truncate" dir="auto">
                        {c.fileName}
                      </span>
                    )}
                  </div>
                  {c.status === 'pending' && (
                    <div className="mt-1 space-y-1 animate-pulse">
                      <div className="h-2 rounded bg-surface-tertiary w-5/6" />
                      <div className="h-2 rounded bg-surface-tertiary w-3/4" />
                    </div>
                  )}
                  {c.status === 'done' && (
                    <>
                      {c.mainIdea && (
                        <p className="text-xs text-on-surface mt-1 line-clamp-3" dir="auto">
                          {c.mainIdea}
                        </p>
                      )}
                      {c.tags && c.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.tags.slice(0, 4).map((t) => (
                            <span
                              key={t}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {c.status === 'error' && (
                    <p className="text-xs text-error mt-1">{c.error}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={thumbsEndRef} />
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
