'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { highlightBgClass, type HighlightColor } from './HighlightSwatch';

export interface HighlightRange {
  color: HighlightColor;
  text: string;
  reason?: string;
}

export interface PageData {
  number: number;
  text: string;
  imageUrl?: string | null;
}

interface PaperViewProps {
  page: PageData | null;
  pageNumber: number;
  totalPages: number;
  highlights?: HighlightRange[];
  onNext: () => void;
  onPrev: () => void;
  onJump: (n: number) => void;
  onRequestImage?: () => void;
  isRTL: boolean;
}

interface Segment {
  text: string;
  color: HighlightColor | null;
  reason?: string;
}

function buildSegments(text: string, highlights: HighlightRange[]): Segment[] {
  if (!highlights.length) return [{ text, color: null }];

  interface Match {
    start: number;
    end: number;
    color: HighlightColor;
    reason?: string;
  }
  const matches: Match[] = [];
  for (const h of highlights) {
    if (!h.text) continue;
    const idx = text.indexOf(h.text);
    if (idx >= 0) {
      matches.push({ start: idx, end: idx + h.text.length, color: h.color, reason: h.reason });
    }
  }
  if (!matches.length) return [{ text, color: null }];

  matches.sort((a, b) => a.start - b.start);
  const merged: Match[] = [];
  for (const m of matches) {
    const last = merged[merged.length - 1];
    if (last && m.start < last.end) continue;
    merged.push(m);
  }

  const segs: Segment[] = [];
  let cursor = 0;
  for (const m of merged) {
    if (m.start > cursor) segs.push({ text: text.slice(cursor, m.start), color: null });
    segs.push({ text: text.slice(m.start, m.end), color: m.color, reason: m.reason });
    cursor = m.end;
  }
  if (cursor < text.length) segs.push({ text: text.slice(cursor), color: null });
  return segs;
}

export function PaperView({
  page,
  pageNumber,
  totalPages,
  highlights = [],
  onNext,
  onPrev,
  onJump,
  onRequestImage,
  isRTL,
}: PaperViewProps) {
  const segments = useMemo(
    () => (page ? buildSegments(page.text, highlights) : []),
    [page, highlights]
  );

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <p className="text-xs text-on-surface-tertiary">
          {isRTL ? 'الصفحة' : 'Page'} {pageNumber} / {totalPages || '—'}
        </p>
        {onRequestImage && (
          <button
            onClick={onRequestImage}
            className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-[var(--radius)] bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary transition-colors"
          >
            <ImageIcon size={12} />
            {isRTL ? 'صورة الصفحة' : 'Page image'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {page?.imageUrl && (
          <div className="px-6 pt-6">
            <img
              src={page.imageUrl}
              alt={`Page ${pageNumber}`}
              className="max-w-full mx-auto rounded-[var(--radius)] border border-border"
            />
          </div>
        )}
        <article
          className="mx-auto px-6 py-8 font-serif text-[16px] leading-[1.8] text-on-surface whitespace-pre-wrap"
          style={{ maxWidth: 720 }}
          dir="auto"
        >
          {page ? (
            segments.map((s, i) =>
              s.color ? (
                <mark
                  key={i}
                  title={s.reason}
                  className={cn('rounded px-0.5', highlightBgClass(s.color), 'text-on-surface')}
                >
                  {s.text}
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              )
            )
          ) : (
            <span className="text-on-surface-tertiary italic">
              {isRTL ? 'لا توجد صفحة محمّلة.' : 'No page loaded.'}
            </span>
          )}
        </article>
      </div>

      <div className="border-t border-border px-4 py-2 flex items-center justify-center gap-3 shrink-0">
        <button
          onClick={onPrev}
          disabled={pageNumber <= 1}
          className="p-1.5 rounded-[var(--radius)] text-on-surface-secondary hover:bg-surface-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={isRTL ? 'الصفحة السابقة' : 'Previous page'}
        >
          {isRTL ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <div className="inline-flex items-center gap-1 text-xs text-on-surface-secondary">
          <input
            type="number"
            min={1}
            max={totalPages || undefined}
            value={pageNumber}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n)) onJump(n);
            }}
            className="w-14 text-center px-1 py-0.5 bg-input border border-border rounded-[var(--radius)] text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span>/ {totalPages || '—'}</span>
        </div>
        <button
          onClick={onNext}
          disabled={totalPages > 0 && pageNumber >= totalPages}
          className="p-1.5 rounded-[var(--radius)] text-on-surface-secondary hover:bg-surface-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={isRTL ? 'الصفحة التالية' : 'Next page'}
        >
          {isRTL ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
    </div>
  );
}
