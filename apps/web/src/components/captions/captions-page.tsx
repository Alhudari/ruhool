'use client';

import { useEffect, useState } from 'react';
import {
  Upload,
  Loader2,
  Captions as CaptionsIcon,
  Plus,
  Trash2,
  Scissors,
  Download,
  CheckCircle2,
  FileVideo,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch, API_BASE_URL } from '@/lib/api';

// ─── Types ───

interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

interface CaptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: CaptionWord[];
}

interface UploadResult {
  id: string;
  filename: string;
  url: string;
}

interface TranscribeResult {
  fullText: string;
  segments: CaptionSegment[];
}

interface BurnResult {
  filename: string;
  url: string;
}

interface TranscriptListItem {
  id: string;
  uploadId?: string;
  filename?: string;
  createdAt?: string;
  fullText?: string;
}

type StylePreset = 'tiktok-yellow' | 'clean-white' | 'neon-pink' | 'karaoke';

interface PresetInfo {
  id: StylePreset;
  label: { en: string; ar: string };
  preview: { bg: string; text: string; highlight?: string; border?: string };
  description: { en: string; ar: string };
}

const PRESETS: PresetInfo[] = [
  {
    id: 'tiktok-yellow',
    label: { en: 'TikTok Yellow', ar: 'تيك توك أصفر' },
    preview: { bg: 'bg-black', text: 'text-yellow-400' },
    description: { en: 'Bold yellow on black', ar: 'أصفر جريء على أسود' },
  },
  {
    id: 'clean-white',
    label: { en: 'Clean White', ar: 'أبيض نظيف' },
    preview: { bg: 'bg-black/80', text: 'text-white' },
    description: { en: 'Minimal white text', ar: 'نص أبيض بسيط' },
  },
  {
    id: 'neon-pink',
    label: { en: 'Neon Pink', ar: 'وردي نيون' },
    preview: { bg: 'bg-black', text: 'text-pink-400' },
    description: { en: 'Glowing pink', ar: 'وردي متوهج' },
  },
  {
    id: 'karaoke',
    label: { en: 'Karaoke', ar: 'كاريوكي' },
    preview: { bg: 'bg-black', text: 'text-white', highlight: 'text-yellow-400' },
    description: { en: 'Word-by-word highlight', ar: 'تمييز كلمة بكلمة' },
  },
];

function formatTime(sec: number) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Component ───

