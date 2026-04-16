'use client';

import { useState, useMemo } from 'react';
import { Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowStep } from '@/hooks/use-workflow-sse';
import { StatusBadge } from './status-badge';
import { SpecialistAvatar, specialistBilingual } from './specialist-avatar';
import { ArtifactPreview } from './artifact-preview';

interface Props {
  step: WorkflowStep;
  isRTL: boolean;
}

function formatDuration(step: WorkflowStep, now: number) {
  if (!step.startedAt) return null;
  const start = new Date(step.startedAt).getTime();
  const end = step.completedAt ? new Date(step.completedAt).getTime() : now;
  const secs = Math.max(0, Math.round((end - start) / 1000));
  return `${secs}s`;
}

function formatTimeout(ms?: number): string | null {
  if (!ms || ms <= 0) return null;
  if (ms >= 3600_000) {
    const h = Math.round(ms / 3600_000);
    return `${h}h`;
  }
  if (ms >= 60_000) {
    const m = Math.round(ms / 60_000);
    return `${m}m`;
  }
  return `${Math.round(ms / 1000)}s`;
}

export function StepCard({ step, isRTL }: Props) {
  const [expanded, setExpanded] = useState(false);
  const now = Date.now();
  const duration = formatDuration(step, now);

  const output = step.output || '';
  const truncated = useMemo(() => (output.length > 500 ? output.slice(0, 500) + '…' : output), [output]);
  const showExpand = output.length > 500;

  const isRunning = step.status === 'running';
  const isFailed = step.status === 'failed';
  const isDone = step.status === 'completed';

  return (
    <div
      className={cn(
        'border rounded-[var(--radius-lg)] bg-surface overflow-hidden transition-colors',
        isRunning && 'border-blue-400/50',
        isFailed && 'border-red-400/50',
        !isRunning && !isFailed && 'border-border',
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="flex flex-col items-center gap-2 shrink-0">
          <span className="text-xs font-mono text-on-surface-tertiary">#{step.index + 1}</span>
          <SpecialistAvatar specialistId={step.specialistId} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-sm font-medium text-on-surface">
              {specialistBilingual(step.specialistId)}
            </h3>
            <StatusBadge status={step.status} isRTL={isRTL} />
            {isRunning && duration && (
              <span className="text-xs text-on-surface-tertiary inline-flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" />
                {isRTL ? `يشغل منذ ${duration}` : `Running for ${duration}`}
              </span>
            )}
            {isDone && duration && (
              <span className="text-xs text-on-surface-tertiary">{duration}</span>
            )}
            {step.usage?.cost != null && (
              <span className="text-xs text-on-surface-tertiary">
                ${step.usage.cost.toFixed(4)}
              </span>
            )}
            {(step.usage?.inputTokens || step.usage?.outputTokens) && (
              <span className="text-xs text-on-surface-tertiary">
                {step.usage?.inputTokens || 0}↓ / {step.usage?.outputTokens || 0}↑ tok
              </span>
            )}
            {step.timeoutMs && formatTimeout(step.timeoutMs) && (
              <span className="text-xs text-on-surface-tertiary" title={isRTL ? 'مهلة الخطوة' : 'Step timeout'}>
                ⏱ {formatTimeout(step.timeoutMs)}
              </span>
            )}
            {(step.attemptCount ?? 0) > 1 && (
              <span className="text-xs text-amber-300">
                {isRTL
                  ? `المحاولة ${step.attemptCount}/${step.maxAttempts ?? 3}`
                  : `Attempt ${step.attemptCount}/${step.maxAttempts ?? 3}`}
              </span>
            )}
          </div>

          <p className="text-sm text-on-surface-secondary whitespace-pre-wrap">{step.task}</p>

          {step.expectedOutput && (
            <p className="mt-1 text-xs text-on-surface-tertiary">
              <span className="font-medium">{isRTL ? 'النتيجة المتوقعة: ' : 'Expected: '}</span>
              {step.expectedOutput}
            </p>
          )}

          {isRunning && !output && (
            <div className="mt-2 inline-flex items-center gap-2 text-sm text-on-surface-tertiary">
              <Loader2 size={14} className="animate-spin" />
              {isRTL ? 'جاري التنفيذ…' : 'Processing…'}
            </div>
          )}

          {output && (
            <div className="mt-3 border border-border rounded-[var(--radius)] bg-surface-secondary p-3">
              <pre className="text-xs text-on-surface whitespace-pre-wrap font-mono">
                {expanded ? output : truncated}
              </pre>
              {showExpand && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-2 text-xs text-accent hover:text-accent-hover inline-flex items-center gap-1"
                >
                  {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {expanded ? (isRTL ? 'إخفاء' : 'Collapse') : (isRTL ? 'عرض الكامل' : 'Show full')}
                </button>
              )}
            </div>
          )}

          {step.artifacts && step.artifacts.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {step.artifacts.map((a, i) => (
                <ArtifactPreview key={a.id || i} artifact={a} isRTL={isRTL} />
              ))}
            </div>
          )}

          {step.error && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-[var(--radius)] bg-red-500/10 border border-red-400/30 text-red-300 text-sm">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span className="whitespace-pre-wrap">{step.error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
