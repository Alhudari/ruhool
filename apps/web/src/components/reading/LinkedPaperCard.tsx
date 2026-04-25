'use client';

import { Library, ExternalLink } from 'lucide-react';
import { useAppStore } from '@/store/app';

export interface LinkedPaper {
  id?: string;
  title: string;
  authors?: string;
  year?: number | string;
}

interface LinkedPaperCardProps {
  paper: LinkedPaper;
  note?: string;
}

export function LinkedPaperCard({ paper, note }: LinkedPaperCardProps) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface-secondary/40 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Library size={16} className="text-accent shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-on-surface truncate" dir="auto">
            {paper.title}
          </p>
          {(paper.authors || paper.year) && (
            <p className="text-xs text-on-surface-tertiary mt-0.5 truncate" dir="auto">
              {paper.authors}
              {paper.authors && paper.year ? ' — ' : ''}
              {paper.year}
            </p>
          )}
        </div>
      </div>
      {note && (
        <p className="text-xs text-on-surface-secondary leading-relaxed" dir="auto">
          {note}
        </p>
      )}
      <a
        href="/library"
        className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
      >
        {isRTL ? 'عرض في المكتبة' : 'View in library'}
        <ExternalLink size={10} />
      </a>
    </div>
  );
}
