'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Search, Loader2, BookOpen, Brain, Calendar, FileText, Inbox,
  Filter, ExternalLink, Database, Clock, X,
} from 'lucide-react';

const HISTORY_KEY = 'ruhool.search.history';
const MAX_HISTORY = 50;

interface SearchHistoryEntry { id: string; query: string; timestamp: string; resultCount: number }

function loadHistory(): SearchHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}

function saveHistory(entries: SearchHistoryEntry[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
}
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface SearchHit {
  kind: string;
  path?: string;
  title: string;
  snippet: string;
  matchScore: number;
  meta?: Record<string, unknown>;
}

const KIND_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  paper:   { icon: BookOpen, color: 'text-info bg-info/10' },
  book:    { icon: BookOpen, color: 'text-warning bg-warning/10' },
  atomic:  { icon: Brain, color: 'text-accent bg-accent/10' },
  meeting: { icon: Calendar, color: 'text-warning bg-warning/10' },
  note:    { icon: FileText, color: 'text-on-surface-secondary bg-surface-tertiary' },
  memory:  { icon: Brain, color: 'text-success bg-success/10' },
  inbox:   { icon: Inbox, color: 'text-accent bg-accent/10' },
  misc:    { icon: Database, color: 'text-on-surface-tertiary bg-surface-tertiary' },
};

const VAULT_NAME = 'Ruhool';

