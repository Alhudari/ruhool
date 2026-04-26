'use client';

/**
 * Al-Mulakhkhis Screen Capture (reading mode).
 *
 * autoDetect contract (do NOT break this without updating the API):
 * - When `autoDetect` is true, the user does not enter a page number — the
 *   vision model reads it off the page (footer/header/margin). The server's
 *   `/captures` endpoint returns `detected.pageNumber` and may return 422 with
 *   `{ error, detectedTitle }` when no number could be read. The UI must show
 *   that 422 as a graceful prompt, not a fatal error.
 * - When `autoDetect` is false, a manual `pageNumber >= 1` is required.
 * - The auto-increment of `pageNumber` after a successful capture prefers the
 *   server-confirmed `detected.pageNumber + 1` over a blind `n + 1`.
 *
 * Cost profile (Sonnet 4.6 vision @ 4000 maxTokens):
 * - Per-capture upper bound ≈ input ~1500 tokens (1080p PNG) + output ~3000
 *   = $0.0045 + $0.045 = ~$0.05 per capture in the worst case.
 * - Typical mid-density academic page ≈ $0.02–0.03.
 * - The soft cost threshold ($0.50/session) shows a banner; the user can keep
 *   capturing past it. Hard mode (deep=true) routes to Opus 4.7 → ~5× cost.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  DollarSign,
  Loader2,
  MonitorPlay,
  Pause,
  Play,
  ScanText,
  Sparkles,
  StopCircle,
  X,
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
  session?: { paperTitle?: string };
  costWarning?: boolean;
  detected?: {
    pageNumber: number | null;
    sourceTitle: string | null;
    pages: number[] | null;
  };
  cost?: {
    usd: number;
    sessionUsd: number;
    inputTokens: number;
    outputTokens: number;
    thresholdCrossed: boolean;
  };
  suggestedFileName?: string | null;
}

interface CaptureRow {
  id: string;
  /** Server-side PageAnalysisRecord id — populated when status='done'.
   *  Used by the ConfirmBar to PATCH /analyses/:id/correct. */
  analysisId?: string;
  pageNumber: number;
  pages?: number[]; // when a spread, both detected pages
  label?: string;
  fileName?: string;
  thumbnail: string;
  status: 'pending' | 'done' | 'error';
  mainIdea?: string;
  tags?: string[];
  detectedTitle?: string | null;
  costUsd?: number;
  error?: string;
  // Pre-commit confirm bar — until cleared, the user can correct page/title.
  needsConfirm?: boolean;
  /** Async error from the correction PATCH, shown inline under the bar. */
  confirmError?: string;
  /** OCR fallback state — set when the user runs Tesseract on a row whose
   *  vision result was empty. */
  ocrRunning?: boolean;
  ocrError?: string;
}

interface ScreenCaptureProps {
  sessionId: string;
}

// Continuous mode: poll interval and frame-hash window. The hash is a coarse
// 8×8 luma sample of the canvas — enough to skip identical frames while the
// user reads, without pulling in a perceptual-hash dep.
const CONTINUOUS_INTERVAL_MS = 8000;
const FRAME_HASH_GRID = 8;

