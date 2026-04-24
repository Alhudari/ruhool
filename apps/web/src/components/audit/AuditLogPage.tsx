'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ScrollText, Loader2, RefreshCw, Filter, FilePlus2, FilePen, Trash2,
  Archive, BookOpen, ClipboardList, Database, ExternalLink,
} from 'lucide-react';
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

const ACTION_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  create:  { icon: FilePlus2, color: 'text-success bg-success/10' },
  update:  { icon: FilePen, color: 'text-info bg-info/10' },
  archive: { icon: Archive, color: 'text-warning bg-warning/10' },
  delete:  { icon: Trash2, color: 'text-error bg-error/10' },
  meeting: { icon: ClipboardList, color: 'text-warning bg-warning/10' },
  literature: { icon: BookOpen, color: 'text-info bg-info/10' },
  source: { icon: Database, color: 'text-accent bg-accent/10' },
};

function classify(action: string): { icon: React.ElementType; color: string } {
  for (const [k, v] of Object.entries(ACTION_ICONS)) {
    if (action.includes(k)) return v;
  }
  return { icon: ScrollText, color: 'text-on-surface-tertiary bg-surface-tertiary' };
}

const VAULT_NAME = 'PhD';

export function AuditLogPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>('all');

  const load = () => {
    setLoading(true);
    apiFetch<{ entries: AuditEntry[] }>('/api/audit-log?limit=500')
      .then((d) => setEntries(d.entries))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (actionFilter === 'all') return entries;
    return entries.filter((e) => e.action.startsWith(actionFilter));
  }, [entries, actionFilter]);

  // Group by day
  const grouped = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const e of filtered) {
      const day = e.ts.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const actionCategories = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.action.split('.')[0]);
    return Array.from(set).sort();
  }, [entries]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-surface">
      <Loader2 className="h-7 w-7 animate-spin text-on-surface-tertiary" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="border-b border-border bg-surface-secondary px-6 md:px-10 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <ScrollText className="h-5 w-5 text-accent" />
                <h1 className="text-xl md:text-2xl font-bold text-on-surface">
                  {isRTL ? 'سجل النشاط' : 'Activity Log'}
                </h1>
              </div>
              <p className="text-sm text-on-surface-tertiary mt-1">
                {isRTL
                  ? `كل تعديل أو حذف أو إضافة على Obsidian — ${entries.length} عملية مسجّلة`
                  : `Every vault edit, delete, or addition — ${entries.length} entries logged`}
              </p>
            </div>
            <button onClick={load} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-tertiary text-on-surface-secondary">
              <RefreshCw className="h-3 w-3" />
              {isRTL ? 'تحديث' : 'Refresh'}
            </button>
          </div>
          {/* Action filter */}
          <div className="flex items-center gap-1 flex-wrap">
            <Filter className="h-3 w-3 text-on-surface-tertiary" />
            <button
              onClick={() => setActionFilter('all')}
              className={cn('text-xs px-2.5 py-1 rounded-full transition-colors',
                actionFilter === 'all' ? 'bg-accent text-on-accent' : 'text-on-surface-tertiary bg-surface hover:bg-surface-tertiary')}
            >
              {isRTL ? 'الكل' : 'All'} ({entries.length})
            </button>
            {actionCategories.map((cat) => {
              const count = entries.filter((e) => e.action.startsWith(cat)).length;
              return (
                <button
                  key={cat}
                  onClick={() => setActionFilter(actionFilter === cat ? 'all' : cat)}
                  className={cn('text-xs px-2.5 py-1 rounded-full transition-colors',
                    actionFilter === cat ? 'bg-accent/15 text-accent' : 'text-on-surface-tertiary bg-surface hover:bg-surface-tertiary')}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Entries grouped by day */}
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 space-y-6">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-secondary p-12 text-center">
            <ScrollText className="h-10 w-10 text-on-surface-tertiary mx-auto mb-3 opacity-30" />
            <p className="text-sm text-on-surface-tertiary">
              {isRTL ? 'لا توجد عمليات مسجّلة' : 'No activity yet'}
            </p>
          </div>
        ) : (
          grouped.map(([day, dayEntries]) => (
            <div key={day}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-bold uppercase tracking-widest text-on-surface-tertiary">{day}</span>
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-on-surface-tertiary">{dayEntries.length}</span>
              </div>
              <div className="space-y-2">
                {dayEntries.map((e, i) => {
                  const cls = classify(e.action);
                  const Icon = cls.icon;
                  const time = e.ts.slice(11, 19);
                  return (
                    <div key={i} className="rounded-lg border border-border bg-surface-secondary p-3 flex items-start gap-3 hover:border-border-hover transition-colors">
                      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', cls.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono text-on-surface">{e.action}</code>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-tertiary text-on-surface-tertiary">{e.source}</span>
                          <span className="text-[10px] text-on-surface-tertiary ms-auto font-mono">{time}</span>
                        </div>
                        {e.path && (
                          <a
                            href={`obsidian://open?vault=${VAULT_NAME}&file=${e.path.split('/').map(encodeURIComponent).join('/').replace(/\.md$/, '')}`}
                            target="_self"
                            className="text-xs text-on-surface-secondary mt-1 break-all flex items-center gap-1 hover:text-accent"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                            {e.path}
                          </a>
                        )}
                        {e.meta && Object.keys(e.meta).length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {Object.entries(e.meta).slice(0, 4).map(([k, v]) => {
                              const display = typeof v === 'string' ? v : Array.isArray(v) ? `${v.length} items` : typeof v === 'object' ? '...' : String(v);
                              return (
                                <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-tertiary text-on-surface-tertiary">
                                  <span className="opacity-60">{k}:</span> {String(display).slice(0, 40)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
