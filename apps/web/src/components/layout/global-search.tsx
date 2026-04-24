'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, X, Command } from 'lucide-react';
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

const VAULT_NAME = 'Ruhool';

export function GlobalSearch() {
  const router = useRouter();
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  // Cmd/Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Debounced search
  const search = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setHits([]); return; }
    setSearching(true);
    try {
      const res = await apiFetch<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(query)}&scope=phd`);
      setHits(res.hits);
    } catch {}
    setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(q), 250);
    return () => clearTimeout(t);
  }, [q, search]);

  const openHit = (h: SearchHit) => {
    if (h.kind === 'memory') router.push('/companion');
    else if (h.kind === 'inbox') router.push('/inbox');
    else if (h.kind === 'meeting') router.push('/supervision');
    else if (h.kind === 'atomic') router.push('/notes');
    else if (h.path) {
      const url = `obsidian://open?vault=${VAULT_NAME}&file=${h.path.split('/').map(encodeURIComponent).join('/').replace(/\.md$/, '')}`;
      window.open(url, '_self');
    }
    setOpen(false);
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border hover:border-border-hover text-on-surface-tertiary hover:text-on-surface-secondary text-xs transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span>{isRTL ? 'بحث...' : 'Search...'}</span>
        <kbd className="ms-2 text-[10px] px-1.5 py-0.5 bg-surface-secondary border border-border rounded font-mono">
          <Command className="inline h-2.5 w-2.5" />K
        </kbd>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[10vh]"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="h-4 w-4 text-on-surface-tertiary shrink-0" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={isRTL ? 'ابحث في كل شي...' : 'Search everything...'}
                autoFocus
                className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none"
              />
              {searching && <Loader2 className="h-4 w-4 animate-spin text-on-surface-tertiary" />}
              <button onClick={() => setOpen(false)} className="text-on-surface-tertiary hover:text-on-surface">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto">
              {q.trim().length < 2 ? (
                <p className="p-8 text-center text-xs text-on-surface-tertiary">
                  {isRTL ? 'اكتب حرفين على الأقل · Ctrl+K للفتح من أي مكان' : 'Type 2+ chars · Ctrl+K opens from anywhere'}
                </p>
              ) : hits.length === 0 && !searching ? (
                <p className="p-8 text-center text-xs text-on-surface-tertiary">
                  {isRTL ? 'لا نتائج' : 'No results'}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {hits.slice(0, 20).map((h, i) => (
                    <button
                      key={i}
                      onClick={() => openHit(h)}
                      className="w-full text-start px-4 py-3 hover:bg-surface-secondary transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent uppercase">{h.kind}</span>
                        <span className="text-sm font-semibold text-on-surface line-clamp-1">{h.title}</span>
                      </div>
                      {h.snippet && (
                        <p className="text-xs text-on-surface-tertiary mt-1 line-clamp-1">{h.snippet}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {hits.length > 0 && (
              <div className="px-4 py-2 border-t border-border text-[10px] text-on-surface-tertiary text-center">
                {isRTL ? `${hits.length} نتيجة · Esc للإغلاق` : `${hits.length} results · Esc to close`}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
