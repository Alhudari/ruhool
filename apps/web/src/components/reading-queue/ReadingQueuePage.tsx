'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen, Loader2, Check, Play, Pause, X, Filter, ArrowUpDown,
  ChevronUp, ChevronDown, Pencil, ExternalLink, RefreshCw, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

type Status = 'To Read' | 'Reading' | 'Read' | 'Skip';
type Priority = 'high' | 'medium' | 'low';

interface Paper {
  path: string;
  name: string;
  citekey?: string;
  type?: string;
  year?: number;
  authors?: string;
  tags?: string[];
  readingStatus: string;
  readingPriority?: Priority;
  readingOrder?: number;
  notesExported: boolean;
  myNotes?: string;
  startedAt?: string;
  finishedAt?: string;
  zoteroItemKey?: string;
}

const STATUS_CONFIG: Record<Status, { color: string; bg: string; ar: string; en: string }> = {
  'To Read': { color: 'text-warning', bg: 'bg-warning/15', ar: 'للقراءة', en: 'To Read' },
  'Reading': { color: 'text-info', bg: 'bg-info/15', ar: 'يُقرأ', en: 'Reading' },
  'Read':    { color: 'text-success', bg: 'bg-success/15', ar: 'مقروء', en: 'Read' },
  'Skip':    { color: 'text-on-surface-tertiary', bg: 'bg-surface-tertiary', ar: 'تخطّ', en: 'Skip' },
};

const PRIORITY_CONFIG: Record<Priority, { color: string; bg: string; ar: string; en: string; rank: number }> = {
  high:   { color: 'text-error', bg: 'bg-error/15', ar: 'عالية', en: 'High', rank: 0 },
  medium: { color: 'text-warning', bg: 'bg-warning/15', ar: 'متوسطة', en: 'Medium', rank: 1 },
  low:    { color: 'text-on-surface-tertiary', bg: 'bg-surface-tertiary', ar: 'منخفضة', en: 'Low', rank: 2 },
};

type SortKey = 'priority' | 'order' | 'name' | 'year' | 'status';