export function CaptionsPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [transcribing, setTranscribing] = useState(false);
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const [preset, setPreset] = useState<StylePreset>('tiktok-yellow');
  const [trimStart, setTrimStart] = useState<string>('');
  const [trimEnd, setTrimEnd] = useState<string>('');

  const [burning, setBurning] = useState(false);
  const [burnResult, setBurnResult] = useState<BurnResult | null>(null);
  const [burnError, setBurnError] = useState<string | null>(null);

  const [transcripts, setTranscripts] = useState<TranscriptListItem[]>([]);

  useEffect(() => {
    apiFetch<TranscriptListItem[]>('/api/captions/transcripts')
      .then(setTranscripts)
      .catch(() => {});
  }, []);

  const t = (en: string, ar: string) => (isRTL ? ar : en);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    setBurnResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/captions/upload`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Upload failed: ${res.status}`);
      }
      const data: UploadResult = await res.json();
      setUpload(data);
      setSegments([]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      // reset input so same file can be picked again
      e.target.value = '';
    }
  };

  const handleTranscribe = async () => {
    if (!upload) return;
    setTranscribeError(null);
    setTranscribing(true);
    try {
      const data = await apiFetch<TranscribeResult>('/api/captions/transcribe', {
        method: 'POST',
        body: JSON.stringify({ uploadId: upload.id, language: 'ar' }),
      });
      setSegments(
        (data.segments || []).map((s) => ({
          ...s,
          id: s.id || uid(),
        }))
      );
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : String(err));
    } finally {
      setTranscribing(false);
    }
  };

  const updateSegment = (id: string, patch: Partial<CaptionSegment>) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeSegment = (id: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  };

  const addSegmentAfter = (index: number) => {
    const prev = segments[index];
    const next = segments[index + 1];
    const start = prev ? prev.end : 0;
    const end = next ? next.start : start + 2;
    const newSeg: CaptionSegment = {
      id: uid(),
      start,
      end: Math.max(end, start + 1),
      text: '',
    };
    setSegments((cur) => {
      const copy = [...cur];
      copy.splice(index + 1, 0, newSeg);
      return copy;
    });
  };

  const addFirstSegment = () => {
    setSegments([{ id: uid(), start: 0, end: 2, text: '' }]);
  };

  const handleBurn = async () => {
    if (!upload || segments.length === 0) return;
    setBurnError(null);
    setBurnResult(null);
    setBurning(true);
    try {
      const body: Record<string, unknown> = {
        uploadId: upload.id,
        segments: segments.map(({ id: _id, ...rest }) => rest),
        style: { preset },
      };
      if (trimStart.trim() !== '') body.trimStartSec = Number(trimStart);
      if (trimEnd.trim() !== '') body.trimEndSec = Number(trimEnd);
      const data = await apiFetch<BurnResult>('/api/captions/burn', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setBurnResult(data);
    } catch (err) {
      setBurnError(err instanceof Error ? err.message : String(err));
    } finally {
      setBurning(false);
    }
  };

  const videoUrl = upload ? `${API_BASE_URL}${upload.url}` : null;
  const burnUrl = burnResult ? `${API_BASE_URL}${burnResult.url}` : null;

  return (
    <div className="flex flex-col h-full bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-[var(--radius)] bg-accent/10 text-accent flex items-center justify-center">
          <CaptionsIcon size={20} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-on-surface">
            {t('Captions Editor', 'محرر الكابشنز')}
          </h1>
          <p className="text-xs text-on-surface-tertiary">
            {t(
              'Upload a video, transcribe, edit, pick a style and burn captions.',
              'ارفع فيديو، فرّغ الصوت، عدّل النص، اختر تصميمًا واحرق الكابشنز.'
            )}
          </p>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-5xl w-full mx-auto">
        {/* Upload section */}
        <section className="bg-surface-secondary border border-border rounded-[var(--radius-lg)] p-5">
          <h2 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
            <Upload size={16} />
            {t('1. Upload video', '١. رفع الفيديو')}
          </h2>

          {!upload ? (
            <label
              className={cn(
                'flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-[var(--radius)] p-10 cursor-pointer transition-colors',
                'hover:border-accent hover:bg-accent/5',
                uploading && 'opacity-60 pointer-events-none'
              )}
            >
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading}
              />
              {uploading ? (
                <>
                  <Loader2 size={24} className="animate-spin text-accent" />
                  <span className="text-sm text-on-surface-secondary">
                    {t('Uploading…', 'جاري الرفع…')}
                  </span>
                </>
              ) : (
                <>
                  <FileVideo size={28} className="text-on-surface-tertiary" />
                  <span className="text-sm text-on-surface">
                    {t('Click to choose a video file', 'اضغط لاختيار ملف فيديو')}
                  </span>
                  <span className="text-xs text-on-surface-tertiary">
                    {t('MP4, MOV, WebM…', 'MP4 أو MOV أو WebM…')}
                  </span>
                </>
              )}
            </label>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                  <span className="text-sm text-on-surface truncate">{upload.filename}</span>
                </div>
                <button
                  onClick={() => {
                    setUpload(null);
                    setSegments([]);
                    setBurnResult(null);
                  }}
                  className="text-xs text-on-surface-tertiary hover:text-on-surface flex items-center gap-1"
                >
                  <X size={12} /> {t('Replace', 'استبدال')}
                </button>
              </div>
              {videoUrl && (
                <video
                  src={videoUrl}
                  controls
                  className="w-full max-h-[400px] rounded-[var(--radius)] bg-black"
                />
              )}
            </div>
          )}

          {uploadError && (
            <p className="mt-3 text-xs text-red-500">{uploadError}</p>
          )}
        </section>

        {/* Transcribe section */}
        {upload && (
          <section className="bg-surface-secondary border border-border rounded-[var(--radius-lg)] p-5">
            <h2 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
              <Sparkles size={16} />
              {t('2. Transcribe', '٢. التفريغ النصي')}
            </h2>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleTranscribe}
                disabled={transcribing}
                className={cn(
                  'px-4 py-2 rounded-[var(--radius)] text-sm font-medium transition-colors',
                  'bg-accent text-on-accent hover:bg-accent-hover',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                  'flex items-center gap-2'
                )}
              >
                {transcribing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t('Transcribing…', 'جاري التفريغ…')}
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    {t('تفريغ تلقائي', 'تفريغ تلقائي')}
                  </>
                )}
              </button>
              {segments.length > 0 && (
                <span className="text-xs text-on-surface-tertiary">
                  {segments.length}{' '}
                  {t('segments', 'مقطعًا')}
                </span>
              )}
            </div>

            {transcribeError && (
              <p className="mt-3 text-xs text-red-500">{transcribeError}</p>
            )}

            {/* Segment editor */}
            {(segments.length > 0 || transcribing) && (
              <div className="mt-4 space-y-2">
                {segments.map((seg, i) => (
                  <div
                    key={seg.id}
                    className="bg-surface border border-border rounded-[var(--radius)] p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2 text-xs text-on-surface-tertiary">
                      <span className="font-mono">#{i + 1}</span>
                      <div className="flex items-center gap-1">
                        <label>{t('start', 'بداية')}</label>
                        <input
                          type="number"
                          step="0.1"
                          value={seg.start}
                          onChange={(e) =>
                            updateSegment(seg.id, { start: Number(e.target.value) })
                          }
                          className="w-20 px-2 py-1 rounded-[var(--radius-sm)] bg-surface-secondary border border-border text-on-surface text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <label>{t('end', 'نهاية')}</label>
                        <input
                          type="number"
                          step="0.1"
                          value={seg.end}
                          onChange={(e) =>
                            updateSegment(seg.id, { end: Number(e.target.value) })
                          }
                          className="w-20 px-2 py-1 rounded-[var(--radius-sm)] bg-surface-secondary border border-border text-on-surface text-xs"
                        />
                      </div>
                      <span className="opacity-60">
                        ({formatTime(seg.start)} → {formatTime(seg.end)})
                      </span>
                      <div className={cn('flex items-center gap-1', isRTL ? 'mr-auto' : 'ml-auto')}>
                        <button
                          onClick={() => addSegmentAfter(i)}
                          className="p-1 rounded hover:bg-surface-secondary text-on-surface-secondary"
                          title={t('Add below', 'إضافة تحت')}
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          onClick={() => removeSegment(seg.id)}
                          className="p-1 rounded hover:bg-surface-secondary text-red-500"
                          title={t('Remove', 'حذف')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={seg.text}
                      onChange={(e) => updateSegment(seg.id, { text: e.target.value })}
                      rows={2}
                      dir={isRTL ? 'rtl' : 'ltr'}
                      className="w-full px-3 py-2 rounded-[var(--radius-sm)] bg-surface-secondary border border-border text-on-surface text-sm resize-y focus:outline-none focus:border-accent"
                      placeholder={t('Caption text…', 'نص الكابشن…')}
                    />
                  </div>
                ))}

                {segments.length === 0 && !transcribing && (
                  <button
                    onClick={addFirstSegment}
                    className="w-full py-2 rounded-[var(--radius)] border border-dashed border-border text-xs text-on-surface-tertiary hover:text-accent hover:border-accent transition-colors flex items-center justify-center gap-1"
                  >
                    <Plus size={12} /> {t('Add segment manually', 'أضف مقطعًا يدويًا')}
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* Style picker */}
        {upload && (
          <section className="bg-surface-secondary border border-border rounded-[var(--radius-lg)] p-5">
            <h2 className="text-sm font-semibold text-on-surface mb-3">
              {t('3. Caption style', '٣. تصميم الكابشن')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {PRESETS.map((p) => {
                const active = preset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPreset(p.id)}
                    className={cn(
                      'rounded-[var(--radius)] border text-left transition-all overflow-hidden',
                      active
                        ? 'border-accent ring-2 ring-accent/40'
                        : 'border-border hover:border-accent/60'
                    )}
                  >
                    <div
                      className={cn(
                        'h-20 flex items-center justify-center text-sm font-bold',
                        p.preview.bg,
                        p.preview.text
                      )}
                    >
                      {p.id === 'karaoke' ? (
                        <span>
                          <span className={p.preview.highlight}>WORD</span>{' '}
                          <span className="opacity-60">by word</span>
                        </span>
                      ) : (
                        <span>SAMPLE TEXT</span>
                      )}
                    </div>
                    <div className="px-3 py-2 bg-surface">
                      <div className="text-xs font-medium text-on-surface">
                        {p.label[language]}
                      </div>
                      <div className="text-[10px] text-on-surface-tertiary">
                        {p.description[language]}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Trim + Burn */}
        {upload && (
          <section className="bg-surface-secondary border border-border rounded-[var(--radius-lg)] p-5">
            <h2 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
              <Scissors size={16} />
              {t('4. Trim (optional)', '٤. قص (اختياري)')}
            </h2>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-on-surface-tertiary">
                  {t('Start (sec)', 'البداية (ث)')}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={trimStart}
                  onChange={(e) => setTrimStart(e.target.value)}
                  placeholder="0"
                  className="w-28 px-3 py-2 rounded-[var(--radius-sm)] bg-surface border border-border text-on-surface text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-on-surface-tertiary">
                  {t('End (sec)', 'النهاية (ث)')}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={trimEnd}
                  onChange={(e) => setTrimEnd(e.target.value)}
                  placeholder={t('end of video', 'نهاية الفيديو')}
                  className="w-36 px-3 py-2 rounded-[var(--radius-sm)] bg-surface border border-border text-on-surface text-sm"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3 flex-wrap">
              <button
                onClick={handleBurn}
                disabled={burning || segments.length === 0}
                className={cn(
                  'px-5 py-2.5 rounded-[var(--radius)] text-sm font-medium transition-colors',
                  'bg-accent text-on-accent hover:bg-accent-hover',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                  'flex items-center gap-2'
                )}
              >
                {burning ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t('Burning captions…', 'جاري حرق الكابشنز…')}
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    {t('Burn Captions', 'حرق الكابشنز')}
                  </>
                )}
              </button>
              {segments.length === 0 && (
                <span className="text-xs text-on-surface-tertiary">
                  {t('Add at least one segment first.', 'أضف مقطعًا واحدًا على الأقل أولًا.')}
                </span>
              )}
            </div>

            {burnError && <p className="mt-3 text-xs text-red-500">{burnError}</p>}

            {burnResult && burnUrl && (
              <div className="mt-5 bg-green-500/10 border border-green-500/40 rounded-[var(--radius)] p-4 flex flex-wrap items-center gap-3">
                <CheckCircle2 size={20} className="text-green-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-on-surface font-medium">
                    {t('Captions burned successfully', 'تم حرق الكابشنز بنجاح')}
                  </div>
                  <div className="text-xs text-on-surface-tertiary truncate">
                    {burnResult.filename}
                  </div>
                </div>
                <a
                  href={burnUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={burnResult.filename}
                  className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-accent text-on-accent text-xs font-medium hover:bg-accent-hover flex items-center gap-1"
                >
                  <Download size={12} />
                  {t('Download', 'تحميل')}
                </a>
                <a
                  href="/library"
                  className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-surface border border-border text-xs font-medium hover:bg-surface-secondary text-on-surface"
                >
                  {t('Open Library', 'فتح المكتبة')}
                </a>
              </div>
            )}
          </section>
        )}

        {/* Past transcripts */}
        {transcripts.length > 0 && (
          <section className="bg-surface-secondary border border-border rounded-[var(--radius-lg)] p-5">
            <h2 className="text-sm font-semibold text-on-surface mb-3">
              {t('Past transcripts', 'تفريغات سابقة')}
            </h2>
            <ul className="divide-y divide-border">
              {transcripts.slice(0, 10).map((tr) => (
                <li key={tr.id} className="py-2 flex items-center gap-3 text-sm">
                  <FileVideo size={14} className="text-on-surface-tertiary shrink-0" />
                  <span className="truncate text-on-surface">
                    {tr.filename || tr.id}
                  </span>
                  {tr.createdAt && (
                    <span className={cn('text-xs text-on-surface-tertiary', isRTL ? 'mr-auto' : 'ml-auto')}>
                      {new Date(tr.createdAt).toLocaleString()}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
