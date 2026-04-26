'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, Send, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface AwaitingPipeline {
  id: string;
  name: { ar: string; en: string };
  currentStepIndex: number;
  stepLabel: string;
  stepError: string | null;
  updatedAt: string;
}

export function AwaitingUserNotifier() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [pipelines, setPipelines] = useState<AwaitingPipeline[]>([]);
  const [selected, setSelected] = useState<AwaitingPipeline | null>(null);
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // FIX-19: pause polling while user is composing a response (selected != null)
  const fetchAwaiting = useCallback(async () => {
    if (submitting) return;
    try {
      const data = await apiFetch<{ pipelines: AwaitingPipeline[] }>('/api/agent-pipelines/awaiting');
      // Only update list if dialog isn't open — don't overwrite while user types
      setPipelines(prev => {
        if (selected) return prev;
        return data.pipelines;
      });
    } catch { /* ignore */ }
  }, [submitting, selected]);

  useEffect(() => {
    void fetchAwaiting();
    const id = setInterval(fetchAwaiting, 15_000);
    return () => clearInterval(id);
  }, [fetchAwaiting]);

  const handleRespond = useCallback(async () => {
    if (!selected || !response.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/agent-pipelines/${selected.id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ stepIndex: selected.currentStepIndex, response: response.trim() }),
      });
      setToast(isRTL ? 'تم إرسال الرد — الـ pipeline يكمل' : 'Response sent — pipeline resuming');
      setSelected(null);
      setResponse('');
      setTimeout(() => setToast(null), 3000);
      void fetchAwaiting();
    } catch {
      setToast(isRTL ? 'فشل الإرسال' : 'Failed to send');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSubmitting(false);
    }
  }, [selected, response, isRTL, fetchAwaiting]);

  if (pipelines.length === 0 && !toast) return null;

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white text-xs px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* Notification banner */}
      {pipelines.length > 0 && !selected && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-4">
          {pipelines.map(p => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="w-full flex items-center gap-3 bg-amber-500 text-white text-xs px-4 py-3 rounded-xl shadow-lg hover:bg-amber-600 mb-2"
              dir={isRTL ? 'rtl' : 'ltr'}
            >
              <AlertCircle size={16} className="shrink-0" />
              <span className="flex-1 text-start">
                {isRTL
                  ? `Pipeline "${p.name.ar}" تنتظر ردك — ${p.stepLabel}`
                  : `Pipeline "${p.name.en}" awaiting your input — ${p.stepLabel}`}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Response dialog */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div
            className={cn('relative z-10 w-full max-w-md rounded-xl bg-surface border border-border shadow-xl', isRTL ? 'text-right' : 'text-left')}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold text-on-surface">
                  {isRTL ? 'Pipeline تنتظر ردك' : 'Pipeline Awaiting Input'}
                </h2>
                <p className="text-xs text-on-surface-tertiary mt-0.5">
                  {selected.name[language]} — {selected.stepLabel}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-on-surface-tertiary hover:text-on-surface p-1">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              {selected.stepError && (
                <div className="bg-red-500/10 border border-red-300/30 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-500">{selected.stepError}</p>
                </div>
              )}

              <div>
                <label className="block text-xs text-on-surface-secondary mb-1.5">
                  {isRTL ? 'ردك / قرارك' : 'Your response / decision'}
                </label>
                <textarea
                  value={response}
                  onChange={e => setResponse(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder={isRTL ? 'اكتب ردك هنا…' : 'Write your response here…'}
                  className="w-full text-sm rounded-lg border border-border bg-surface-secondary text-on-surface px-3 py-2 resize-none focus:outline-none focus:border-accent placeholder:text-on-surface-tertiary"
                />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="text-xs px-4 py-2 rounded-lg border border-border text-on-surface-secondary hover:bg-surface-secondary">
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleRespond}
                disabled={!response.trim() || submitting}
                className="text-xs px-4 py-2 rounded-lg bg-accent text-on-accent hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {isRTL ? 'أرسل وأكمل' : 'Send & Resume'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
