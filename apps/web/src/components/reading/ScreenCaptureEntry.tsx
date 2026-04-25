'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ScreenCapture } from './ScreenCapture';

type ReadingMode = 'rolling' | 'page' | 'full' | 'tac';

interface ShwashaSettings {
  mindBlock?: string;
  defaultLanguage?: 'en' | 'ar';
}

interface SessionResponse {
  id: string;
}

export function ScreenCaptureEntry() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [paperTitle, setPaperTitle] = useState('');
  const [sessionLanguage, setSessionLanguage] = useState<'en' | 'ar'>('en');
  const [sessionMode, setSessionMode] = useState<ReadingMode>('rolling');
  const [mindBlock, setMindBlock] = useState('');
  const [sessionMindOverride, setSessionMindOverride] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ShwashaSettings>('/api/shwasha/settings')
      .then((s) => {
        if (s.mindBlock) {
          setMindBlock(s.mindBlock);
          setSessionMindOverride(s.mindBlock);
        }
        if (s.defaultLanguage) setSessionLanguage(s.defaultLanguage);
      })
      .catch(() => {});
  }, []);

  const start = async () => {
    setCreating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        language: sessionLanguage,
        readingMode: sessionMode,
      };
      if (paperTitle.trim()) body.paperTitle = paperTitle.trim();
      const override = sessionMindOverride.trim();
      if (override && override !== mindBlock.trim()) body.mindOverride = override;

      const res = await apiFetch<SessionResponse>('/api/shwasha/sources/screen-capture', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSessionId(res.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  if (sessionId) {
    return <ScreenCapture sessionId={sessionId} />;
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <button
        onClick={() => router.push('/shwasha')}
        className="inline-flex items-center gap-1.5 text-xs text-on-surface-secondary hover:text-on-surface mb-4"
      >
        <ArrowLeft size={14} className={isRTL ? 'rotate-180' : ''} />
        {isRTL ? 'رجوع إلى اختيار المصدر' : 'Back to source picker'}
      </button>

      <div className="flex items-center gap-3 mb-2">
        <Monitor size={22} className="text-on-surface-secondary" />
        <h1 className="text-xl font-semibold text-on-surface">
          {isRTL ? 'التقاط الشاشة' : 'Screen capture'}
        </h1>
      </div>
      <p className="text-sm text-on-surface-secondary mb-6">
        {isRTL
          ? 'شارك شاشتك لالتقاط صفحات مباشرة من أي تطبيق — المُلخِّص ستحلل كل لقطة كصفحة.'
          : 'Share your screen to capture pages live from any app — Al-Mulakhkhis analyzes each frame as a page.'}
      </p>

      <div className="rounded-[var(--radius-lg)] border border-border bg-surface-secondary/20 p-4 space-y-4 mb-4">
        <div>
          <label className="text-xs text-on-surface-secondary block mb-1">
            {isRTL ? 'عنوان الورقة (اختياري)' : 'Paper title (optional)'}
          </label>
          <input
            type="text"
            value={paperTitle}
            onChange={(e) => setPaperTitle(e.target.value)}
            dir="auto"
            placeholder={isRTL ? 'مثلاً: BIM adoption in Kuwait' : 'e.g. BIM adoption in Kuwait'}
            className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <p className="text-xs font-medium text-on-surface-secondary mb-2">
            {isRTL ? 'لغة التحليل' : 'Analysis language'}
          </p>
          <div className="flex gap-2">
            {([
              { id: 'en' as const, label: 'English' },
              { id: 'ar' as const, label: 'العربية' },
            ]).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSessionLanguage(opt.id)}
                className={cn(
                  'px-3 py-1.5 rounded-[var(--radius)] text-xs border transition-colors',
                  sessionLanguage === opt.id
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-on-surface-secondary mb-2">
            {isRTL ? 'وضع القراءة' : 'Reading mode'}
          </p>
          <ReadingModePicker value={sessionMode} onChange={setSessionMode} isRTL={isRTL} />
        </div>
      </div>

      {error && (
        <div className="rounded-[var(--radius)] border border-error/30 bg-error/10 text-error text-xs px-3 py-2 mb-3">
          {error}
        </div>
      )}

      <button
        onClick={start}
        disabled={creating}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
      >
        {creating ? <Loader2 size={14} className="animate-spin" /> : <Monitor size={14} />}
        {isRTL ? 'بدء التقاط الشاشة' : 'Start screen capture'}
      </button>
    </div>
  );
}

function ReadingModePicker({
  value,
  onChange,
  isRTL,
}: {
  value: ReadingMode;
  onChange: (v: ReadingMode) => void;
  isRTL: boolean;
}) {
  const modes: { id: ReadingMode; en: string; ar: string; hint?: { en: string; ar: string } }[] = [
    {
      id: 'rolling',
      en: 'Rolling synthesis',
      ar: 'خلاصة تراكمية',
      hint: { en: 'Default — context carries across pages', ar: 'الافتراضي — الكاتب يتراكم عبر الصفحات' },
    },
    { id: 'page', en: 'Page-by-page', ar: 'صفحة صفحة' },
    {
      id: 'full',
      en: 'Full context (10× cost)',
      ar: 'الكاتب الكامل (تكلفة ×10)',
    },
    { id: 'tac', en: 'Skim (title+abstract+conclusion)', ar: 'تصفح سريع (مقدمة + خلاصة)' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {modes.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={cn(
            'text-start px-3 py-2 rounded-[var(--radius)] border transition-colors',
            value === m.id
              ? 'border-accent bg-accent/10'
              : 'border-border hover:bg-surface-secondary'
          )}
        >
          <p className={cn('text-xs font-medium', value === m.id ? 'text-accent' : 'text-on-surface')}>
            {isRTL ? m.ar : m.en}
          </p>
          {m.hint && (
            <p className="text-[11px] text-on-surface-tertiary mt-0.5">
              {isRTL ? m.hint.ar : m.hint.en}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}
