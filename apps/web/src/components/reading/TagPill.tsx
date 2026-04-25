'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TagPillProps {
  tag: string;
  onRemove?: () => void;
  className?: string;
}

export function TagPill({ tag, onRemove, className }: TagPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-accent/10 text-accent border border-accent/20',
        className
      )}
    >
      <span>{tag}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center justify-center rounded-full hover:bg-accent/20 p-0.5"
          aria-label="Remove tag"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}