export function SearchPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'phd' | 'all'>('phd');
  const [kind, setKind] = useState<string>('all');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [history, setHistory] = useState<SearchHistoryEntry[]>(() => loadHistory());

  const addToHistory = useCallback((query: string, resultCount: number) => {
    setHistory(prev => {
      const filtered = prev.filter(e => e.query !== query);
      const entry: SearchHistoryEntry = {
        id: Date.now().toString(),
        query,
        timestamp: new Date().toISOString(),
        resultCount,
      };
      const next = [entry, ...filtered].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  const deleteHistoryEntry = useCallback((id: string) => {
    setHistory(prev => {
      const next = prev.filter(e => e.id !== id);
      saveHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  const search = useCallback(async () => {
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({ q, scope });
      if (kind !== 'all') params.set('kind', kind);
      const res = await apiFetch<{ hits: SearchHit[] }>(`/api/search?${params}`);
      setHits(res.hits);
      addToHistory(q.trim(), res.hits.length);
    } catch { /* ignore */ }
    setSearching(false);
  }, [q, scope, kind, addToHistory]);

  // Debounced search on input change
  useEffect(() => {
    const t = setTimeout(() => { if (q.trim().length >= 2) search(); else setHits([]); }, 300);
    return () => clearTimeout(t);
  }, [q, scope, kind, search]);

  return (
    <div className="flex-1 overflow-y-auto bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-4xl mx-auto px-6 md:px-10 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-5 w-5 text-accent" />
            <h1 className="text-2xl font-bold text-on-surface">
              {isRTL ? 'البحث الذكي' : 'Smart Search'}
            </h1>
          </div>
          <p className="text-sm text-on-surface-tertiary">
            {isRTL ? 'ابحث في كل محتواك — أوراق، ملاحظات، اجتماعات، ذاكرة' : 'Search across all your content — papers, notes, meetings, memory'}
          </p>
        </div>

        {/* Search input */}
        <div className="relative mb-4">
          <Search className={cn('absolute top-1/2 -translate-y-1/2 h-5 w-5 text-on-surface-tertiary', isRTL ? 'right-4' : 'left-4')} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setTimeout(() => setInputFocused(false), 200)}
            placeholder={isRTL ? 'اكتب كلمات البحث...' : 'Type to search...'}
            autoFocus
            className={cn(
              'w-full bg-surface-secondary border-2 border-border rounded-xl py-3 text-base text-on-surface focus:outline-none focus:border-accent transition-colors',
              isRTL ? 'pr-12 pl-4' : 'pl-12 pr-4'
            )}
          />
          {/* History dropdown — shown when focused and query is empty */}
          {inputFocused && !q.trim() && history.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-lg z-20 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <span className="text-xs text-on-surface-tertiary">
                  {isRTL ? 'بحث سابق' : 'Recent searches'}
                </span>
                <button onClick={clearHistory} className="text-xs text-accent hover:underline">
                  {isRTL ? 'مسح الكل' : 'Clear all'}
                </button>
              </div>
              <ul className="max-h-64 overflow-y-auto divide-y divide-border">
                {history.slice(0, 10).map(e => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-secondary transition-colors">
                    <Clock className="h-3.5 w-3.5 text-on-surface-tertiary shrink-0" />
                    <button
                      className="flex-1 text-sm text-start text-on-surface-secondary hover:text-on-surface"
                      onClick={() => { setQ(e.query); setInputFocused(false); }}
                    >
                      {e.query}
                    </button>
                    <span className="text-[10px] text-on-surface-tertiary">{e.resultCount} {isRTL ? 'نتيجة' : 'results'}</span>
                    <button
                      onClick={() => deleteHistoryEntry(e.id)}
                      className="text-on-surface-tertiary hover:text-error shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-1 text-xs">
            <Filter className="h-3 w-3 text-on-surface-tertiary" />
            <span className="text-on-surface-tertiary">{isRTL ? 'النطاق:' : 'Scope:'}</span>
            {(['phd', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={cn('px-2.5 py-1 rounded-full transition-colors',
                  scope === s ? 'bg-accent text-on-accent' : 'text-on-surface-tertiary bg-surface-secondary hover:bg-surface-tertiary')}
              >
                {s === 'phd' ? (isRTL ? 'دكتوراه فقط' : 'PhD only') : (isRTL ? 'الكل' : 'Everything')}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-on-surface-tertiary">{isRTL ? 'النوع:' : 'Kind:'}</span>
            {['all', 'paper', 'book', 'atomic', 'meeting', 'memory', 'inbox'].map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn('px-2.5 py-1 rounded-full transition-colors',
                  kind === k ? 'bg-accent/15 text-accent' : 'text-on-surface-tertiary bg-surface-secondary hover:bg-surface-tertiary')}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {searching ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-on-surface-tertiary" />
          </div>
        ) : q.trim().length < 2 ? (
          <div className="text-center py-12 text-sm text-on-surface-tertiary">
            {isRTL ? 'اكتب حرفين على الأقل للبحث' : 'Type at least 2 characters'}
          </div>
        ) : hits.length === 0 ? (
          <div className="text-center py-12 text-sm text-on-surface-tertiary">
            {isRTL ? 'لا نتائج' : 'No results'}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-on-surface-tertiary mb-2">
              {isRTL ? `${hits.length} نتيجة` : `${hits.length} results`}
            </p>
            {hits.map((h, i) => {
              const cfg = KIND_ICONS[h.kind] ?? KIND_ICONS.misc;
              const Icon = cfg.icon;
              const obsidianUrl = h.path ? `obsidian://open?vault=${VAULT_NAME}&file=${h.path.split('/').map(encodeURIComponent).join('/').replace(/\.md$/, '')}` : null;
              return (
                <div key={i} className="rounded-lg border border-border bg-surface-secondary p-3 hover:border-border-hover transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', cfg.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-on-surface">{h.title}</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-tertiary text-on-surface-tertiary uppercase">{h.kind}</span>
                      </div>
                      {h.snippet && (
                        <p className="text-xs text-on-surface-secondary mt-1 leading-relaxed">{h.snippet}</p>
                      )}
                      {h.path && (
                        <p className="text-[10px] text-on-surface-tertiary mt-1 font-mono break-all">{h.path}</p>
                      )}
                    </div>
                    {obsidianUrl && (
                      <a href={obsidianUrl} target="_self" className="text-on-surface-tertiary hover:text-accent shrink-0">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
