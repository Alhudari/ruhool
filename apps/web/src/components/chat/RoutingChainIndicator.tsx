'use client';

import { ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';

export interface ChainEntry {
  agentId: string;
  role: 'ceo' | 'manager' | 'worker';
  status: 'ok' | 'failed' | 'cancelled' | 'in-progress';
  displayName?: string;
}

interface Props {
  chain: ChainEntry[];
  loading?: boolean;
  onOpenDetail?: () => void;
  className?: string;
}

/**
 * Renders a compact "الراعي ← الباحث ← المُقارِن" chain beside the assistant
 * message. Clickable to open the DispatchDetailDrawer. RTL-aware: in
 * Arabic the chevron arrows flip direction naturally.
 */
export function RoutingChainIndicator({ chain, loading, onOpenDetail, className }: Props) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const Chevron = isRTL ? ChevronLeft : ChevronRight;

  if (chain.length === 0 && !loading) return null;

  const label = isRTL ? 'سلسلة الإسناد' : 'dispatch chain';

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary transition-colors',
        className,
      )}
    >
      {loading && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      {chain.map((e, idx) => (
        <span key={`${e.agentId}-${idx}`} className="inline-flex items-center gap-1">
          {idx > 0 && <Chevron className="h-2.5 w-2.5 text-on-surface-tertiary shrink-0" />}
          <bdi
            className={cn(
              'font-mono',
              e.status === 'failed' && 'text-error line-through',
              e.status === 'cancelled' && 'text-warning',
              e.status === 'in-progress' && 'text-accent',
            )}
          >
            {e.displayName ?? e.agentId}
          </bdi>
        </span>
      ))}
    </button>
  );
}
