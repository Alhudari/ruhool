'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Link as LinkIcon,
  HardDrive,
  FileText,
  Upload,
  Camera,
  ChevronDown,
  ChevronUp,
  Loader2,
  Library,
  Monitor,
  Quote,
  X,
  Search,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch, API_BASE_URL } from '@/lib/api';

interface PapersUploadResponse {
  id: string;
  filename: string;
  title: string;
  pages: number;
  sectionCount: number;
}

type SourceKind =
  | 'zotero'
  | 'link'
  | 'drive'
  | 'kindle-clippings'
  | 'kindle-book'
  | 'pdf'
  | 'camera'
  | 'screen-capture'
  | 'standalone';

type ReadingMode = 'rolling' | 'page' | 'full' | 'tac';

interface SourceDef {
  id: SourceKind;
  icon: LucideIcon;
  label: { en: string; ar: string };
  desc: { en: string; ar: string };
  disabled?: boolean;
}

const SOURCES: SourceDef[] = [
  {
    id: 'zotero',
    icon: Library,
    label: { en: 'Zotero', ar: 'زوتيرو' },
    desc: { en: 'Link from your Zotero library', ar: 'من مكتبة زوتيرو الخاصة بك' },
  },
  {
    id: 'link',
    icon: LinkIcon,
    label: { en: 'Direct Link', ar: 'رابط مباشر' },
    desc: { en: 'A public URL to a paper or article', ar: 'رابط عام لورقة أو مقال' },
  },
  {
    id: 'drive',
    icon: HardDrive,
    label: { en: 'Google Drive', ar: 'جوجل درايف' },
    desc: { en: 'Pick a file from Drive', ar: 'اختر ملفًا من درايف' },
  },
  {
    id: 'kindle-clippings',
    icon: Quote,
    label: { en: 'Kindle Clippings', ar: 'اقتباسات كيندل' },
    desc: { en: 'Paste or upload My Clippings.txt', ar: 'ألصق أو ارفع ملف الاقتباسات' },
  },
  {
    id: 'kindle-book',
    icon: BookOpen,
    label: { en: 'Kindle Book', ar: 'كتاب كيندل' },
    desc: { en: 'Upload a Kindle book file', ar: 'ارفع ملف كتاب كيندل' },
  },
  {
    id: 'pdf',
    icon: FileText,
    label: { en: 'PDF Upload', ar: 'رفع PDF' },
    desc: { en: 'Upload a PDF from your computer', ar: 'ارفع ملف PDF من جهازك' },
  },
  {
    id: 'camera',
    icon: Camera,
    label: { en: 'Screenshot / Camera', ar: 'لقطة شاشة / كاميرا' },
    desc: { en: 'Capture a page from a physical book', ar: 'التقط صفحة من كتاب ورقي' },
  },
  {
    id: 'screen-capture',
    icon: Monitor,
    label: { en: 'Screen capture', ar: 'التقاط الشاشة' },
    desc: {
      en: 'Share a window or screen and analyze frames live',
      ar: 'شارك نافذة أو شاشة وحلّل الإطارات مباشرة',
    },
  },
  {
    id: 'standalone',
    icon: FileText,
    label: { en: 'Free Notes', ar: 'ملاحظات حرة' },
    desc: {
      en: 'Open a blank notes session with Al-Mulakhkhis by your side',
      ar: 'افتح جلسة ملاحظات مع المُلخِّص دون مصدر محدد',
    },
  },
];

interface ShwashaSettings {
  mindBlock?: string;
  agentIntegrations?: string;
  defaultLanguage?: 'en' | 'ar';
}

interface SessionResponse {
  id: string;
}