export function ScreenCapture({ sessionId }: ScreenCaptureProps) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thumbsEndRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Synchronous in-flight guard — checked at the top of snapshot() so a second
  // click (or a continuous-mode tick) cannot race the first request.
  const inFlightRef = useRef(false);
  // Last captured frame hash so continuous mode can skip identical frames.
  const lastHashRef = useRef<string | null>(null);
  const continuousTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Latest "any row needs confirmation" — read by the continuous-mode tick
  // so it can pause itself without re-creating the timer on every render.
  const hasPendingConfirmRef = useRef(false);
  // AbortController for the active /captures fetch. Stopping the share or
  // toggling continuous off mid-flight should cancel the upstream call so
  // the user isn't billed for an analysis they discarded.
  const captureAbortRef = useRef<AbortController | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [fileName, setFileName] = useState('');
  const [autoDetect, setAutoDetect] = useState(true);
  const [specialPrompt, setSpecialPrompt] = useState('');
  const [deep, setDeep] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [captures, setCaptures] = useState<CaptureRow[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [costWarning, setCostWarning] = useState(false);
  const [sessionCostUsd, setSessionCostUsd] = useState(0);
  const [thresholdAck, setThresholdAck] = useState(false);
  const [paperTitle, setPaperTitle] = useState<string | null>(null);

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
      // Fresh share — wipe the dedup hash so the very first frame is always
      // sent through (otherwise a re-share with similar luma would no-op).
      lastHashRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStreaming(true);
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
    setContinuous(false);
    // Cancel any in-flight /captures POST so we don't pay for an analysis
    // the user just walked away from. Also reset the dedup hash so the next
    // re-share's first frame is always captured (avoids a phantom skip when
    // the new screen happens to share the old luma signature).
    if (captureAbortRef.current) {
      captureAbortRef.current.abort();
      captureAbortRef.current = null;
    }
    lastHashRef.current = null;
    inFlightRef.current = false;
  }, []);

  useEffect(() => {
    void startStream();
    return () => {
      stopStream();
      if (continuousTimerRef.current) {
        clearInterval(continuousTimerRef.current);
        continuousTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cheap frame "hash": sample an 8×8 grid of luma values. Two reads of the
  // same page produce the same hash; any scroll changes it.
  const hashFrame = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number): string => {
    const buckets: number[] = [];
    const cellW = Math.max(1, Math.floor(w / FRAME_HASH_GRID));
    const cellH = Math.max(1, Math.floor(h / FRAME_HASH_GRID));
    for (let gy = 0; gy < FRAME_HASH_GRID; gy++) {
      for (let gx = 0; gx < FRAME_HASH_GRID; gx++) {
        const x = gx * cellW;
        const y = gy * cellH;
        const px = ctx.getImageData(x, y, 1, 1).data;
        // Rec. 709 luma → quantize to 32 buckets for tolerance to compression.
        const luma = Math.round(0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]);
        buckets.push(luma >> 3);
      }
    }
    return buckets.join('-');
  }, []);

  const snapshot = useCallback(async (opts?: { fromContinuous?: boolean }) => {
    if (inFlightRef.current) return;
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

    // Continuous tick: pause if any prior row is still awaiting confirmation,
    // so the user isn't drowned in pending bars while reading at speed.
    if (opts?.fromContinuous && hasPendingConfirmRef.current) return;

    const hash = hashFrame(ctx, w, h);
    if (opts?.fromContinuous && hash === lastHashRef.current) {
      // Skip — same page still showing.
      return;
    }
    lastHashRef.current = hash;

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1] ?? '';
    if (!base64) return;

    inFlightRef.current = true;
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
        imageBase64: base64,
        mimeType: 'image/png',
        deep,
      };
      if (autoDetect) {
        body.autoDetect = true;
        body.pageNumber = pageNumber;
      } else {
        body.pageNumber = pageNumber;
      }
      if (fileName.trim()) body.fileName = fileName.trim();
      if (specialPrompt.trim()) body.specialPrompt = specialPrompt.trim();

      // Wire an AbortController so stopStream() can cancel mid-flight.
      const controller = new AbortController();
      captureAbortRef.current = controller;
      const res = await apiFetch<CaptureResult>(
        `/api/shwasha/sessions/${sessionId}/captures`,
        { method: 'POST', body: JSON.stringify(body), signal: controller.signal }
      );
      if (res.costWarning) setCostWarning(true);
      if (res.cost) {
        setSessionCostUsd(res.cost.sessionUsd);
        if (res.cost.thresholdCrossed) setThresholdAck(false);
      }
      if (res.session?.paperTitle) setPaperTitle(res.session.paperTitle);
      // Smart fileName: if the user didn't pre-set one and the server suggests a
      // remembered name for this source, fill it for the next capture.
      if (!fileName.trim() && res.suggestedFileName) {
        setFileName(res.suggestedFileName);
      }

      setCaptures((prev) =>
        prev.map((r) =>
          r.id === localId
            ? {
                ...r,
                status: 'done',
                analysisId: res.pageAnalysis?.id,
                pageNumber: res.pageAnalysis?.pageNumber ?? r.pageNumber,
                pages: res.detected?.pages ?? undefined,
                mainIdea: res.pageAnalysis?.analysis?.main_idea,
                tags: res.pageAnalysis?.analysis?.tags,
                detectedTitle: res.detected?.sourceTitle ?? null,
                costUsd: res.cost?.usd,
                needsConfirm: !!res.detected && (
                  typeof res.detected.pageNumber === 'number' ||
                  !!res.detected.sourceTitle
                ),
              }
            : r
        )
      );
      const detectedFromServer = res.pageAnalysis?.pageNumber;
      if (typeof detectedFromServer === 'number' && detectedFromServer > 0) {
        const advance = Array.isArray(res.detected?.pages) && res.detected!.pages!.length === 2 ? 2 : 1;
        setPageNumber(detectedFromServer + advance);
      } else {
        setPageNumber((n) => n + 1);
      }
    } catch (e) {
      // User-initiated abort (stopStream / continuous toggle off) — drop the
      // pending row silently rather than show a scary "Capture failed" badge.
      const isAbort = e instanceof DOMException && e.name === 'AbortError';
      if (isAbort) {
        setCaptures((prev) => prev.filter((r) => r.id !== localId));
        return;
      }
      const msg = e instanceof Error ? e.message : 'Capture failed';
      setCaptures((prev) =>
        prev.map((r) =>
          r.id === localId
            ? { ...r, status: 'error', error: msg }
            : r
        )
      );
    } finally {
      inFlightRef.current = false;
      captureAbortRef.current = null;
      setCapturing(false);
      setTimeout(() => thumbsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [streaming, pageNumber, specialPrompt, fileName, deep, autoDetect, sessionId, hashFrame]);

  // Mirror the "any row needs confirmation" state into a ref so the
  // continuous-mode tick can read it without recreating the interval.
  useEffect(() => {
    hasPendingConfirmRef.current = captures.some((c) => c.needsConfirm);
  }, [captures]);

  // Continuous-mode timer.
  useEffect(() => {
    if (!continuous || !streaming) {
      if (continuousTimerRef.current) {
        clearInterval(continuousTimerRef.current);
        continuousTimerRef.current = null;
      }
      return;
    }
    continuousTimerRef.current = setInterval(() => {
      void snapshot({ fromContinuous: true });
    }, CONTINUOUS_INTERVAL_MS);
    return () => {
      if (continuousTimerRef.current) {
        clearInterval(continuousTimerRef.current);
        continuousTimerRef.current = null;
      }
    };
  }, [continuous, streaming, snapshot]);

  const finish = () => {
    stopStream();
    router.push(`/shwasha/read?session=${sessionId}`);
  };

  // Inline confirm: user fixes the detected page or title before continuing.
  // PATCHes /api/shwasha/analyses/:id/correct so the correction persists on
  // the server-side PageAnalysisRecord (not just the in-session display).
  // On success: clear the bar + bump next pageNumber for the auto-increment.
  // On failure: keep the bar open and show the error inline so the user can
  // retry — the local row is NOT updated speculatively.
  const confirmRow = useCallback(async (rowId: string, edits: { pageNumber?: number; title?: string }) => {
    const row = captures.find((r) => r.id === rowId);
    if (!row?.analysisId) {
      // No server record yet (shouldn't happen — confirm bar only shows after
      // status='done'). Fall back to local update so the user isn't stuck.
      setCaptures((prev) => prev.map((r) => r.id === rowId
        ? { ...r, pageNumber: edits.pageNumber ?? r.pageNumber, detectedTitle: edits.title ?? r.detectedTitle, needsConfirm: false }
        : r));
      if (typeof edits.pageNumber === 'number' && edits.pageNumber > 0) {
        setPageNumber(edits.pageNumber + 1);
      }
      return;
    }
    try {
      await apiFetch(`/api/shwasha/analyses/${row.analysisId}/correct`, {
        method: 'PATCH',
        body: JSON.stringify({
          pageNumber: edits.pageNumber,
          sourceTitle: edits.title ?? null,
        }),
      });
      setCaptures((prev) => prev.map((r) => r.id === rowId
        ? {
            ...r,
            pageNumber: edits.pageNumber ?? r.pageNumber,
            detectedTitle: edits.title ?? r.detectedTitle,
            needsConfirm: false,
            confirmError: undefined,
          }
        : r));
      if (typeof edits.pageNumber === 'number' && edits.pageNumber > 0) {
        setPageNumber(edits.pageNumber + 1);
      }
      // Lock the title locally too, since the server now treats it as user-set.
      if (edits.title) setPaperTitle(edits.title);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setCaptures((prev) => prev.map((r) => r.id === rowId ? { ...r, confirmError: msg } : r));
    }
  }, [captures]);

  const dismissConfirm = useCallback((rowId: string) => {
    setCaptures((prev) => prev.map((r) => r.id === rowId ? { ...r, needsConfirm: false } : r));
  }, []);

  // OCR fallback for rows whose vision call returned no usable text.
  // tesseract.js is HEAVY (loads ~10MB of WASM + traineddata at runtime), so
  // we import it dynamically — the dep stays out of the initial bundle and
  // the fetch only happens the first time the user clicks "Try OCR".
  // Recognized text is pushed into `mainIdea` both locally AND on the server
  // via the existing PATCH /analyses/:id endpoint, so the saved record
  // reflects the correction on next open.
  const ocrRow = useCallback(async (rowId: string) => {
    const row = captures.find((r) => r.id === rowId);
    if (!row || row.status !== 'done') return;
    setCaptures((prev) => prev.map((r) => r.id === rowId ? { ...r, ocrRunning: true, ocrError: undefined } : r));
    try {
      // Lazy chunk-import: Next/webpack code-splits this; the user pays the
      // bundle cost only when they actually need it.
      const { recognize } = await import('tesseract.js');
      // 'eng+ara' covers the user's two-language reading material. Tesseract
      // loads the traineddata files from a CDN on first run; later runs hit
      // the browser cache.
      const result = await recognize(row.thumbnail, 'eng+ara');
      const text = result.data.text.trim();
      if (!text) {
        setCaptures((prev) => prev.map((r) => r.id === rowId
          ? { ...r, ocrRunning: false, ocrError: isRTL ? 'لم يُستخرج أي نص' : 'No text recognized' }
          : r));
        return;
      }
      // Push to local row immediately for snappy UX, then PATCH the server.
      setCaptures((prev) => prev.map((r) => r.id === rowId
        ? { ...r, ocrRunning: false, mainIdea: text }
        : r));
      if (row.analysisId) {
        try {
          await apiFetch(`/api/shwasha/analyses/${row.analysisId}`, {
            method: 'PATCH',
            body: JSON.stringify({ mainIdea: text }),
          });
        } catch {
          // Silent — local update already shown. The user can re-edit/save
          // through the regular review UI.
        }
      }
    } catch (e) {
      setCaptures((prev) => prev.map((r) => r.id === rowId
        ? { ...r, ocrRunning: false, ocrError: e instanceof Error ? e.message : 'OCR failed' }
        : r));
    }
  }, [captures, isRTL]);

  const capturedCount = captures.length;
  const pendingCount = useMemo(
    () => captures.filter((c) => c.status === 'pending').length,
    [captures]
  );
  const pendingConfirmCount = useMemo(
    () => captures.filter((c) => c.needsConfirm).length,
    [captures]
  );
  const continuousPaused = continuous && pendingConfirmCount > 0;

  return (
    <div className="flex flex-col h-full">
      {costWarning && (
        <div className="shrink-0 flex items-center gap-2 text-xs px-4 py-2 border-b border-warning/30 bg-warning/10 text-warning">
          <AlertTriangle size={14} />
          {isRTL
            ? 'تنبيه التكلفة: وضع السياق الكامل يكلف حوالي عشرة أضعاف الوضع الاعتيادي.'
            : 'Cost warning: full-context mode costs roughly 10× the normal mode.'}
        </div>
      )}

      {sessionCostUsd >= 0.5 && !thresholdAck && (
        <div className="shrink-0 flex items-center justify-between gap-2 text-xs px-4 py-2 border-b border-warning/30 bg-warning/10 text-warning">
          <span className="inline-flex items-center gap-2">
            <DollarSign size={14} />
            {isRTL
              ? `تجاوزت 0.50$ في هذه الجلسة (${sessionCostUsd.toFixed(2)}$). أكمل أو خذ نفساً.`
              : `Crossed $0.50 in this session ($${sessionCostUsd.toFixed(2)}). Keep going or pause.`}
          </span>
          <button onClick={() => setThresholdAck(true)} className="p-1 hover:bg-warning/20 rounded">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
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
            {streaming && paperTitle && (
              <div className="absolute top-2 start-2 text-[10px] text-white/80 bg-black/40 backdrop-blur px-2 py-1 rounded" dir="auto">
                {paperTitle}
              </div>
            )}
            {streaming && sessionCostUsd > 0 && (
              <div className="absolute top-2 end-2 text-[10px] text-white/80 bg-black/40 backdrop-blur px-2 py-1 rounded font-mono">
                ${sessionCostUsd.toFixed(3)}
              </div>
            )}
          </div>

          <div className="border-t border-border p-3 space-y-2 shrink-0 bg-surface">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {/* Page # field. The Auto-detect toggle sits in the header
                  row but is its OWN label (sibling, not nested) — nesting
                  labels is invalid HTML and causes click-routing surprises. */}
              <div className="flex flex-col gap-1">
                <div className="text-[11px] text-on-surface-tertiary flex items-center justify-between">
                  <label htmlFor="al-mulakhkhis-page-input">{isRTL ? 'رقم الصفحة' : 'Page #'}</label>
                  <label className="flex items-center gap-1 cursor-pointer text-[10px]">
                    <input
                      type="checkbox"
                      checked={autoDetect}
                      onChange={(e) => setAutoDetect(e.target.checked)}
                      className="w-3 h-3"
                    />
                    {isRTL ? 'كشف تلقائي' : 'Auto-detect'}
                  </label>
                </div>
                <input
                  id="al-mulakhkhis-page-input"
                  type="number"
                  min={1}
                  value={pageNumber}
                  disabled={autoDetect}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!Number.isNaN(n) && n > 0) setPageNumber(n);
                  }}
                  placeholder={autoDetect ? (isRTL ? 'يقرأها من الصفحة' : 'read from page') : undefined}
                  title={autoDetect ? (isRTL ? 'الوكيل يقرأ رقم الصفحة من الصورة. ألغ الاختيار للإدخال اليدوي.' : 'The agent reads the page number from the image. Uncheck to enter manually.') : undefined}
                  className="px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
              </div>
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
              {/* Toggle pills. Checkbox is sr-only (NOT className="hidden")
                  so it stays in the tab order. The parent label gets a
                  focus-within ring so keyboard users see focus state. */}
              <label
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-[var(--radius)] cursor-pointer border transition-colors',
                  'focus-within:ring-2 focus-within:ring-ring',
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
                  className="sr-only"
                />
                <Sparkles size={10} aria-hidden />
                {isRTL ? 'تحليل عميق' : 'Deep'}
              </label>

              <label
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-[var(--radius)] cursor-pointer border transition-colors',
                  'focus-within:ring-2 focus-within:ring-ring',
                  continuousPaused
                    ? 'bg-warning/10 text-warning border-warning/40'
                    : continuous
                      ? 'bg-success/10 text-success border-success/40'
                      : 'bg-surface-secondary text-on-surface-secondary border-border'
                )}
                title={
                  continuousPaused
                    ? (isRTL
                        ? `متوقف مؤقتاً — ${pendingConfirmCount} لقطة بانتظار التأكيد`
                        : `Paused — ${pendingConfirmCount} capture(s) awaiting confirmation`)
                    : isRTL
                      ? `يلتقط تلقائياً كل ${CONTINUOUS_INTERVAL_MS / 1000} ثانية، يتجاهل الإطارات المتطابقة`
                      : `Auto-capture every ${CONTINUOUS_INTERVAL_MS / 1000}s, skips identical frames`
                }
              >
                <input
                  type="checkbox"
                  checked={continuous}
                  onChange={(e) => setContinuous(e.target.checked)}
                  className="sr-only"
                />
                {continuous ? <Pause size={10} aria-hidden /> : <Play size={10} aria-hidden />}
                {isRTL ? 'مستمر' : 'Continuous'}
                {continuousPaused && (
                  <span className="text-[9px] font-medium ms-1 px-1 rounded bg-warning/20">
                    {isRTL ? 'متوقف' : 'paused'}
                  </span>
                )}
              </label>

              <button
                onClick={() => snapshot()}
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

          <div
            className="flex-1 overflow-auto p-3 space-y-2"
            aria-live="polite"
            aria-relevant="additions text"
            aria-busy={pendingCount > 0}
            aria-label={isRTL ? 'قائمة الالتقاطات' : 'Captures list'}
          >
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
                className="rounded-[var(--radius-lg)] border border-border bg-surface p-2 flex flex-col gap-2"
              >
                {/* Visually-hidden status for screen readers — announces the
                    pending→done/error transition since aria-live="polite" on
                    the parent re-reads this string when it changes. */}
                <span className="sr-only" role="status">
                  {c.status === 'pending'
                    ? (isRTL ? `يجري تحليل صفحة ${c.pageNumber}` : `Analyzing page ${c.pageNumber}`)
                    : c.status === 'done'
                      ? (isRTL ? `اكتمل تحليل صفحة ${c.pageNumber}` : `Page ${c.pageNumber} analysis ready`)
                      : (isRTL ? `فشل تحليل صفحة ${c.pageNumber}` : `Page ${c.pageNumber} failed`)}
                </span>
                <div className="flex gap-2">
                  <img
                    src={c.thumbnail}
                    alt={isRTL ? `صفحة ${c.pageNumber}` : `Page ${c.pageNumber}`}
                    className="w-20 h-14 object-cover rounded-[var(--radius)] border border-border shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-surface-secondary text-on-surface-secondary">
                        {c.pages && c.pages.length === 2
                          ? `p${c.pages[0]}-${c.pages[1]}`
                          : `p${c.pageNumber}`}
                      </span>
                      {c.fileName && (
                        <span className="text-[11px] text-on-surface-tertiary truncate" dir="auto">
                          {c.fileName}
                        </span>
                      )}
                      {typeof c.costUsd === 'number' && c.costUsd > 0 && (
                        <span className="text-[10px] text-on-surface-tertiary ms-auto font-mono">
                          ${c.costUsd.toFixed(3)}
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
                        {/* OCR fallback — only surfaced when the vision call
                            produced no usable text. Click runs Tesseract
                            client-side (lazy-loaded). */}
                        {(!c.mainIdea || c.mainIdea.trim().length < 10) && (
                          <button
                            onClick={() => void ocrRow(c.id)}
                            disabled={c.ocrRunning}
                            className="mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border text-on-surface-secondary hover:bg-surface-secondary disabled:opacity-50"
                            aria-label={isRTL ? 'استخراج النص بـ OCR' : 'Extract text with OCR'}
                          >
                            {c.ocrRunning ? <Loader2 size={9} className="animate-spin" /> : <ScanText size={9} aria-hidden />}
                            {isRTL
                              ? (c.ocrRunning ? 'يستخرج…' : 'جرّب OCR')
                              : (c.ocrRunning ? 'Extracting…' : 'Try OCR')}
                          </button>
                        )}
                        {c.ocrError && (
                          <p className="text-[10px] text-error mt-1" role="alert">{c.ocrError}</p>
                        )}
                      </>
                    )}
                    {c.status === 'error' && (
                      <p className="text-xs text-error mt-1">{c.error}</p>
                    )}
                  </div>
                </div>

                {c.status === 'done' && c.needsConfirm && (
                  <ConfirmBar
                    isRTL={isRTL}
                    initialPage={c.pageNumber}
                    initialTitle={c.detectedTitle ?? ''}
                    error={c.confirmError}
                    onConfirm={(edits) => confirmRow(c.id, edits)}
                    onDismiss={() => dismissConfirm(c.id)}
                  />
                )}
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

