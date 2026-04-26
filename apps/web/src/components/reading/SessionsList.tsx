'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpenText,
  Camera,
  Cast,
  FileText,
  HardDrive,
  History,
  Library,
  Link as LinkIcon,
  Loader2,
  Monitor,
  Quote,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

type ReadingMode = 'page' | 'rolling' | 'full' | 'tac';

interface SessionSummary {
  id: string;
  paperTitle?: string | null;
  title?: string | null;
  source?: string;
  totalPages?: number;
  analyzedPages?: number;
  readingMode?: ReadingMode;
  totalCost?: number;
  updatedAt?: string;
  createdAt?: string;
}

interface SessionsListResponse {
  sessions: SessionSummary[];
}

const SOURCE_ICON: Record<string, LucideIcon> = {
  zotero: Library,
  link: LinkIcon,
  drive: HardDrive,
  'kindle-clippings': Quote,
  'kindle-book': BookOpenText,
  pdf: FileText,
  upload: FileText,
  camera: Camera,
  screenshot: Camera,
  'screen-capture': Monitor,
  screen: Monitor,
};

const SOURCE_LABEL: Record<string, { en: string; ar: string }> = {
  zotero: { en: 'Zotero', ar: 'زوتيرو' },
  link: { en: 'Link', ar: 'رابط' },
  drive: { en: 'Drive', ar: 'درايف' },
  'kindle-clippings': { en: 'Clippings', ar: 'اقتباسات' },
  'kindle-book': { en: 'Kindle', ar: 'كيندل' },
  pdf: { en: 'PDF', ar: 'PDF' },
  upload: { en: 'PDF', ar: 'PDF' },
  camera: { en: 'Camera', ar: 'كاميرا' },
  screenshot: { en: 'Screenshot', ar: 'لقطة' },
  'screen-capture': { en: 'Screen', ar: 'شاشة' },
  screen: { en: 'Screen', ar: 'شاشة' },
};

const MODE_LABEL: Record<ReadingMode, { en: string; ar: string }> = {
  rolling: { en: 'Rolling', ar: 'تراكمي' },
  page: { en: 'Page', ar: 'صفحة' },
  full: { en: 'Full', ar: 'كامل' },
  tac: { en: 'TAC', ar: 'تصفح' },
};

function relativeTime(iso: string | undefined, isRTL: boolean): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return isRTL ? 'الآن' : 'now';
  if (mins < 60) return isRTL ? `قبل ${mins}د` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return isRTL ? `قبل ${hours}س` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return isRTL ? `قبل ${days}ي` : `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return isRTL ? `قبل ${weeks}أ` : `${weeks}w ago`;
  return new Date(iso).toLocaleDateString(isRTL ? 'ar' : 'en');
}

function formatCostFils(cost: number | undefined, isRTL: boolean): string {
  if (!cost || cost <= 0) return isRTL ? '٠ فلس' : '0 fils';
  // cost is assumed USD; convert to fils (1 KWD ~ 1000 fils, 1 KWD ~ 3.25 USD).
  const fils = Math.round((cost / 3.25) * 1000);
  return isRTL ? `${fils} فلس` : `${fils} fils`;
}

export function SessionsList() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const router = useRouter();

  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SessionsListResponse>('/api/shwasha/sessions?limit=20')
      .then((res) => setSessions(res.sessions || []))
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load sessions');
        setSessions([]);
      });
  }, []);

  if (sessions === null) {
    return (
      <div className="max-w-4xl mx-auto px-6 pt-6">
        <div className="flex items-center gap-2 text-xs text-on-surface-tertiary">
          <Loader2 size={12} className="animate-spin" />
          {isRTL ? 'جارٍ تحميل جلساتك…' : 'Loading your sessions…'}
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 pt-6">
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface-secondary/20 px-4 py-6 text-center">
          <History size={18} className="mx-auto text-on-surface-tertiary mb-2" />
          <p className="text-sm text-on-surface-secondary">
            {isRTL
              ? 'لا توجد جلسات قراءة بعد — ابدأ واحدة من المصادر أدناه.'
              : 'No reading sessions yet — start one from the sources below.'}
          </p>
          {error && (
            <p className="text-[11px] text-error mt-2">{error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 pt-6">
      {/* Page header — spec pattern */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-accent/10 text-accent flex items-center justify-center shrink-0">
          <BookOpen size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-on-surface">
            {isRTL ? 'جلسات القراءة — الملخص' : 'Reading Sessions — Al-Mulakhkhis'}
          </h1>
          <p className="text-xs text-on-surface-tertiary">
            {isRTL ? 'تحليل عميق للمصادر صفحةً صفحة' : 'Deep source analysis page by page'}
          </p>
        </div>
        <div className="ms-auto text-[11px] text-on-surface-tertiary">
          {isRTL ? `${sessions.length} جلسة` : `${sessions.length} sessions`}
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-on-surface-tertiary">
          {isRTL ? 'جلسات سابقة' : 'Recent sessions'}
        </h2>
      </div>

      <ul className="space-y-1.5">
        {sessions.map((s) => {
          const sourceKey = (s.source || '').toLowerCase();
          const Icon = SOURCE_ICON[sourceKey] ?? FileText;
          const sourceLabel = SOURCE_LABEL[sourceKey]?.[language] ?? s.source ?? '—';
          const title = s.paperTitle || s.title || (isRTL ? 'بدون عنوان' : 'Untitled');
          const total = s.totalPages ?? 0;
          const done = s.analyzedPages ?? 0;
          const when = relativeTime(s.updatedAt || s.createdAt, isRTL);
          const modeKey = s.readingMode as ReadingMode | undefined;

          return (
            <li key={s.id}>
              <button
                onClick={() => router.push(`/shwasha/read?session=${s.id}`)}
                className={cn(
                  'w-full text-start px-3 py-2.5 rounded-[var(--radius-lg)] border border-border',
                  'bg-surface hover:bg-surface-secondary/60 hover:border-border-hover transition-colors',
                  'flex items-center gap-3'
                )}
              >
                <Icon size={16} className="text-on-surface-tertiary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-on-surface truncate" dir="auto">
                    {title}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-on-surface-tertiary">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-on-surface-tertiary" />
                      {sourceLabel}
                    </span>
                    {total > 0 && (
                      <span>
                        {isRTL ? `${done}/${total} صفحة` : `${done}/${total} pages`}
                      </span>
                    )}
                    {modeKey && MODE_LABEL[modeKey] && (
                      <span className="px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                        {MODE_LABEL[modeKey][language]}
                      </span>
                    )}
                    <span>{formatCostFils(s.totalCost, isRTL)}</span>
                    <span className="ms-auto">{when}</span>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
