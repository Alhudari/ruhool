'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Save, BookOpen, Camera, Image as ImageIcon,
  Sparkles, FileText, Type, X, Download, ScanText, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch, apiStream } from '@/lib/api';

interface Session {
  id: string;
  paperTitle: string;
  paperMeta?: { authors?: string; year?: number | null; source?: string; type?: string };
  draftNotes?: string;
  language: 'en' | 'ar';
}

const SOURCE_TYPES = [
  { id: 'book', en: 'Paper Book', ar: 'كتاب ورقي', icon: '📖' },
  { id: 'paper', en: 'Academic Paper', ar: 'ورقة أكاديمية', icon: '📄' },
  { id: 'website', en: 'Website / Article', ar: 'موقع / مقال', icon: '🌐' },
  { id: 'lecture', en: 'Lecture / Video', ar: 'محاضرة / فيديو', icon: '🎓' },
  { id: 'manual', en: 'Manual Note', ar: 'ملاحظة يدوية', icon: '✍️' },
];

export function StandaloneNotesPage({ initialSessionId }: { initialSessionId: string | null }) {
  const router = useRouter();
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [year, setYear] = useState('');
  const [sourceType, setSourceType] = useState('manual');
  const [body, setBody] = useState('');

  // Attachments (kept locally; appended to body when OCR'd)
  const [pendingImages, setPendingImages] = useState<Array<{ id: string; previewUrl: string; name: string }>>([]);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);

  // Paste source identifier
  const [pasteSourceOpen, setPasteSourceOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [identifying, setIdentifying] = useState(false);

  // Save state
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Bootstrap: load existing OR create new session ───────────────
  useEffect(() => {
    (async () => {
      try {
        if (initialSessionId) {
          const sess = await apiFetch<{ session: Session }>(`/api/shwasha/sessions/${initialSessionId}`);
          const s = sess.session;
          setSession(s);
          setTitle(s.paperTitle === 'Free Notes' ? '' : s.paperTitle);
          setAuthors(s.paperMeta?.authors ?? '');
          setYear(String(s.paperMeta?.year ?? ''));
          setSourceType((s.paperMeta?.type ?? 'manual'));
          setBody(s.draftNotes ?? '');
        } else {
          // Create new standalone session
          const sess = await apiFetch<{ id: string }>('/api/shwasha/sources/standalone', {
            method: 'POST', body: JSON.stringify({ language }),
          });
          // Replace URL so refresh keeps the session
          router.replace(`/shwasha/standalone?session=${sess.id}`);
          setSession({ id: sess.id, paperTitle: '', language });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [initialSessionId, language, router]);

  // ── Auto-save body every 30s ─────────────────────────────────────
  const flushSave = useCallback(async (b: string) => {
    if (!session) return;
    try {
      await apiFetch(`/api/shwasha/sessions/${session.id}/draft`, {
        method: 'PUT', body: JSON.stringify({ notes: b }),
      });
      setSavedAt(new Date().toISOString());
    } catch { /* ignore */ }
  }, [session]);

  const onBodyChange = (v: string) => {
    setBody(v);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => flushSave(v), 30_000);
  };

  // Save metadata immediately on change
  const saveMeta = useCallback(async () => {
    if (!session) return;
    try {
      await apiFetch(`/api/shwasha/sessions/${session.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          paperTitle: title || (isRTL ? 'ملاحظات حرة' : 'Free Notes'),
          paperMeta: {
            authors,
            year: year ? Number(year) : null,
            type: sourceType,
          },
        }),
      });
    } catch { /* ignore */ }
  }, [session, title, authors, year, sourceType, isRTL]);

  useEffect(() => {
    if (!session) return;
    const t = setTimeout(saveMeta, 1500);
    return () => clearTimeout(t);
  }, [title, authors, year, sourceType, session, saveMeta]);

  // ── Image upload + OCR ───────────────────────────────────────────
  const handleImageFiles = (files: FileList) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const id = crypto.randomUUID();
        setPendingImages((prev) => [...prev, { id, previewUrl: dataUrl, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const ocrPendingImages = async () => {
    if (pendingImages.length === 0) return;
    setAnalyzingImage(true);
    setAnalyzeProgress(0);
    try {
      // Use Fatin via /api/chat with images
      const images = pendingImages.map((img) => ({
        base64: img.previewUrl,
        mimeType: img.previewUrl.match(/data:([^;]+);/)?.[1] ?? 'image/jpeg',
      }));
      let collected = '';
      await new Promise<void>((resolve, reject) => {
        const cancel = apiStream(
          '/api/chat',
          {
            agentId: 'fatin',
            message: isRTL
              ? 'استخرج النص الكامل من هذه الصورة/الصور بدقة. لا تضف تعليقاً، فقط النص. إذا كان المحتوى من كتاب، اذكر العنوان والمؤلف والصفحة في الأعلى إن أمكن.'
              : 'Extract the full text from this image/images precisely. No commentary, just the text. If from a book, mention title/author/page at the top if visible.',
            images,
          },
          (event, data) => {
            const d = data as Record<string, unknown>;
            if (event === 'text') {
              collected += (d.content as string) || '';
              setAnalyzeProgress(collected.length);
            }
            if (event === 'done') resolve();
            if (event === 'error') reject(new Error((d.error as string) ?? 'OCR failed'));
          },
          () => resolve(),
          (err) => reject(new Error(err)),
        );
        // Safety timeout
        setTimeout(() => { try { cancel?.(); } catch {} resolve(); }, 60_000);
      });

      if (collected.trim()) {
        // Append OCR result to body with a header
        const stamp = new Date().toLocaleString(isRTL ? 'ar-SA' : 'en-GB');
        const header = isRTL
          ? `\n\n---\n## 📄 نص مستخرج (${stamp})\n\n`
          : `\n\n---\n## 📄 Extracted text (${stamp})\n\n`;
        const newBody = body + header + collected.trim() + '\n';
        setBody(newBody);
        flushSave(newBody);
        setPendingImages([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OCR failed');
    } finally {
      setAnalyzingImage(false);
    }
  };

  // ── Identify source from pasted text ─────────────────────────────
  const identifyPastedSource = async () => {
    if (!pasteText.trim()) return;
    setIdentifying(true);
    try {
      let collected = '';
      await new Promise<void>((resolve, reject) => {
        apiStream(
          '/api/chat',
          {
            agentId: 'research-companion',
            message: isRTL
              ? `حدد عنوان ومؤلف ونوع المصدر من هذا النص. أعطني JSON فقط بالشكل: {"title":"...","authors":"...","year":2024,"type":"book|paper|website|lecture"}\n\nالنص:\n${pasteText.slice(0, 2000)}`
              : `Identify the title, authors, and source type from this text. Reply with JSON only: {"title":"...","authors":"...","year":2024,"type":"book|paper|website|lecture"}\n\nText:\n${pasteText.slice(0, 2000)}`,
          },
          (event, data) => {
            const d = data as Record<string, unknown>;
            if (event === 'text') collected += (d.content as string) || '';
            if (event === 'done') resolve();
            if (event === 'error') reject(new Error((d.error as string) ?? 'identify failed'));
          },
          () => resolve(),
          (err) => reject(new Error(err)),
        );
      });
      // Try to parse JSON from response
      const m = collected.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          const j = JSON.parse(m[0]) as { title?: string; authors?: string; year?: number; type?: string };
          if (j.title) setTitle(j.title);
          if (j.authors) setAuthors(j.authors);
          if (j.year) setYear(String(j.year));
          if (j.type && SOURCE_TYPES.find((s) => s.id === j.type)) setSourceType(j.type);
        } catch { /* leave fields */ }
      }
      // Also append the pasted text to body
      const stamp = new Date().toLocaleString(isRTL ? 'ar-SA' : 'en-GB');
      const header = isRTL ? `\n\n---\n## 📋 نص مُلصق (${stamp})\n\n` : `\n\n---\n## 📋 Pasted text (${stamp})\n\n`;
      setBody((b) => b + header + pasteText + '\n');
      setPasteText('');
      setPasteSourceOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'identify failed');
    } finally {
      setIdentifying(false);
    }
  };

  // ── Save to Obsidian ──────────────────────────────────────────────
  const saveToObsidian = async () => {
    if (!session) return;
    setSaving(true);
    try {
      await flushSave(body); // ensure latest body is persisted
      await apiFetch(`/api/shwasha/sessions/${session.id}/save-to-obsidian`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setSavedAt(new Date().toISOString());
      // Also flush metadata
      await saveMeta();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / error states ────────────────────────────────────────
  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-surface">
      <Loader2 className="h-7 w-7 animate-spin text-on-surface-tertiary" />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="border-b border-border bg-surface-secondary px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => router.push('/shwasha')}
            className="text-on-surface-tertiary hover:text-on-surface-secondary"
            title={isRTL ? 'رجوع' : 'Back'}
          >
            <ArrowLeft className={cn('h-4 w-4', isRTL && 'rotate-180')} />
          </button>
          <div className="h-9 w-9 rounded-xl bg-info/15 flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5 text-info" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-on-surface">
              {isRTL ? 'ملاحظات حرة' : 'Free Notes'}
            </h1>
            <p className="text-[11px] text-on-surface-tertiary">
              {savedAt
                ? (isRTL ? `آخر حفظ ${new Date(savedAt).toLocaleTimeString('ar-SA')}` : `Saved ${new Date(savedAt).toLocaleTimeString()}`)
                : (isRTL ? 'حفظ تلقائي كل 30 ثانية' : 'Auto-save every 30s')}
            </p>
          </div>
        </div>
        {/* Save to Obsidian removed — Law 1: platform is source of truth */}
      </div>

      {error && (
        <div className="mx-6 mt-3 rounded-lg border border-warning bg-warning/10 px-3 py-2 text-xs text-warning flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="h-3 w-3" /></button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">

          {/* Metadata card */}
          <div className="rounded-xl border border-border bg-surface-secondary p-5 space-y-4">
            <p className="text-[10px] uppercase tracking-widest text-on-surface-tertiary">
              {isRTL ? 'بيانات المصدر' : 'Source Info'}
            </p>

            {/* Source type pills */}
            <div className="flex flex-wrap gap-2">
              {SOURCE_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSourceType(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors',
                    sourceType === t.id
                      ? 'bg-accent text-on-accent'
                      : 'bg-surface text-on-surface-secondary hover:bg-surface-tertiary border border-border'
                  )}
                >
                  <span>{t.icon}</span>
                  {t.en === 'Paper Book' ? (isRTL ? t.ar : t.en) : (isRTL ? t.ar : t.en)}
                </button>
              ))}
            </div>

            {/* Title input */}
            <div>
              <label className="text-[11px] text-on-surface-tertiary mb-1 block">
                {isRTL ? 'العنوان' : 'Title'}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isRTL ? 'مثلاً: كتاب BIM Handbook، الفصل 3' : 'e.g., BIM Handbook, Chapter 3'}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:border-accent"
              />
            </div>

            {/* Authors + year */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] text-on-surface-tertiary mb-1 block">
                  {isRTL ? 'المؤلف(ون)' : 'Authors'}
                </label>
                <input
                  type="text"
                  value={authors}
                  onChange={(e) => setAuthors(e.target.value)}
                  placeholder={isRTL ? 'اختياري' : 'Optional'}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] text-on-surface-tertiary mb-1 block">
                  {isRTL ? 'السنة' : 'Year'}
                </label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2024"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>

          {/* Action buttons row */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border bg-surface-secondary hover:bg-surface-tertiary text-on-surface-secondary"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              {isRTL ? 'صور صفحات' : 'Page images'}
            </button>
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border bg-surface-secondary hover:bg-surface-tertiary text-on-surface-secondary"
            >
              <Camera className="h-3.5 w-3.5" />
              {isRTL ? 'كاميرا (كتاب)' : 'Camera (book)'}
            </button>
            <button
              onClick={() => setPasteSourceOpen(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border bg-surface-secondary hover:bg-surface-tertiary text-on-surface-secondary"
            >
              <ScanText className="h-3.5 w-3.5" />
              {isRTL ? 'الصق نصاً وحدّد المصدر' : 'Paste text + identify'}
            </button>
            <input
              ref={fileInputRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => { if (e.target.files) handleImageFiles(e.target.files); e.target.value = ''; }}
            />
            <input
              ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => { if (e.target.files) handleImageFiles(e.target.files); e.target.value = ''; }}
            />
          </div>

          {/* Pending images preview */}
          {pendingImages.length > 0 && (
            <div className="rounded-xl border border-info/30 bg-info/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-info">
                  {pendingImages.length} {isRTL ? 'صورة جاهزة لاستخراج النص' : 'image(s) ready for OCR'}
                </p>
                <button
                  onClick={ocrPendingImages}
                  disabled={analyzingImage}
                  className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-md bg-info text-on-accent hover:opacity-90 disabled:opacity-50"
                >
                  {analyzingImage ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> {isRTL ? `${analyzeProgress} حرف...` : `${analyzeProgress} chars...`}</>
                  ) : (
                    <><Sparkles className="h-3 w-3" /> {isRTL ? 'استخراج النص' : 'Extract text'}</>
                  )}
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {pendingImages.map((img) => (
                  <div key={img.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.previewUrl} alt={img.name} className="h-20 w-20 object-cover rounded-md border border-border" />
                    <button
                      onClick={() => setPendingImages((p) => p.filter((x) => x.id !== img.id))}
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-error text-white flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body editor */}
          <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
            <div className="px-5 py-2 border-b border-border flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-on-surface-tertiary flex items-center gap-1.5">
                <Type className="h-3 w-3" />
                {isRTL ? 'ملاحظاتي' : 'My Notes'}
              </p>
              <span className="text-[10px] text-on-surface-tertiary">
                {body.split(/\s+/).filter(Boolean).length} {isRTL ? 'كلمة' : 'words'}
              </span>
            </div>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              placeholder={isRTL
                ? 'اكتب ملاحظاتك هنا بحرية... المنصة تحفظ تلقائياً كل 30 ثانية.\n\nنصائح:\n- استخدم # للعناوين\n- استخدم - للنقاط\n- ارفق صورة صفحة من كتاب وستُستخرج بالـ OCR\n- الصق نصاً واطلب من الخوي تحديد المصدر'
                : 'Write your notes freely here... auto-saves every 30s.\n\nTips:\n- Use # for headings\n- Use - for bullets\n- Attach a book page image, OCR will extract\n- Paste text, Al-Khuwy will identify the source'}
              rows={20}
              dir={/[\u0600-\u06FF]/.test(body) || isRTL ? 'rtl' : 'ltr'}
              className="w-full bg-surface px-5 py-4 text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none resize-none font-mono leading-relaxed"
              style={{ minHeight: '500px' }}
            />
          </div>

          <p className="text-[11px] text-on-surface-tertiary text-center">
            {isRTL
              ? 'الجلسة محفوظة في رحول تلقائياً.'
              : 'Session is saved automatically in Ruhool.'}
          </p>
        </div>
      </div>

      {/* Paste source modal */}
      {pasteSourceOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setPasteSourceOpen(false); }}
        >
          <div className="bg-surface border border-border rounded-2xl w-full max-w-xl shadow-2xl" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanText className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold text-on-surface">
                  {isRTL ? 'الصق نصاً ودع الخوي يحدّد المصدر' : 'Paste text — Al-Khuwy will identify it'}
                </h2>
              </div>
              <button onClick={() => setPasteSourceOpen(false)} className="text-on-surface-tertiary hover:text-on-surface">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={isRTL
                  ? 'الصق هنا فقرة من المصدر (عنوان + ملخص + اقتباس مفيد)... الخوي سيحاول استخراج العنوان والمؤلف والسنة'
                  : 'Paste a passage (title + abstract + a quote)... Al-Khuwy will try to extract title, authors, year'}
                rows={8}
                className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:border-accent resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPasteSourceOpen(false)}
                  className="text-xs px-3 py-1.5 rounded-md text-on-surface-tertiary hover:text-on-surface-secondary"
                >
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={identifyPastedSource}
                  disabled={!pasteText.trim() || identifying}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-accent text-on-accent disabled:opacity-50"
                >
                  {identifying
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> {isRTL ? 'جارٍ التعرّف...' : 'Identifying...'}</>
                    : <><Eye className="h-3 w-3" /> {isRTL ? 'تعرّف وأضِف' : 'Identify + add'}</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
