'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  isRTL: boolean;
  onClose: () => void;
  onCreated: (runId: string) => void;
}

export function PlanDialog({ isRTL, onClose, onCreated }: Props) {
  const [userRequest, setUserRequest] = useState('');
  const [title, setTitle] = useState('');
  const [startImmediately, setStartImmediately] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!userRequest.trim() || planning) return;
    setError(null);
    setPlanning(true);
    try {
      const run = await apiFetch<{ id: string }>('/api/workflow-runs/plan', {
        method: 'POST',
        body: JSON.stringify({ userRequest, title: title || undefined }),
      });
      if (startImmediately) {
        try {
          await apiFetch(`/api/workflow-runs/${run.id}/start?durable=true`, {
            method: 'POST',
          });
        } catch (e) {
          // Start failure shouldn't block — navigate anyway
          // eslint-disable-next-line no-console
          console.warn('Failed to start run', e);
        }
      }
      onCreated(run.id);
    } catch (e) {
      setError((e as Error).message);
      setPlanning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-on-surface">
            {isRTL ? 'مسار عمل جديد' : 'New Workflow Run'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-[var(--radius)] text-on-surface-tertiary hover:bg-surface-secondary"
            aria-label={isRTL ? 'إغلاق' : 'Close'}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-on-surface-secondary mb-1">
              {isRTL ? 'العنوان (اختياري)' : 'Title (optional)'}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder={isRTL ? 'عنوان مختصر' : 'Short title'}
              disabled={planning}
            />
          </div>

          <div>
            <label className="block text-sm text-on-surface-secondary mb-1">
              {isRTL ? 'صف المهمة' : 'Describe the task'}
            </label>
            <textarea
              ref={textareaRef}
              value={userRequest}
              onChange={(e) => setUserRequest(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              placeholder={
                isRTL
                  ? 'صف ما تريد إنجازه بأكبر قدر من التفصيل…'
                  : 'Describe what you want to accomplish in detail…'
              }
              disabled={planning}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-on-surface-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={startImmediately}
              onChange={(e) => setStartImmediately(e.target.checked)}
              className="accent-accent"
              disabled={planning}
            />
            {isRTL ? 'ابدأ فور التخطيط' : 'Start immediately after planning'}
          </label>

          {error && (
            <div className="p-3 rounded-[var(--radius)] bg-red-500/10 border border-red-400/30 text-red-300 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={planning}
            className="px-4 py-2 rounded-[var(--radius)] text-sm text-on-surface-secondary hover:bg-surface-secondary transition-colors disabled:opacity-50"
          >
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!userRequest.trim() || planning}
            className={cn(
              'px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50 inline-flex items-center gap-2',
            )}
          >
            {planning && <Loader2 size={14} className="animate-spin" />}
            {planning
              ? isRTL ? 'يخطط…' : 'Planning…'
              : isRTL ? 'تخطيط وبدء' : 'Plan & Run'}
          </button>
        </div>
      </div>
    </div>
  );
}
