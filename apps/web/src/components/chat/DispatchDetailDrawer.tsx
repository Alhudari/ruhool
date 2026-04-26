'use client';

import { useEffect, useRef } from 'react';
import { X, AlertTriangle, CheckCircle2, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { CostPill } from './CostPill';

export interface DispatchDetailStep {
  agentId: string;
  role: 'ceo' | 'manager' | 'worker';
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  startedAtMs: number;
  endedAtMs: number;
  status: 'ok' | 'failed' | 'cancelled';
  error?: string;
  displayName?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  dispatchId: string;
  chain: DispatchDetailStep[];
  totalTokens: { input: number; output: number };
  totalCostUsd: number;
  budgetCapped?: boolean;
  durationMs?: number;
}

const ROLE_LABELS_AR: Record<DispatchDetailStep['role'], string> = {
  ceo: 'المدير العام',
  manager: 'مدير القسم',
  worker: 'عامل',
};
const ROLE_LABELS_EN: Record<DispatchDetailStep['role'], string> = {
  ceo: 'CEO',
  manager: 'Manager',
  worker: 'Worker',
};

export function DispatchDetailDrawer({
  open, onClose, dispatchId, chain, totalTokens, totalCostUsd, budgetCapped, durationMs,
}: Props) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // Focus trap + Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    firstFocusRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a, button, textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const totalTokensCombined = totalTokens.input + totalTokens.output;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      dir={isRTL ? 'rtl' : 'ltr'}
      aria-hidden="false"
    >
      <div className="flex-1 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={cn(
          'w-full max-w-md h-full bg-surface border-border shadow-2xl flex flex-col',
          isRTL ? 'border-e' : 'border-s',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispatch-detail-title"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 id="dispatch-detail-title" className="text-sm font-semibold text-on-surface">
              {isRTL ? 'تفاصيل الإسناد' : 'Dispatch detail'}
            </h2>
            <p className="text-[10px] text-on-surface-tertiary font-mono">{dispatchId.slice(0, 8)}…</p>
          </div>
          <button
            ref={firstFocusRef}
            onClick={onClose}
            className="p-1.5 rounded hover:bg-surface-secondary text-on-surface-tertiary"
            aria-label={isRTL ? 'أغلق' : 'Close'}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border text-xs text-on-surface-secondary flex items-center gap-3 flex-wrap">
          <CostPill
            inputTokens={totalTokens.input}
            outputTokens={totalTokens.output}
            usd={totalCostUsd}
          />
          {durationMs != null && (
            <span className="text-on-surface-tertiary">
              {isRTL ? `المدة: ${durationMs} مللي` : `duration: ${durationMs}ms`}
            </span>
          )}
          {budgetCapped && (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle size={10} />
              {isRTL ? 'تم تطبيق حد التكلفة' : 'cost cap applied'}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {chain.length === 0 ? (
            <p className="text-center text-xs text-on-surface-tertiary py-8">
              {isRTL ? 'لم يبدأ أي إسناد بعد' : 'No dispatches yet'}
            </p>
          ) : (
            <ol className="space-y-2">
              {chain.map((step, idx) => (
                <li
                  key={`${step.agentId}-${idx}`}
                  className={cn(
                    'rounded-[var(--radius)] border p-3 bg-surface-secondary',
                    step.status === 'failed' && 'border-error/40',
                    step.status === 'cancelled' && 'border-warning/40',
                    step.status === 'ok' && 'border-border',
                  )}
                >
                  <h3 className="text-xs font-semibold text-on-surface flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1">
                      {step.status === 'ok' && <CheckCircle2 size={12} className="text-success" />}
                      {step.status === 'failed' && <AlertTriangle size={12} className="text-error" />}
                      {step.status === 'cancelled' && <Ban size={12} className="text-warning" />}
                      <bdi className="font-mono">{step.displayName ?? step.agentId}</bdi>
                    </span>
                    <span className="text-[10px] text-on-surface-tertiary">
                      {isRTL ? ROLE_LABELS_AR[step.role] : ROLE_LABELS_EN[step.role]}
                    </span>
                  </h3>
                  <div className="flex items-center gap-3 text-[10px] text-on-surface-tertiary flex-wrap">
                    <span aria-label={isRTL ? `إجمالي الرموز ${step.tokensIn + step.tokensOut}` : `total tokens ${step.tokensIn + step.tokensOut}`}>
                      <bdi className="font-mono">
                        {step.tokensIn + step.tokensOut} {isRTL ? 'رمز' : 'tok'}
                      </bdi>
                    </span>
                    <span>·</span>
                    <span>
                      <bdi className="font-mono">${step.costUsd.toFixed(4)}</bdi>
                    </span>
                    <span>·</span>
                    <span>
                      <bdi className="font-mono">{step.endedAtMs - step.startedAtMs}ms</bdi>
                    </span>
                  </div>
                  {step.error && (
                    <p className="mt-2 text-[11px] text-error break-words">{step.error}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="border-t border-border px-4 py-2 text-[10px] text-on-surface-tertiary flex items-center justify-between">
          <span aria-label={isRTL ? `إجمالي ${totalTokensCombined} رمز` : `${totalTokensCombined} tokens total`}>
            <bdi>{totalTokensCombined} {isRTL ? 'رمز إجمالي' : 'tokens total'}</bdi>
          </span>
          <span>
            <bdi>${totalCostUsd.toFixed(4)}</bdi>
          </span>
        </div>
      </div>
    </div>
  );
}