export function SourceSelector() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const router = useRouter();

  const [selected, setSelected] = useState<SourceKind | null>(null);
  const [sessionLanguage, setSessionLanguage] = useState<'en' | 'ar'>('en');
  const [sessionMode, setSessionMode] = useState<ReadingMode>('rolling');
  const [mindBlock, setMindBlock] = useState('');
  const [sessionMindOverride, setSessionMindOverride] = useState('');
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase 5: Library entity pre-reading gate
  interface LibEntityMin { id: string; title: string; type: string; zoteroKey?: string }
  const [entitySearch, setEntitySearch] = useState('');
  const [entityResults, setEntityResults] = useState<LibEntityMin[]>([]);
  const [linkedEntity, setLinkedEntity] = useState<LibEntityMin | null>(null);
  const [entitySearchOpen, setEntitySearchOpen] = useState(false);
  const [skipEntityGate, setSkipEntityGate] = useState(false);

  useEffect(() => {
    if (!entitySearch.trim()) { setEntityResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch<{ entities: LibEntityMin[] }>(
          `/api/library/entities?search=${encodeURIComponent(entitySearch)}&limit=8`
        );
        setEntityResults(r.entities ?? []);
      } catch { setEntityResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [entitySearch]);

  const [directUrl, setDirectUrl] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [clippingsText, setClippingsText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const clippingsFileRef = useRef<HTMLInputElement>(null);
  const kindleBookRef = useRef<HTMLInputElement>(null);
  const screenshotRef = useRef<HTMLInputElement>(null);

  // Zotero picker — load on demand when user expands the Zotero source
  interface ZoteroItemMin {
    itemKey: string; title: string; authors: string; year?: number; itemType: string;
  }
  interface ZoteroCol { key: string; name: string; parentCollection?: string }
  const [zCollections, setZCollections] = useState<ZoteroCol[]>([]);
  const [zItems, setZItems] = useState<ZoteroItemMin[]>([]);
  const [zSelectedCol, setZSelectedCol] = useState<string>('');
  const [zSearch, setZSearch] = useState('');
  const [zLoading, setZLoading] = useState(false);
  const [zError, setZError] = useState<string | null>(null);
  const [zPicking, setZPicking] = useState<string | null>(null);
  const [zLoaded, setZLoaded] = useState(false);

  const loadZotero = useCallback(async (collection?: string) => {
    setZLoading(true);
    setZError(null);
    try {
      const [colsRes, itemsRes] = await Promise.all([
        zCollections.length === 0
          ? apiFetch<unknown>('/api/zotero/collections').catch(() => [])
          : Promise.resolve(null),
        apiFetch<{ items?: ZoteroItemMin[] }>(
          `/api/zotero/items-rich?limit=300${collection ? `&collection=${collection}` : ''}`,
        ).catch(() => ({ items: [] })),
      ]);
      if (colsRes !== null) {
        const cols = Array.isArray(colsRes)
          ? (colsRes as ZoteroCol[])
          : ((colsRes as { collections?: ZoteroCol[] })?.collections ?? []);
        setZCollections(cols);
      }
      setZItems(Array.isArray(itemsRes?.items) ? itemsRes.items : []);
      setZLoaded(true);
    } catch (e) {
      setZError(e instanceof Error ? e.message : 'Failed to load Zotero');
    } finally {
      setZLoading(false);
    }
  }, [zCollections.length]);

  useEffect(() => {
    apiFetch<ShwashaSettings>('/api/al-mulakhkhis/settings')
      .then((s) => {
        if (s.mindBlock) {
          setMindBlock(s.mindBlock);
          setSessionMindOverride(s.mindBlock);
        }
        if (s.defaultLanguage) setSessionLanguage(s.defaultLanguage);
      })
      .catch(() => {});
  }, []);

  const buildCommonBody = (extra: Record<string, unknown>): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      language: sessionLanguage,
      readingMode: sessionMode,
      ...extra,
    };
    const override = sessionMindOverride.trim();
    if (override && override !== mindBlock.trim()) {
      body.mindOverride = override;
    }
    if (linkedEntity) body.libraryEntityId = linkedEntity.id;
    return body;
  };

  const goToSession = (id: string) => {
    router.push(`/al-mulakhkhis/read?session=${id}`);
  };

  /**
   * Non-upload source submit. Each source has its own server-side ingestion
   * endpoint under `/api/al-mulakhkhis/sources/*` that parses the input and returns
   * a fully-formed ReadingSessionRecord.
   */
  const submit = async (kind: SourceKind, payload: Record<string, unknown>) => {
    setSubmitting(true);
    setError(null);
    try {
      let endpoint: string;
      let body: Record<string, unknown>;
      switch (kind) {
        case 'zotero': {
          const key = typeof payload.zoteroKey === 'string' ? payload.zoteroKey : '';
          if (!key) throw new Error('Zotero item key required');
          endpoint = '/api/al-mulakhkhis/sources/zotero';
          body = buildCommonBody({ zoteroKey: key });
          break;
        }
        case 'link': {
          const url = typeof payload.url === 'string' ? payload.url : '';
          if (!url) throw new Error('URL required');
          endpoint = '/api/al-mulakhkhis/sources/link';
          body = buildCommonBody({ url });
          break;
        }
        case 'drive': {
          const publicUrl = typeof payload.publicUrl === 'string' ? payload.publicUrl : '';
          if (!publicUrl) throw new Error('Drive share link required');
          endpoint = '/api/al-mulakhkhis/sources/drive';
          body = buildCommonBody({ publicUrl });
          break;
        }
        case 'kindle-clippings': {
          const clippings = typeof payload.clippings === 'string' ? payload.clippings : '';
          if (!clippings.trim()) throw new Error('Clippings text required');
          endpoint = '/api/al-mulakhkhis/sources/kindle-clippings';
          body = buildCommonBody({ clippings });
          break;
        }
        default:
          throw new Error(`Unsupported source: ${kind}`);
      }
      const session = await apiFetch<SessionResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      goToSession(session.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Upload-source submit. PDFs keep the existing `/api/papers` → sessions
   * two-step flow. Kindle books go to `/api/al-mulakhkhis/sources/kindle-book`,
   * kindle-clippings files are read locally and POSTed as JSON, screenshots
   * go to `/api/al-mulakhkhis/sources/screenshot`.
   */
  const submitFile = async (file: File, source: SourceKind) => {
    setSubmitting(true);
    setError(null);
    try {
      if (source === 'pdf') {
        // Step 1: upload + parse via existing papers route.
        const fd = new FormData();
        fd.append('file', file);
        const paperRes = await fetch(`${API_BASE_URL}/api/papers`, {
          method: 'POST',
          body: fd,
        });
        if (!paperRes.ok) {
          const err = await paperRes.json().catch(() => ({ error: paperRes.statusText }));
          throw new Error(err.error || `Upload failed: ${paperRes.status}`);
        }
        const paper = (await paperRes.json()) as PapersUploadResponse;

        const full = await apiFetch<{ sections: { title: string; content: string }[]; title: string }>(
          `/api/papers/${paper.id}`
        );
        const pages = (full.sections || []).map((s) =>
          s.title ? `${s.title}\n\n${s.content}` : s.content
        );

        const createBody: Record<string, unknown> = {
          paperId: paper.id,
          paperTitle: paper.title || file.name,
          source: 'upload',
          sourceRef: paper.id,
          totalPages: pages.length || paper.pages || 1,
          language: sessionLanguage,
          readingMode: sessionMode,
          pages,
        };
        const override = sessionMindOverride.trim();
        if (override && override !== mindBlock.trim()) createBody.mindOverride = override;

        const session = await apiFetch<SessionResponse>('/api/al-mulakhkhis/sessions', {
          method: 'POST',
          body: JSON.stringify(createBody),
        });
        goToSession(session.id);
        return;
      }

      if (source === 'kindle-clippings') {
        // File path — read locally and reuse the JSON endpoint.
        const text = await file.text();
        const body = buildCommonBody({ clippings: text });
        const session = await apiFetch<SessionResponse>('/api/al-mulakhkhis/sources/kindle-clippings', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        goToSession(session.id);
        return;
      }

      if (source === 'kindle-book') {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('language', sessionLanguage);
        fd.append('readingMode', sessionMode);
        const override = sessionMindOverride.trim();
        if (override && override !== mindBlock.trim()) fd.append('mindOverride', override);
        const res = await fetch(`${API_BASE_URL}/api/al-mulakhkhis/sources/kindle-book`, {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || `Upload failed: ${res.status}`);
        }
        const session = (await res.json()) as SessionResponse;
        goToSession(session.id);
        return;
      }

      if (source === 'camera') {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('language', sessionLanguage);
        fd.append('readingMode', sessionMode);
        const override = sessionMindOverride.trim();
        if (override && override !== mindBlock.trim()) fd.append('mindOverride', override);
        const res = await fetch(`${API_BASE_URL}/api/al-mulakhkhis/sources/screenshot`, {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || `Upload failed: ${res.status}`);
        }
        const session = (await res.json()) as SessionResponse;
        goToSession(session.id);
        return;
      }

      throw new Error(`Unsupported upload source: ${source}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <BookOpen size={24} className="text-on-surface-secondary" />
        <h1 className="text-xl font-semibold text-on-surface">
          {isRTL ? 'المُلخِّص — رفيق القراءة' : 'Al-Mulakhkhis — Reading Companion'}
        </h1>
      </div>
      <p className="text-sm text-on-surface-secondary mb-8">
        {isRTL
          ? 'اختر مصدر المادة التي تود أن يساعدك المُلخِّص في قراءتها وتحليلها.'
          : 'Pick a source and Al-Mulakhkhis will help you read and analyze it, page by page.'}
      </p>

      {/* Phase 5: Library entity pre-reading gate */}
      <div className="mb-6 rounded-xl border border-border bg-surface-secondary/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider">
            {isRTL ? 'ربط بكيان في المكتبة (موصى به)' : 'Link to Library Entity (recommended)'}
          </p>
          {!linkedEntity && !skipEntityGate && (
            <button onClick={() => setSkipEntityGate(true)}
              className="text-[11px] text-on-surface-tertiary hover:text-on-surface underline">
              {isRTL ? 'تخطّ' : 'Skip'}
            </button>
          )}
        </div>
        {linkedEntity ? (
          <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface truncate">{linkedEntity.title}</p>
              <p className="text-[11px] text-on-surface-tertiary">{linkedEntity.type}</p>
            </div>
            <button onClick={() => { setLinkedEntity(null); setEntitySearch(''); }}
              className="text-on-surface-tertiary hover:text-error shrink-0">
              <X size={14} />
            </button>
          </div>
        ) : skipEntityGate ? (
          <div className="flex items-center gap-2 text-xs text-on-surface-tertiary">
            <span>{isRTL ? 'ستُبدأ الجلسة بدون ربط.' : 'Session will start without a library link.'}</span>
            <button onClick={() => setSkipEntityGate(false)} className="text-accent hover:underline">
              {isRTL ? 'ربط' : 'Link one'}
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              value={entitySearch}
              onChange={e => { setEntitySearch(e.target.value); setEntitySearchOpen(true); }}
              onFocus={() => setEntitySearchOpen(true)}
              placeholder={isRTL ? 'ابحث في المكتبة...' : 'Search library entities...'}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {entitySearchOpen && entityResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg z-10 divide-y divide-border">
                {entityResults.map(e => (
                  <button key={e.id}
                    onClick={() => { setLinkedEntity(e); setEntitySearch(e.title); setEntitySearchOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-start hover:bg-surface-secondary">
                    <span className="flex-1 truncate text-on-surface">{e.title}</span>
                    <span className="text-[10px] text-on-surface-tertiary shrink-0">{e.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {SOURCES.map((s) => {
          const Icon = s.icon;
          const isActive = selected === s.id;
          return (
            <button
              key={s.id}
              disabled={s.disabled}
              onClick={async () => {
                if (s.id === 'screen-capture') {
                  router.push('/al-mulakhkhis/capture');
                  return;
                }
                if (s.id === 'standalone') {
                  // Route to the dedicated standalone editor (not the page-by-page reader)
                  router.push('/al-mulakhkhis/standalone');
                  return;
                }
                setSelected(isActive ? null : s.id);
                if (s.id === 'zotero' && !isActive && !zLoaded) loadZotero();
              }}
              className={cn(
                'relative text-start p-4 rounded-[var(--radius-lg)] border transition-colors',
                s.disabled
                  ? 'border-border bg-surface-secondary/30 opacity-60 cursor-not-allowed'
                  : isActive
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-border-hover hover:bg-surface-secondary/40'
              )}
            >
              <div className="flex items-start gap-3">
                <Icon size={20} className={cn('shrink-0 mt-0.5', isActive ? 'text-accent' : 'text-on-surface-secondary')} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-on-surface">{s.label[language]}</p>
                  <p className="text-xs text-on-surface-tertiary mt-0.5">{s.desc[language]}</p>
                </div>
              </div>
              {s.disabled && (
                <span className="absolute top-2 end-2 text-[10px] px-1.5 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary">
                  {isRTL ? 'قريبًا' : 'Coming soon'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && !SOURCES.find((s) => s.id === selected)?.disabled && (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface-secondary/30 p-4 mb-6 space-y-3">
          {selected === 'zotero' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-on-surface-secondary">
                  {isRTL ? 'اختر عنصرًا من مكتبة زوتيرو' : 'Pick an item from your Zotero library'}
                </label>
                <button
                  onClick={() => loadZotero(zSelectedCol || undefined)}
                  className="text-xs text-on-surface-tertiary hover:text-on-surface flex items-center gap-1"
                  title={isRTL ? 'تحديث' : 'Refresh'}
                >
                  <RefreshCw size={12} className={zLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              <div className="flex gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={13} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-on-surface-tertiary" />
                  <input
                    value={zSearch}
                    onChange={(e) => setZSearch(e.target.value)}
                    placeholder={isRTL ? 'ابحث بالعنوان أو المؤلف...' : 'Search by title or author...'}
                    className="w-full h-9 ps-8 pe-3 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                {zCollections.length > 0 && (
                  <select
                    value={zSelectedCol}
                    onChange={(e) => { setZSelectedCol(e.target.value); loadZotero(e.target.value || undefined); }}
                    className="h-9 px-3 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface focus:outline-none"
                  >
                    <option value="">{isRTL ? 'كل المجموعات' : 'All collections'}</option>
                    {zCollections.map((c) => (
                      <option key={c.key} value={c.key}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {zError && (
                <div className="text-xs text-error bg-error/10 px-3 py-2 rounded-lg">{zError}</div>
              )}

              <div className="max-h-80 overflow-y-auto rounded-[var(--radius)] border border-border bg-surface divide-y divide-border">
                {zLoading && zItems.length === 0 && (
                  <div className="flex items-center gap-2 justify-center py-8 text-on-surface-tertiary text-sm">
                    <Loader2 size={14} className="animate-spin" />
                    {isRTL ? 'جاري تحميل زوتيرو...' : 'Loading Zotero...'}
                  </div>
                )}
                {!zLoading && zItems.length === 0 && (
                  <div className="text-center py-8 text-on-surface-tertiary text-sm">
                    {isRTL ? 'لا توجد عناصر' : 'No items'}
                  </div>
                )}
                {zItems
                  .filter((it) => {
                    if (!zSearch.trim()) return true;
                    const q = zSearch.toLowerCase();
                    return (it.title || '').toLowerCase().includes(q) || (it.authors || '').toLowerCase().includes(q);
                  })
                  .slice(0, 200)
                  .map((it) => (
                    <button
                      key={it.itemKey}
                      disabled={submitting || zPicking !== null}
                      onClick={async () => {
                        setZPicking(it.itemKey);
                        try { await submit('zotero', { zoteroKey: it.itemKey }); }
                        finally { setZPicking(null); }
                      }}
                      className="w-full text-start flex items-center gap-3 px-3 py-2.5 hover:bg-surface-secondary disabled:opacity-50 transition-colors"
                    >
                      <Library size={14} className="text-on-surface-tertiary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{it.title}</p>
                        <p className="text-[11px] text-on-surface-tertiary truncate">
                          {it.authors}{it.year ? ` · ${it.year}` : ''}{it.itemType ? ` · ${it.itemType}` : ''}
                        </p>
                      </div>
                      {zPicking === it.itemKey && <Loader2 size={13} className="animate-spin text-accent shrink-0" />}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {selected === 'link' && (
            <div className="space-y-2">
              <label className="text-xs text-on-surface-secondary block">
                {isRTL ? 'رابط المصدر' : 'Source URL'}
              </label>
              <input
                type="url"
                value={directUrl}
                onChange={(e) => setDirectUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                disabled={!directUrl.trim() || submitting}
                onClick={() => submit('link', { url: directUrl.trim() })}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {isRTL ? 'ابدأ القراءة' : 'Start Reading'}
              </button>
            </div>
          )}

          {selected === 'drive' && (
            <div className="space-y-2">
              <label className="text-xs text-on-surface-secondary block">
                {isRTL ? 'رابط مشاركة عام من درايف' : 'Public Drive share link'}
              </label>
              <input
                type="url"
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/.../view"
                className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-[11px] text-on-surface-tertiary">
                {isRTL
                  ? 'تأكّد من أن الرابط عام (Anyone with the link). الملفات الخاصة تتطلب OAuth ولم تُدعم بعد.'
                  : 'Make sure the link is public (Anyone with the link). OAuth-based private files are not yet supported.'}
              </p>
              <button
                disabled={!driveUrl.trim() || submitting}
                onClick={() => submit('drive', { publicUrl: driveUrl.trim() })}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {isRTL ? 'ابدأ القراءة' : 'Start Reading'}
              </button>
            </div>
          )}

          {selected === 'kindle-clippings' && (
            <div className="space-y-2">
              <label className="text-xs text-on-surface-secondary block">
                {isRTL ? 'ألصق محتوى My Clippings.txt' : 'Paste My Clippings.txt content'}
              </label>
              <textarea
                value={clippingsText}
                onChange={(e) => setClippingsText(e.target.value)}
                rows={6}
                dir="auto"
                className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
                placeholder={isRTL ? 'ألصق المقاطع هنا...' : 'Paste clippings here...'}
              />
              <div className="flex flex-wrap gap-2">
                <input
                  ref={clippingsFileRef}
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) submitFile(f, 'kindle-clippings');
                    if (clippingsFileRef.current) clippingsFileRef.current.value = '';
                  }}
                />
                <button
                  onClick={() => clippingsFileRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-[var(--radius)] text-sm bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary transition-colors"
                >
                  <Upload size={14} />
                  {isRTL ? 'رفع ملف بدلاً من ذلك' : 'Upload file instead'}
                </button>
                <button
                  disabled={!clippingsText.trim() || submitting}
                  onClick={() => submit('kindle-clippings', { clippings: clippingsText })}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {isRTL ? 'ابدأ القراءة' : 'Start Reading'}
                </button>
              </div>
            </div>
          )}

          {selected === 'kindle-book' && (
            <div className="space-y-2">
              <p className="text-xs text-on-surface-secondary">
                {isRTL
                  ? 'ارفع ملف EPUB أو TXT. لملفات MOBI/AZW3 استخدم Calibre للتحويل أولًا.'
                  : 'Upload an EPUB or TXT file. For MOBI/AZW3, convert with Calibre first.'}
              </p>
              <input
                ref={kindleBookRef}
                type="file"
                accept=".epub,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) submitFile(f, 'kindle-book');
                  if (kindleBookRef.current) kindleBookRef.current.value = '';
                }}
              />
              <button
                disabled={submitting}
                onClick={() => kindleBookRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {isRTL ? 'اختر ملف الكتاب' : 'Choose book file'}
              </button>
            </div>
          )}

          {selected === 'pdf' && (
            <div className="space-y-2">
              <p className="text-xs text-on-surface-secondary">
                {isRTL ? 'ارفع ملف PDF من جهازك.' : 'Upload a PDF from your computer.'}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) submitFile(f, 'pdf');
                  if (fileRef.current) fileRef.current.value = '';
                }}
              />
              <button
                disabled={submitting}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {isRTL ? 'اختر ملف PDF' : 'Choose PDF file'}
              </button>
            </div>
          )}

          {selected === 'camera' && (
            <div className="space-y-2">
              <p className="text-xs text-on-surface-secondary">
                {isRTL
                  ? 'ارفع لقطة شاشة أو صورة صفحة (PNG / JPG / WEBP). سيتم التحليل بواسطة Vision عند الفتح.'
                  : 'Upload a screenshot or page photo (PNG / JPG / WEBP). Analyze with Vision from the reading page.'}
              </p>
              <input
                ref={screenshotRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) submitFile(f, 'camera');
                  if (screenshotRef.current) screenshotRef.current.value = '';
                }}
              />
              <button
                disabled={submitting}
                onClick={() => screenshotRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                {isRTL ? 'اختر صورة' : 'Choose image'}
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-[var(--radius)] border border-error/30 bg-error/10 text-error text-xs px-3 py-2 mb-6">
          {error}
        </div>
      )}

      <div className="rounded-[var(--radius-lg)] border border-border overflow-hidden">
        <button
          onClick={() => setCustomizeOpen(!customizeOpen)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-secondary/40 transition-colors text-start"
        >
          <span className="text-sm font-medium text-on-surface">
            {isRTL ? 'تخصيص لهذه الجلسة' : 'Customize for this reading'}
          </span>
          {customizeOpen ? (
            <ChevronUp size={16} className="text-on-surface-tertiary" />
          ) : (
            <ChevronDown size={16} className="text-on-surface-tertiary" />
          )}
        </button>

        {customizeOpen && (
          <div className="border-t border-border px-4 py-4 space-y-4 bg-surface-secondary/20">
            <div>
              <p className="text-xs font-medium text-on-surface-secondary mb-2">
                {isRTL ? 'وضع القراءة' : 'Reading mode'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  {
                    id: 'rolling' as const,
                    en: 'Rolling synthesis (default)',
                    ar: 'خلاصة تراكمية (افتراضي)',
                  },
                  { id: 'page' as const, en: 'Page-by-page', ar: 'صفحة صفحة' },
                  {
                    id: 'full' as const,
                    en: 'Full context (10× cost)',
                    ar: 'الكاتب الكامل (تكلفة ×10)',
                  },
                  {
                    id: 'tac' as const,
                    en: 'Skim (title+abstract+conclusion)',
                    ar: 'تصفح سريع (عنوان + ملخص + خلاصة)',
                  },
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSessionMode(opt.id)}
                    className={cn(
                      'text-start px-3 py-2 rounded-[var(--radius)] text-xs border transition-colors',
                      sessionMode === opt.id
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
                    )}
                  >
                    {isRTL ? opt.ar : opt.en}
                  </button>
                ))}
              </div>
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
              <p className="text-[11px] text-on-surface-tertiary mt-1.5">
                {isRTL
                  ? 'الإنجليزية هي الافتراضية؛ يمكنك اختيار العربية لهذه الجلسة فقط.'
                  : 'English is the default; Arabic is optional for this session only.'}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-on-surface-secondary mb-2">
                {isRTL ? 'ما الذي يضعه المُلخِّص في الحسبان' : 'What Al-Mulakhkhis keeps in mind'}
              </p>
              <textarea
                value={sessionMindOverride}
                onChange={(e) => setSessionMindOverride(e.target.value)}
                rows={5}
                dir="auto"
                placeholder={
                  isRTL
                    ? 'مثلاً: أركز على أبحاث BIM في قطاع المقاولات الكويتي...'
                    : 'e.g. I focus on BIM research in the Kuwaiti contracting sector...'
                }
                className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring resize-y leading-relaxed"
              />
              <p className="text-[11px] text-on-surface-tertiary mt-1.5">
                {isRTL
                  ? 'يبدأ من إعداداتك الافتراضية — عدّل بحرية لهذه الجلسة دون أن يتغير الافتراضي.'
                  : 'Starts from your default settings — edit freely for this session without changing the default.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
