'use client';

import { cn } from '@/lib/utils';

export type HighlightColor = 'yellow' | 'green' | 'red' | 'blue' | 'purple' | 'orange';

const COLOR_BG: Record<HighlightColor, string> = {
  yellow: 'bg-yellow-400/70',
  green: 'bg-green-400/70',
  red: 'bg-red-400/70',
  blue: 'bg-blue-400/70',
  purple: 'bg-purple-400/70',
  orange: 'bg-orange-400/70',
};

const COLOR_RING: Record<HighlightColor, string> = {
  yellow: 'ring-yellow-500/40',
  green: 'ring-green-500/40',
  red: 'ring-red-500/40',
  blue: 'ring-blue-500/40',
  purple: 'ring-purple-500/40',
  orange: 'ring-orange-500/40',
};

const LABELS: Record<HighlightColor, { en: string; ar: string }> = {
  yellow: { en: 'general', ar: 'عام' },
  green: { en: 'supports', ar: 'مؤيّد' },
  red: { en: 'contradicts', ar: 'مُعارِض' },
  blue: { en: 'definition', ar: 'تعريف' },
  purple: { en: 'methodology', ar: 'منهجية' },
  orange: { en: 'statistic', ar: 'إحصائية' },
};

export function highlightLabel(color: HighlightColor, isRTL: boolean): string {
  return LABELS[color][isRTL ? 'ar' : 'en'];
}

export function highlightBgClass(color: HighlightColor): string {
  return COLOR_BG[color];
}

interface HighlightSwatchProps {
  color: HighlightColor;
  size?: number;
  withLabel?: boolean;
  isRTL?: boolean;
}

export function HighlightSwatch({ color, size = 12, withLabel = false, isRTL = false }: HighlightSwatchProps) {
  const label = highlightLabel(color, isRTL);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn('inline-block rounded-full ring-1', COLOR_BG[color], COLOR_RING[color])}
        style={{ width: size, height: size }}
        aria-label={label}
      />
      {withLabel && (
        <span className="text-xs text-on-surface-secondary">{label}</span>
      )}
    </span>
  );
}
