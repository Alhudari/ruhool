'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Search, Plus, RefreshCw, X, ExternalLink,
  BookOpen, Book, GraduationCap, Building2, Mic, User, Globe, Box,
  Database, FileText, ScrollText, Scale,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface Source {
  kind: string;
  kindAr: string;
  kindEn: string;
  path: string;
  name: string;
  title?: string;
  year?: number;
  authors?: string;
  status?: string;
  preview?: string;
  meta: Record<string, unknown>;
  mtime: number;
}

interface SourcesResponse {
  sources: Source[];
  total: number;
  byKind: Record<string, { count: number; ar: string; en: string }>;
}

const KIND_ICONS: Record<string, React.ElementType> = {
  paper: BookOpen,
  book: Book,
  course: GraduationCap,
  report: FileText,
  thesis: ScrollText,
  standard: Scale,
  'case-study': Building2,
  conference: Mic,
  person: User,
  org: Globe,
  misc: Box,
};

const KIND_COLORS: Record<string, { color: string; bg: string }> = {
  paper:        { color: 'text-info', bg: 'bg-info/15' },
  book:         { color: 'text-warning', bg: 'bg-warning/15' },
  course:       { color: 'text-success', bg: 'bg-success/15' },
  report:       { color: 'text-on-surface-secondary', bg: 'bg-surface-tertiary' },
  thesis:       { color: 'text-accent', bg: 'bg-accent/15' },
  standard:     { color: 'text-warning', bg: 'bg-warning/15' },
  'case-study': { color: 'text-error', bg: 'bg-error/15' },
  conference:   { color: 'text-accent', bg: 'bg-accent/15' },
  person:       { color: 'text-info', bg: 'bg-info/15' },
  org:          { color: 'text-warning', bg: 'bg-warning/15' },
  misc:         { color: 'text-on-surface-tertiary', bg: 'bg-surface-tertiary' },
};

const VAULT_NAME = 'Ruhool';