export function ReadingQueuePage() {
  const router = useRouter();
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('To Read');
  const [sort, setSort] = useState<SortKey>('priority');
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const load = () => {
    setLoading(true);
    setError(null);
    apiFetch<{ notes: Paper[] }>('/api/vault/literature')
      .then((d) => setPapers(d.notes))
      .catch((e) => setError(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Update a single paper's tracker fields and reload
  const update = async (paper: Paper, patch: Partial<{
    readingStatus: string;
    readingPriority: Priority | null;
    readingOrder: number | null;
    notesExported: boolean;
    myNotes: string;
  }>) => {
    try {
      const url = `/api/vault/literature/${paper.path.split('/').map(encodeURIComponent).join('/')}`;
      await apiFetch(url, { method: 'PATCH', body: JSON.stringify(patch) });
      // Optimistic update
      setPapers((prev) => prev.map((p) =>
        p.path === paper.path ? { ...p, ...patch } as Paper : p
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'update failed');
    }
  };

  const filtered = papers.filter((p) => statusFilter === 'all' ? true : p.readingStatus === statusFilter);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sort) {
        case 'priority': {
          const ra = a.readingPriority ? PRIORITY_CONFIG[a.readingPriority].rank : 99;
          const rb = b.readingPriority ? PRIORITY_CONFIG[b.readingPriority].rank : 99;
          return ra - rb;
        }
        case 'order': return (a.readingOrder ?? 9999) - (b.readingOrder ?? 9999);
        case 'name': return a.name.localeCompare(b.name);
        case 'year': return (b.year ?? 0) - (a.year ?? 0);
        case 'status': return a.readingStatus.localeCompare(b.readingStatus);
      }
    });
    return arr;
  }, [filtered, sort]);

  const stats = useMemo(() => {
    const s = { 'To Read': 0, 'Reading': 0, 'Read': 0, 'Skip': 0 } as Record<string, number>;
    for (const p of papers) s[p.readingStatus] = (s[p.readingStatus] ?? 0) + 1;
    return s;
  }, [papers]);

  const startReadingWithShwasha = (paper: Paper) => {
    update(paper, { readingStatus: 'Reading' });
    // Open Al-Mulakhkhis pre-filled with this paper's title
    if (paper.zoteroItemKey) {
      router.push(`/shwasha?source=zotero&zoteroItemKey=${paper.zoteroItemKey}`);
    } else {
      router.push('/shwasha');
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
      <div className="border-b border-border bg-surface-secondary px-6 md:px-10 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-accent" />
                <h1 className="text-xl md:text-2xl font-bold text-on-surface">
                  {isRTL ? 'قائمة القراءة' : 'Reading Queue'}
                </h1>
              </div>
              <p className="text-sm text-on-surface-tertiary mt-1">
                {isRTL
                  ? 'كل أوراقك الأكاديمية مع متابعة الأولوية، الترتيب، والملاحظات'
                  : 'All your papers with priority, order, and notes tracking'}
              </p>
            </div>
            <button
              onClick={load}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-tertiary text-on-surface-secondary"
            >
              <RefreshCw className="h-3 w-3" />
              {isRTL ? 'تحديث' : 'Refresh'}
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {(['To Read', 'Reading', 'Read', 'Skip'] as Status[]).map((s) => {
              const cfg = STATUS_CONFIG[s];
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(active ? 'all' : s)}
                  className={cn(
                    'rounded-xl border p-3 text-start transition-all',
                    active
                      ? cn(cfg.bg, 'border-current', cfg.color)
                      : 'border-border bg-surface text-on-surface hover:bg-surface-tertiary'
                  )}
                >
                  <p className="text-xl font-bold">{stats[s] ?? 0}</p>
                  <p className="text-[11px] uppercase tracking-wider mt-0.5 opacity-80">
                    {cfg[language]}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Filter + sort */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 text-xs">
              <Filter className="h-3 w-3 text-on-surface-tertiary" />
              <button
                onClick={() => setStatusFilter('all')}
                className={cn(
                  'px-2.5 py-1 rounded-full transition-colors',
                  statusFilter === 'all'
                    ? 'bg-accent text-on-accent'
                    : 'text-on-surface-tertiary bg-surface hover:bg-surface-tertiary'
                )}
              >
                {isRTL ? 'الكل' : 'All'} ({papers.length})
              </button>
            </div>
            <div className="flex items-center gap-1 text-xs ms-auto">
              <ArrowUpDown className="h-3 w-3 text-on-surface-tertiary" />
              {([
                { id: 'priority' as SortKey, ar: 'الأولوية', en: 'priority' },
                { id: 'order'    as SortKey, ar: 'الترتيب',  en: 'order' },
                { id: 'name'     as SortKey, ar: 'العنوان',  en: 'name' },
                { id: 'year'     as SortKey, ar: 'السنة',    en: 'year' },
                { id: 'status'   as SortKey, ar: 'الحالة',   en: 'status' },
              ]).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSort(s.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-full transition-colors',
                    sort === s.id
                      ? 'bg-accent/15 text-accent'
                      : 'text-on-surface-tertiary hover:bg-surface-tertiary'
                  )}
                >
                  {isRTL ? s.ar : s.en}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-6">
        {error && (
          <div className="mb-5 rounded-lg border border-warning bg-warning/10 px-4 py-3 text-sm text-warning">
            {error}
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-secondary p-16 text-center">
            <BookOpen className="h-12 w-12 text-on-surface-tertiary mx-auto mb-4 opacity-30" />
            <h3 className="text-base font-bold text-on-surface mb-2">
              {papers.length === 0
                ? (isRTL ? 'لا توجد أوراق بعد' : 'No papers yet')
                : (isRTL ? 'لا توجد أوراق في هذا التصفية' : 'No papers in this filter')}
            </h3>
            <p className="text-sm text-on-surface-tertiary max-w-md mx-auto">
              {isRTL
                ? 'أضف أوراقك في Zotero مجلد BIM_Kuwait_PhD، وستظهر هنا تلقائياً بعد مزامنتها مع Obsidian.'
                : "Add papers to Zotero collection BIM_Kuwait_PhD; they'll auto-appear here after Obsidian sync."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((p) => (
              <PaperRow
                key={p.path}
                paper={p}
                isRTL={isRTL}
                language={language}
                editingNote={editingNote === p.path}
                noteDraft={noteDraft}
                onEditNote={() => { setEditingNote(p.path); setNoteDraft(p.myNotes ?? ''); }}
                onCancelEditNote={() => { setEditingNote(null); setNoteDraft(''); }}
                onSaveNote={() => {
                  update(p, { myNotes: noteDraft });
                  setEditingNote(null);
                  setNoteDraft('');
                }}
                onNoteDraftChange={setNoteDraft}
                onStatusChange={(s) => update(p, { readingStatus: s })}
                onPriorityChange={(pr) => update(p, { readingPriority: pr })}
                onOrderChange={(o) => update(p, { readingOrder: o })}
                onToggleNotesExported={() => update(p, { notesExported: !p.notesExported })}
                onStartShwasha={() => startReadingWithShwasha(p)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
function PaperRow({
  paper, isRTL, language,
  editingNote, noteDraft,
  onEditNote, onCancelEditNote, onSaveNote, onNoteDraftChange,
  onStatusChange, onPriorityChange, onOrderChange, onToggleNotesExported, onStartShwasha,
}: {
  paper: Paper;
  isRTL: boolean;
  language: 'en' | 'ar';
  editingNote: boolean;
  noteDraft: string;
  onEditNote: () => void;
  onCancelEditNote: () => void;
  onSaveNote: () => void;
  onNoteDraftChange: (v: string) => void;
  onStatusChange: (s: Status) => void;
  onPriorityChange: (p: Priority | null) => void;
  onOrderChange: (n: number | null) => void;
  onToggleNotesExported: () => void;
  onStartShwasha: () => void;
}) {
  const statusCfg = STATUS_CONFIG[paper.readingStatus as Status] ?? STATUS_CONFIG['To Read'];
  const prioCfg = paper.readingPriority ? PRIORITY_CONFIG[paper.readingPriority] : null;

  return (
    <div className="rounded-xl border border-border bg-surface-secondary hover:border-border-hover transition-colors p-4">
      <div className="flex items-start gap-3">
        {/* Order number */}
        <div className="shrink-0 w-10">
          <input
            type="number"
            value={paper.readingOrder ?? ''}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              onOrderChange(v);
            }}
            placeholder="#"
            className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-center text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:border-accent"
          />
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-on-surface line-clamp-2">{paper.name}</h3>
          <div className="flex items-center gap-3 text-[11px] text-on-surface-tertiary mt-1 flex-wrap">
            {paper.authors && <span>{paper.authors.split(',')[0].trim()}</span>}
            {paper.year && <span>· {paper.year}</span>}
            {paper.type && <span>· {paper.type}</span>}
            {paper.startedAt && <span>· {isRTL ? 'بدأ' : 'started'} {paper.startedAt}</span>}
            {paper.finishedAt && <span>· {isRTL ? 'انتهى' : 'finished'} {paper.finishedAt}</span>}
          </div>

          {/* Pills row */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {/* Status switch */}
            <div className="flex items-center gap-0 border border-border rounded-md overflow-hidden">
              {(['To Read', 'Reading', 'Read', 'Skip'] as Status[]).map((s) => {
                const cfg = STATUS_CONFIG[s];
                const active = paper.readingStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => onStatusChange(s)}
                    className={cn(
                      'text-[10px] px-2 py-1 transition-colors',
                      active ? cn(cfg.bg, cfg.color, 'font-bold') : 'text-on-surface-tertiary hover:bg-surface-tertiary'
                    )}
                  >
                    {cfg[language]}
                  </button>
                );
              })}
            </div>

            {/* Priority switch */}
            <div className="flex items-center gap-0 border border-border rounded-md overflow-hidden">
              {(['high', 'medium', 'low'] as Priority[]).map((pr) => {
                const cfg = PRIORITY_CONFIG[pr];
                const active = paper.readingPriority === pr;
                return (
                  <button
                    key={pr}
                    onClick={() => onPriorityChange(active ? null : pr)}
                    className={cn(
                      'text-[10px] px-2 py-1 transition-colors',
                      active ? cn(cfg.bg, cfg.color, 'font-bold') : 'text-on-surface-tertiary hover:bg-surface-tertiary'
                    )}
                  >
                    {cfg[language]}
                  </button>
                );
              })}
            </div>

            {/* Notes exported */}
            <button
              onClick={onToggleNotesExported}
              className={cn(
                'flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border transition-colors',
                paper.notesExported
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-border text-on-surface-tertiary hover:bg-surface-tertiary'
              )}
            >
              <Check className="h-3 w-3" />
              {isRTL ? 'مُلاحظات مستخرجة' : 'Notes exported'}
            </button>
          </div>

          {/* My notes section */}
          {editingNote ? (
            <div className="mt-3 space-y-2">
              <textarea
                value={noteDraft}
                onChange={(e) => onNoteDraftChange(e.target.value)}
                placeholder={isRTL ? 'ملاحظاتك الشخصية على هذه الورقة...' : 'Your personal notes on this paper...'}
                rows={3}
                autoFocus
                className="w-full bg-surface border border-accent rounded p-2 text-xs text-on-surface placeholder:text-on-surface-tertiary focus:outline-none resize-none"
              />
              <div className="flex justify-end gap-1">
                <button onClick={onCancelEditNote} className="text-[10px] px-2 py-1 rounded text-on-surface-tertiary hover:text-on-surface-secondary">
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
                <button onClick={onSaveNote} className="text-[10px] px-2 py-1 rounded bg-accent text-on-accent">
                  {isRTL ? 'حفظ' : 'Save'}
                </button>
              </div>
            </div>
          ) : paper.myNotes ? (
            <button onClick={onEditNote} className="mt-3 w-full text-start group">
              <p className="text-xs text-on-surface-secondary leading-snug bg-surface-tertiary rounded-lg p-2 group-hover:bg-surface transition-colors">
                <span className="text-on-surface-tertiary text-[10px] uppercase tracking-wider me-1">{isRTL ? 'ملاحظتي:' : 'Note:'}</span>
                {paper.myNotes}
              </p>
            </button>
          ) : null}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={onStartShwasha}
            title={isRTL ? 'ابدأ القراءة مع المُلخِّص' : 'Read with Al-Mulakhkhis'}
            className="h-8 w-8 rounded-lg flex items-center justify-center bg-info/15 text-info hover:bg-info/25 transition-colors"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
          {!editingNote && (
            <button
              onClick={onEditNote}
              title={isRTL ? 'عدّل ملاحظتي' : 'Edit my note'}
              className="h-8 w-8 rounded-lg flex items-center justify-center bg-surface text-on-surface-tertiary hover:bg-surface-tertiary border border-border transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <a
            href={`obsidian://open?vault=PhD&file=${paper.path.split('/').map(encodeURIComponent).join('/').replace(/\.md$/, '')}`}
            target="_self"
            title={isRTL ? 'افتح في Obsidian' : 'Open in Obsidian'}
            className="h-8 w-8 rounded-lg flex items-center justify-center bg-surface text-on-surface-tertiary hover:bg-surface-tertiary border border-border transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
