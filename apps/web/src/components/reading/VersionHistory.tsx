'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, History, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface PageAnalysisRow {
  id: string;
  pageNumber: number;
  version: number;
  refinementRequest?: string | null;
  createdAt?: string;
  humanEdited?: boolean;
}

interface SessionDetailLite {
  pageAnalyses: PageAnalysisRow[];
}

interface VersionHistoryProps {
  sessionId: string;
  pageNumber: number;
  currentAnalysisId?: string;
  onSelect: (analysisId: string) => void;
}

export function VersionHistory({ sessionId, pageNumber, currentAnalysisId, onSelect }: VersionHistoryProps) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<PageAnalysisRow[] | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || versions !== null) return;
    setLoading(true);
    apiFetch<SessionDetailLite>(`/api/shwasha/sessions/${sessionId}`)
      .then((res) => {
        const rows = (res.pageAnalyses || [])
          .filter((r) => r.pageNumber === pageNumber)
          .sort((a, b) => b.version - a.version);
        setVersions(rows);
      })
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [open, sessionId, pageNumber, versions]);

  // Reset cache when navigating pages so we re-fetch latest on next open.
  useEffect(() => {
    setVersions(null);
  }, [pageNumber]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={isRTL ? 'سجل النسخ' : 'Version history'}
        aria-label={isRTL ? 'سجل النسخ' : 'Version history'}
        className={cn(
          'p-1.5 rounded-[var(--radius)] transition-colors',
          'text-on-surface-tertiary hover:text-on-surface hover:bg-surface-secondary'
        )}
      >
        <History size={14} />
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-20 mt-1 w-64 rounded-[var(--radius-lg)] border border-border bg-surface shadow-lg overflow-hidden',
            isRTL ? 'start-0' : 'end-0'
          )}
        >
          <div className="px-3 py-2 border-b border-border text-[11px] uppercase tracking-wider text-on-surface-tertiary">
            {isRTL ? 'سجل النسخ' : 'Version history'}
          </div>
          <div className="max-h-64 overflow-auto">
            {loading && (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-on-surface-tertiary">
                <Loader2 size={12} className="animate-spin" />
                {isRTL ? 'جارٍ التحميل…' : 'Loading…'}
              </div>
            )}
            {!loading && versions && versions.length === 0 && (
              <div className="px-3 py-3 text-xs text-on-surface-tertiary">
                {isRTL ? 'لا توجد نسخ لهذه الصفحة.' : 'No versions for this page.'}
              </div>
            )}
            {!loading && versions && versions.map((v) => {
              const isCurrent = v.id === currentAnalysisId;
              const dt = v.createdAt ? new Date(v.createdAt) : null;
              return (
                <button
                  key={v.id}
                  onClick={() => {
                    onSelect(v.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-start px-3 py-2 hover:bg-surface-secondary transition-colors',
                    'flex items-start gap-2 border-b border-border/40 last:border-b-0',
                    isCurrent && 'bg-accent/5'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 text-[11px] font-mono px-1.5 py-0.5 rounded',
                      isCurrent ? 'bg-accent/15 text-accent' : 'bg-surface-secondary text-on-surface-tertiary'
                    )}
                  >
                    v{v.version}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-on-surface truncate" dir="auto">
                      {v.refinementRequest?.trim()
                        ? v.refinementRequest
                        : (isRTL ? 'تحليل أولي' : 'Initial analysis')}
                    </p>
                    {dt && (
                      <p className="text-[10px] text-on-surface-tertiary mt-0.5">
                        {dt.toLocaleString(isRTL ? 'ar' : 'en')}
                      </p>
                    )}
                  </div>
                  {isCurrent && (
                    <Check size={12} className="text-accent shrink-0 mt-1" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