export function SourcesPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [data, setData] = useState<SourcesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  // Add form state
  const [newKind, setNewKind] = useState('paper');
  const [newTitle, setNewTitle] = useState('');
  const [newMetaJson, setNewMetaJson] = useState('');
  const [adding, setAdding] = useState(false);

  const load = () => {
    setLoading(true); setError(null);
    apiFetch<SourcesResponse>('/api/sources')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!data) return [] as Source[];
    let arr = data.sources;
    if (kindFilter !== 'all') arr = arr.filter((s) => s.kind === kindFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter((s) =>
        (s.title ?? s.name).toLowerCase().includes(q) ||
        (s.authors ?? '').toLowerCase().includes(q) ||
        (s.preview ?? '').toLowerCase().includes(q)
      );
    }
    return arr;
  }, [data, kindFilter, search]);

  const submitAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      let meta = {};
      if (newMetaJson.trim()) {
        try { meta = JSON.parse(newMetaJson); } catch { /* ignore */ }
      }
      await apiFetch('/api/sources', {
        method: 'POST',
        body: JSON.stringify({ kind: newKind, title: newTitle.trim(), meta }),
      });
      setShowAdd(false);
      setNewTitle('');
      setNewMetaJson('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'add failed');
    } finally {
      setAdding(false);
    }
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-surface">
      <Loader2 className="h-7 w-7 animate-spin text-on-surface-tertiary" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="border-b border-border bg-surface-secondary px-6 md:px-10 py-6 sticky top-0 z-10 backdrop-blur-sm bg-surface-secondary/95">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-accent" />
                <h1 className="text-xl md:text-2xl font-bold text-on-surface">
                  {isRTL ? 'مركز المصادر' : 'Sources Hub'}
                </h1>
              </div>
              <p className="text-sm text-on-surface-tertiary mt-1">
                {isRTL
                  ? 'كل ما يدخل بحثك من مصادر — أوراق، كتب، كورسات، حالات دراسية، مؤتمرات، أشخاص، منظمات'
                  : 'Every input to your research — papers, books, courses, case studies, conferences, people, organisations'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent text-on-accent hover:bg-accent-hover"
              >
                <Plus className="h-3 w-3" />
                {isRTL ? 'مصدر جديد' : 'New source'}
              </button>
              <button
                onClick={load}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-tertiary text-on-surface-secondary"
              >
                <RefreshCw className="h-3 w-3" />
                {isRTL ? 'تحديث' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <Search className={cn('absolute top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-tertiary', isRTL ? 'right-3' : 'left-3')} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isRTL ? 'بحث في كل المصادر...' : 'Search all sources...'}
                className={cn('w-full bg-surface border border-border rounded-lg py-2 text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:border-accent', isRTL ? 'pr-10 pl-3' : 'pl-10 pr-3')}
              />
            </div>
          </div>

          {/* Kind filter pills */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setKindFilter('all')}
              className={cn(
                'text-xs px-3 py-1 rounded-full transition-colors',
                kindFilter === 'all' ? 'bg-accent text-on-accent' : 'text-on-surface-tertiary bg-surface hover:bg-surface-tertiary'
              )}
            >
              {isRTL ? 'الكل' : 'All'} ({data?.total ?? 0})
            </button>
            {data && Object.entries(data.byKind).map(([kind, info]) => {
              const Icon = KIND_ICONS[kind] ?? Box;
              const cfg = KIND_COLORS[kind];
              const active = kindFilter === kind;
              return (
                <button
                  key={kind}
                  onClick={() => setKindFilter(active ? 'all' : kind)}
                  disabled={info.count === 0}
                  className={cn(
                    'flex items-center gap-1.5 text-xs px-3 py-1 rounded-full transition-colors',
                    active ? cn(cfg.bg, cfg.color) : 'text-on-surface-secondary bg-surface hover:bg-surface-tertiary',
                    info.count === 0 && 'opacity-40'
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {info[language]} ({info.count})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-6">
        {error && (
          <div className="mb-5 rounded-lg border border-warning bg-warning/10 px-4 py-3 text-sm text-warning">
            {error}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-secondary p-16 text-center">
            <Database className="h-12 w-12 text-on-surface-tertiary mx-auto mb-4 opacity-30" />
            <h3 className="text-base font-bold text-on-surface mb-2">
              {data?.total === 0
                ? (isRTL ? 'لا توجد مصادر بعد' : 'No sources yet')
                : (isRTL ? 'لا توجد نتائج' : 'No results')}
            </h3>
            <p className="text-sm text-on-surface-tertiary max-w-md mx-auto">
              {isRTL
                ? 'أضف أول مصدر — ورقة، كتاب، كورس، حالة دراسية، مؤتمر، شخصية، أو منظمة.'
                : 'Add your first source — paper, book, course, case study, conference, person, or organisation.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((s) => {
              const Icon = KIND_ICONS[s.kind] ?? Box;
              const cfg = KIND_COLORS[s.kind];
              const obsidianUrl = `obsidian://open?vault=${VAULT_NAME}&file=${s.path.split('/').map(encodeURIComponent).join('/').replace(/\.md$/, '')}`;
              return (
                <div key={s.path} className="rounded-xl border border-border bg-surface-secondary hover:border-border-hover transition-colors p-4 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', cfg.bg, cfg.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-on-surface line-clamp-2">{s.title || s.name}</h3>
                      <div className="flex items-center gap-2 text-[11px] text-on-surface-tertiary mt-0.5">
                        <span className={cn('px-1.5 py-0.5 rounded', cfg.bg, cfg.color)}>{s[`kind${isRTL ? 'Ar' : 'En'}`]}</span>
                        {s.year && <span>· {s.year}</span>}
                        {s.authors && <span className="truncate">· {s.authors.split(',')[0].trim()}</span>}
                      </div>
                    </div>
                  </div>
                  {s.preview && (
                    <p className="text-xs text-on-surface-secondary leading-snug line-clamp-3">{s.preview}</p>
                  )}
                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-border">
                    {s.status && (
                      <span className="text-[10px] text-on-surface-tertiary">{s.status}</span>
                    )}
                    <a
                      href={obsidianUrl}
                      target="_self"
                      title={isRTL ? 'فتح في Obsidian' : 'Open in Obsidian'}
                      className="ms-auto text-on-surface-tertiary hover:text-accent"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}
        >
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-on-surface">
                {isRTL ? 'مصدر جديد' : 'New source'}
              </h2>
              <button onClick={() => setShowAdd(false)} className="text-on-surface-tertiary hover:text-on-surface">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[11px] text-on-surface-tertiary mb-1 block">{isRTL ? 'النوع' : 'Kind'}</label>
                <div className="flex flex-wrap gap-1">
                  {data && Object.entries(data.byKind).map(([k, info]) => {
                    const Icon = KIND_ICONS[k] ?? Box;
                    const cfg = KIND_COLORS[k];
                    const active = newKind === k;
                    return (
                      <button
                        key={k}
                        onClick={() => setNewKind(k)}
                        className={cn(
                          'flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
                          active ? cn(cfg.bg, cfg.color, 'border-current') : 'border-border text-on-surface-secondary hover:bg-surface-tertiary'
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {info[language]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-on-surface-tertiary mb-1 block">{isRTL ? 'العنوان' : 'Title'}</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={isRTL ? 'مثلاً: مشروع برج المراد، الكويت' : 'e.g., Al-Murad Tower Project, Kuwait'}
                  className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] text-on-surface-tertiary mb-1 block">
                  {isRTL ? 'بيانات إضافية (JSON اختياري)' : 'Extra metadata (JSON optional)'}
                </label>
                <textarea
                  value={newMetaJson}
                  onChange={(e) => setNewMetaJson(e.target.value)}
                  rows={4}
                  placeholder={`{\n  "Owner": "...",\n  "Value": "...",\n  "Year_completed": 2024\n}`}
                  className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2 text-xs text-on-surface font-mono focus:outline-none focus:border-accent resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowAdd(false)} className="text-xs px-3 py-1.5 rounded text-on-surface-tertiary hover:text-on-surface-secondary">
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={submitAdd}
                  disabled={!newTitle.trim() || adding}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-accent text-on-accent disabled:opacity-50"
                >
                  {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  {isRTL ? 'أضف' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
