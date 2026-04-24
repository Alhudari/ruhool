'use client';

import { useState } from 'react';
import { Send, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RefineBarProps {
  onSubmit: (instruction: string, deep: boolean) => void | Promise<void>;
  disabled?: boolean;
  isRTL: boolean;
}

const QUICK_CHIPS_EN = [
  'Focus on methodology',
  'Add library link',
  'Shorten main idea',
  'More tags',
  'Remove highlight 3',
];

const QUICK_CHIPS_AR = [
  'ركّز على المنهجية',
  'أضف رابطًا من المكتبة',
  'اختصر الفكرة الرئيسية',
  'مزيد من الوسوم',
  'احذف الاقتباس رقم 3',
];

export function RefineBar({ onSubmit, disabled, isRTL }: RefineBarProps) {
  const [value, setValue] = useState('');
  const [deep, setDeep] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const chips = isRTL ? QUICK_CHIPS_AR : QUICK_CHIPS_EN;

  const handle = async () => {
    const v = value.trim();
    if (!v) return;
    setSubmitting(true);
    try {
      await onSubmit(v, deep);
      setValue('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setValue((prev) => (prev ? prev + ' ' : '') + c)}
            disabled={disabled || submitting}
            className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary transition-colors disabled:opacity-50"
          >
            {c}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handle();
            }
          }}
          placeholder={isRTL ? 'كيف تريد صقل التحليل؟' : 'How should Al-Mulakhkhis refine the analysis?'}
          dir="auto"
          disabled={disabled || submitting}
          className="flex-1 px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <label
          className={cn(
            'inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-[var(--radius)] cursor-pointer border transition-colors',
            deep
              ? 'bg-accent/10 text-accent border-accent/40'
              : 'bg-surface-secondary text-on-surface-secondary border-border'
          )}
          title={isRTL ? 'استخدم نموذج أقوى (Opus)' : 'Use stronger model (Opus)'}
        >
          <input
            type="checkbox"
            checked={deep}
            onChange={(e) => setDeep(e.target.checked)}
            className="hidden"
          />
          <Sparkles size={10} />
          {isRTL ? 'صقل عميق' : 'Deep'}
        </label>
        <button
          onClick={handle}
          disabled={!value.trim() || disabled || submitting}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius)] text-xs bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          {isRTL ? 'صقل' : 'Refine'}
        </button>
      </div>
    </div>
  );
}