function ConfirmBar({
  isRTL,
  initialPage,
  initialTitle,
  error,
  onConfirm,
  onDismiss,
}: {
  isRTL: boolean;
  initialPage: number;
  initialTitle: string;
  /** Async error from the parent's PATCH attempt — shown inline so the user
   *  sees the failure without leaving the bar. */
  error?: string;
  onConfirm: (edits: { pageNumber?: number; title?: string }) => void;
  onDismiss: () => void;
}) {
  const [page, setPage] = useState(initialPage);
  const [title, setTitle] = useState(initialTitle);
  const pageInputRef = useRef<HTMLInputElement | null>(null);
  const dirty = page !== initialPage || title !== initialTitle;

  // Focus the page input when the bar appears so keyboard users can act
  // immediately. Only on first mount — re-renders shouldn't yank focus back.
  useEffect(() => {
    pageInputRef.current?.focus();
    pageInputRef.current?.select();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm({ pageNumber: page, title: title.trim() || undefined });
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onDismiss();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className="rounded-[var(--radius)] border border-accent/30 bg-accent/5 p-2 space-y-1 text-xs"
    >
      <div className="flex items-center gap-2">
        <input
          ref={pageInputRef}
          type="number"
          min={1}
          value={page}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!Number.isNaN(n) && n > 0) setPage(n);
          }}
          className="w-16 px-2 py-1 rounded bg-input border border-border text-on-surface text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label={isRTL ? 'رقم الصفحة' : 'Page number'}
        />
        <input
          type="text"
          value={title}
          dir="auto"
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isRTL ? 'عنوان المصدر' : 'Source title'}
          className="flex-1 min-w-0 px-2 py-1 rounded bg-input border border-border text-on-surface text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label={isRTL ? 'عنوان المصدر' : 'Source title'}
        />
        <button
          type="submit"
          title={isRTL ? (dirty ? 'حفظ التصحيح (Enter)' : 'تأكيد (Enter)') : (dirty ? 'Save correction (Enter)' : 'Confirm (Enter)')}
          className="p-1 rounded text-success hover:bg-success/10 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={isRTL ? 'تأكيد' : 'Confirm'}
        >
          <Check size={12} />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          title={isRTL ? 'تجاهل (Esc)' : 'Dismiss (Esc)'}
          className="p-1 rounded text-on-surface-tertiary hover:bg-surface-tertiary focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={isRTL ? 'تجاهل' : 'Dismiss'}
        >
          <X size={12} />
        </button>
      </div>
      {error && (
        <p className="text-[10px] text-error" role="alert">{error}</p>
      )}
    </form>
  );
}
