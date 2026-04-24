'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface AuditEntry {
  ts: string;
  action: string;
  path?: string;
  source: string;
  meta?: Record<string, unknown>;
}

interface PageResponse {
  entries: AuditEntry[];
  nextCursor: number | null;
  totalBytes: number;
}

const PAGE_LIMIT = 100;

export function AuditLogTable() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [prefix, setPrefix] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const buildQuery = useCallback((extraCursor?: number | null) => {
    const params = new URLSearchParams();
    if (prefix.trim()) params.set('prefix', prefix.trim());
    if (source) params.set('source', source);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    params.set('limit', String(PAGE_LIMIT));
    if (extraCursor != null) params.set('cursor', String(extraCursor));
    return params.toString();
  }, [prefix, source, from, to]);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch<PageResponse>(`/api/audit-log?${buildQuery()}`);
      setEntries(r.entries);
      setCursor(r.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
    setLoading(false);
  }, [buildQuery]);

  const loadMore = useCallback(async () => {
    if (cursor == null) return;
    setLoadingMore(true);
    try {
      const r = await apiFetch<PageResponse>(`/api/audit-log?${buildQuery(cursor)}`);
      setEntries((prev) => [...prev, ...r.entries]);
      setCursor(r.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
    setLoadingMore(false);
  }, [buildQuery, cursor]);

  useEffect(() => {
    apiFetch<{ sources: string[] }>('/api/audit-log/sources')
      .then((r) => setSources(r.sources))
      .catch(() => setSources([]));
  }, []);

  // Debounced refetch on filter change.
  useEffect(() => {
    const t = setTimeout(() => { loadFirst(); }, 250);
    return () => clearTimeout(t);
  }, [loadFirst]);

  const fmtTs = useCallback((iso: string) => {
    try {
      return new Date(iso).toLocaleString(isRTL ? 'ar' : 'en', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch { return iso; }
  }, [isRTL]);

  const resultCount = useMemo(() => entries.length, [entries]);

  return (
    <div className="space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Filters */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label htmlFor="audit-prefix" className="block text-[11px] text-on-surface-tertiary mb-1">
            {isRTL ? 'بادئة الإجراء' : 'Action prefix'}
          </label>
          <div className="relative">
            <Search size={12} className={cn('absolute top-1/2 -translate-y-1/2 text-on-surface-tertiary', isRTL ? 'right-2' : 'left-2')} />
            <input
              id="audit-prefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="zotero.sync"
              className={cn('w-full h-8 bg-surface-secondary border border-border rounded text-xs text-on-surface focus:outline-none focus:border-accent font-mono', isRTL ? 'pr-6 pl-2' : 'pl-6 pr-2')}
            />
          </div>
        </div>
        <div>
          <label htmlFor="audit-source" className="block text-[11px] text-on-surface-tertiary mb-1">
            {isRTL ? 'المصدر' : 'Source'}
          </label>
          <select
            id="audit-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full h-8 bg-surface-secondary border border-border rounded px-2 text-xs text-on-surface focus:outline-none focus:border-accent"
          >
            <option value="">{isRTL ? 'الكل' : 'All'}</option>
            {sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-from" className="block text-[11px] text-on-surface-tertiary mb-1">
            {isRTL ? 'من' : 'From'}
          </label>
          <input
            id="audit-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full h-8 bg-surface-secondary border border-border rounded px-2 text-xs text-on-surface focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label htmlFor="audit-to" className="block text-[11px] text-on-surface-tertiary mb-1">
            {isRTL ? 'إلى' : 'To'}
          </label>
          <input
            id="audit-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full h-8 bg-surface-secondary border border-border rounded px-2 text-xs text-on-surface focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Result count + refresh */}
      <div className="flex items-center justify-between text-xs">
        <span aria-live="polite" className="text-on-surface-tertiary">
          {isRTL ? `تظهر ${resultCount} سجلات` : `Showing ${resultCount} entries`}
        </span>
        <button
          onClick={loadFirst}
          className="inline-flex items-center gap-1 text-accent hover:underline"
        >
          <RefreshCw size={10} />
          {isRTL ? 'أعد التحميل' : 'Reload'}
        </button>
      </div>

      {error ? (
        <div className="rounded-[var(--radius)] border border-error/30 bg-error/10 text-error text-xs px-3 py-2 flex items-center gap-2">
          <AlertTriangle size={12} />
          {error}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12 text-on-surface-tertiary">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-[var(--radius-lg)] text-sm text-on-surface-tertiary">
          {prefix || source || from || to
            ? (isRTL ? 'لا توجد سجلات ضمن هذا النطاق.' : 'No entries in this range.')
            : (isRTL ? 'لا توجد سجلات بعد.' : 'No entries yet.')}
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border overflow-hidden">
          <table className="w-full text-xs">
            <caption className="sr-only">
              {isRTL ? 'سجلّ التدقيق' : 'Audit log'}
            </caption>
            <thead className="bg-surface-secondary text-on-surface-secondary">
              <tr>
                <th scope="col" className="text-start px-3 py-2 font-semibold">{isRTL ? 'التاريخ' : 'Timestamp'}</th>
                <th scope="col" className="text-start px-3 py-2 font-semibold">{isRTL ? 'الإجراء' : 'Action'}</th>
                <th scope="col" className="text-start px-3 py-2 font-semibold">{isRTL ? 'المصدر' : 'Source'}</th>
                <th scope="col" className="text-start px-3 py-2 font-semibold hidden md:table-cell">{isRTL ? 'المسار' : 'Path'}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => (
                <tr
                  key={`${e.ts}-${idx}`}
                  className="border-t border-border hover:bg-surface-secondary/50"
                >
                  <td className="px-3 py-2 text-on-surface-secondary font-mono">
                    <bdi>{fmtTs(e.ts)}</bdi>
                  </td>
                  <td className="px-3 py-2 text-on-surface font-mono">
                    <bdi>{e.action}</bdi>
                  </td>
                  <td className="px-3 py-2 text-on-surface-secondary font-mono">
                    <bdi>{e.source}</bdi>
                  </td>
                  <td className="px-3 py-2 text-on-surface-tertiary hidden md:table-cell truncate max-w-[20rem]">
                    <bdi>{e.path ?? '—'}</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cursor != null && (
            <div className="border-t border-border p-3 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded border border-border text-on-surface-secondary hover:bg-surface-secondary disabled:opacity-50"
              >
                {loadingMore ? <Loader2 size={10} className="animate-spin" /> : null}
                {isRTL ? 'تحميل المزيد' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
