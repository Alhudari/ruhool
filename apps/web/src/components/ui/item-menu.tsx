'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Archive, ArchiveRestore, Trash2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ItemMenuProps {
  onArchive?: () => void | Promise<void>;
  onUnarchive?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onEdit?: () => void | Promise<void>;
  archived?: boolean;
  deleteConfirmMessage?: string;
  isRTL?: boolean;
  className?: string;
  size?: number;
  stopPropagation?: boolean;
}

export function ItemMenu({
  onArchive,
  onUnarchive,
  onDelete,
  onEdit,
  archived,
  deleteConfirmMessage,
  isRTL = false,
  className,
  size = 14,
  stopPropagation = true,
}: ItemMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const wrap = (fn?: () => void | Promise<void>) => async (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    setOpen(false);
    if (fn) await fn();
  };

  const handleDelete = async (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    setOpen(false);
    const msg = deleteConfirmMessage || (isRTL ? 'تأكيد الحذف؟' : 'Confirm delete?');
    if (!confirm(msg)) return;
    if (onDelete) await onDelete();
  };

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <button
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-1.5 rounded-[var(--radius)] text-on-surface-tertiary hover:text-on-surface hover:bg-surface-secondary transition-colors"
        aria-label="More actions"
      >
        <MoreHorizontal size={size} />
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 min-w-[140px] rounded-[var(--radius-lg)] border border-border bg-surface shadow-lg py-1',
            isRTL ? 'left-0' : 'right-0'
          )}
        >
          {onEdit && (
            <button
              onClick={wrap(onEdit)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-on-surface hover:bg-surface-secondary transition-colors text-start"
            >
              <Pencil size={12} />
              {isRTL ? 'تعديل' : 'Edit'}
            </button>
          )}
          {!archived && onArchive && (
            <button
              onClick={wrap(onArchive)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-on-surface hover:bg-surface-secondary transition-colors text-start"
            >
              <Archive size={12} />
              {isRTL ? 'أرشفة' : 'Archive'}
            </button>
          )}
          {archived && onUnarchive && (
            <button
              onClick={wrap(onUnarchive)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-on-surface hover:bg-surface-secondary transition-colors text-start"
            >
              <ArchiveRestore size={12} />
              {isRTL ? 'استعادة' : 'Unarchive'}
            </button>
          )}
          {onDelete && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 transition-colors text-start"
            >
              <Trash2 size={12} />
              {isRTL ? 'حذف' : 'Delete'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ShowArchivedToggle({
  value,
  onChange,
  isRTL,
  className,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  isRTL?: boolean;
  className?: string;
}) {
  return (
    <label className={cn('flex items-center gap-2 text-xs text-on-surface-tertiary cursor-pointer select-none', className)}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-border"
      />
      {isRTL ? 'إظهار المؤرشف' : 'Show archived'}
    </label>
  );
}
