'use client';

import { cn } from '@/lib/utils';
import type { WorkflowRunStatus, WorkflowStepStatus } from '@/hooks/use-workflow-sse';

type AnyStatus = WorkflowRunStatus | WorkflowStepStatus | 'unknown';

interface Props {
  status: AnyStatus;
  isRTL: boolean;
  size?: 'sm' | 'md';
}

const STYLES: Record<string, string> = {
  pending: 'bg-surface-secondary text-on-surface-tertiary',
  planning: 'bg-blue-500/10 text-blue-400',
  running: 'bg-blue-500/10 text-blue-400 animate-pulse',
  paused: 'bg-amber-500/10 text-amber-400',
  completed: 'bg-green-500/10 text-green-400',
  failed: 'bg-red-500/10 text-red-400',
  canceled: 'bg-red-500/10 text-red-400',
  skipped: 'bg-amber-500/10 text-amber-400',
  unknown: 'bg-surface-secondary text-on-surface-tertiary',
};

const LABELS: Record<string, { en: string; ar: string }> = {
  pending: { en: 'Pending', ar: 'قيد الانتظار' },
  planning: { en: 'Planning', ar: 'يخطط' },
  running: { en: 'Running', ar: 'قيد التشغيل' },
  paused: { en: 'Paused', ar: 'متوقف مؤقتًا' },
  completed: { en: 'Completed', ar: 'اكتمل' },
  failed: { en: 'Failed', ar: 'فشل' },
  canceled: { en: 'Canceled', ar: 'ملغى' },
  skipped: { en: 'Skipped', ar: 'متجاوَز' },
  unknown: { en: 'Unknown', ar: 'غير معروف' },
};

export function StatusBadge({ status, isRTL, size = 'sm' }: Props) {
  const label = LABELS[status] || LABELS.unknown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1',
        STYLES[status] || STYLES.unknown,
      )}
    >
      {isRTL ? label.ar : label.en}
    </span>
  );
}
