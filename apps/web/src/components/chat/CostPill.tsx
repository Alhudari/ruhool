'use client';

import { Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';

interface CostPillProps {
  /** Input tokens for this turn. */
  inputTokens?: number;
  /** Output tokens for this turn. */
  outputTokens?: number;
  /** USD cost for this turn. */
  usd?: number;
  /** Optional run id so future click-to-expand can deep link. */
  runId?: string;
  /** Compact mode hides the icon and shortens text. */
  compact?: boolean;
  className?: string;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

function formatUsd(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `<$0.01`;
  return `$${n.toFixed(2)}`;
}

/**
 * Small chip rendered under an assistant message showing tokens + USD cost
 * for the turn. Bilingual, theme-token only, no color hardcoded.
 */
export function CostPill({ inputTokens, outputTokens, usd, compact, className }: CostPillProps) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const totalTokens = (inputTokens ?? 0) + (outputTokens ?? 0);
  const hasTokens = totalTokens > 0;
  const hasCost = typeof usd === 'number' && !Number.isNaN(usd);

  if (!hasTokens && !hasCost) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-surface-secondary text-on-surface-tertiary',
          className,
        )}
        aria-label={isRTL ? 'التكلفة غير متاحة' : 'Cost unavailable'}
      >
        {!compact && <Coins size={10} />}
        {isRTL ? 'غير متاحة' : 'unavailable'}
      </span>
    );
  }

  const tokenLabel = isRTL ? 'رموز' : 'tokens';
  const a11y = [
    hasTokens ? `${totalTokens} ${tokenLabel}` : null,
    hasCost ? `${formatUsd(usd!)} ${isRTL ? 'التكلفة' : 'cost'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-surface-secondary text-on-surface-secondary',
        className,
      )}
      aria-label={a11y}
    >
      {!compact && <Coins size={10} className="text-on-surface-tertiary" />}
      {hasTokens && <bdi className="font-mono">{formatTokens(totalTokens)} {tokenLabel}</bdi>}
      {hasTokens && hasCost && <span className="text-on-surface-tertiary">·</span>}
      {hasCost && <bdi className="font-mono">{formatUsd(usd!)}</bdi>}
    </span>
  );
}
