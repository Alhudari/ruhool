'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

const BUILTIN_AGENTS = [
  { id: 'manager',           ar: 'الراعي',     en: "Al-Ra'i" },
  { id: 'research',          ar: 'الباحث',     en: 'Al-Bahith' },
  { id: 'reading-helper',    ar: 'المُلخِّص',   en: 'Al-Mulakhkhis' },
  { id: 'writing-critic',    ar: 'الناقد',     en: 'Al-Naqid' },
  { id: 'comparator',        ar: 'المُقارِن',   en: 'Al-Muqarin' },
  { id: 'architect',         ar: 'المصمم',     en: 'Al-Musammim' },
  { id: 'content-creator',   ar: 'السارد',     en: 'Al-Sarid' },
  { id: 'creative',          ar: 'المبدع',     en: "Al-Mubdi'" },
  { id: 'tasks-agent',       ar: 'مهام',       en: 'Maham' },
  { id: 'analyst',           ar: 'المحلل',     en: 'Al-Muhallil' },
  { id: 'mudawwin',          ar: 'المُدوّن',    en: 'Al-Mudawwin' },
  { id: 'sayyaq',            ar: 'الكاتب',     en: 'Al-Katib' },
  { id: 'fatin',             ar: 'الفطين',     en: 'Al-Fatin' },
];

const SCHEDULE_PRESETS = [
  { label: { ar: 'فوري',          en: 'Now' },           value: '' },
  { label: { ar: 'بعد ساعة',      en: 'In 1 hour' },     value: 'بعد ساعة' },
  { label: { ar: 'بعد ساعتين',    en: 'In 2 hours' },    value: 'بعد ساعتين' },
  { label: { ar: 'الصبح',         en: 'Tomorrow 8am' },  value: 'الصبح' },
  { label: { ar: 'بعد يوم',       en: 'In 24 hours' },   value: 'بعد يوم' },
  { label: { ar: 'وقت محدد…',    en: 'Custom…' },       value: '__custom__' },
];

interface AgentTaskDialogProps {
  open: boolean;
  onClose: () => void;
  defaultAgentId?: string;
}

export function AgentTaskDialog({ open, onClose, defaultAgentId }: AgentTaskDialogProps) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [agentId, setAgentId]             = useState(defaultAgentId ?? 'manager');
  const [prompt, setPrompt]               = useState('');
  const [schedulePreset, setSchedulePreset] = useState('');
  const [customTime, setCustomTime]       = useState('');
  const [reportOnComplete, setReportOnComplete] = useState(true);
  const [submitting, setSubmitting]       = useState(false);
  const [toast, setToast]                 = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setPrompt('');
      setSchedulePreset('');
      setCustomTime('');
      setReportOnComplete(true);
      setToast(null);
      if (defaultAgentId) setAgentId(defaultAgentId);
    }
  }, [open, defaultAgentId]);

  // Alt+T global shortcut — handled by the parent; Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim()) return;
    setSubmitting(true);
    try {
      const scheduleText =
        schedulePreset === '__custom__' ? customTime.trim() : schedulePreset;

      await apiFetch('/api/agent-tasks', {
        method: 'POST',
        body: JSON.stringify({
          agentId,
          prompt: prompt.trim(),
          ...(scheduleText ? { scheduleText } : {}),
          reportOnComplete,
        }),
      });

      const agentName = BUILTIN_AGENTS.find((a) => a.id === agentId)?.[language] ?? agentId;
      setToast(isRTL ? `تم تكليف ${agentName}` : `${agentName} assigned`);
      setTimeout(() => { setToast(null); onClose(); }, 1800);
    } catch {
      setToast(isRTL ? 'فشل التكليف — حاول مرة أخرى' : 'Assignment failed — try again');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSubmitting(false);
    }
  }, [agentId, prompt, schedulePreset, customTime, reportOnComplete, language, isRTL, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div
        className={cn(
          'relative z-10 w-full max-w-md rounded-xl bg-surface border border-border shadow-xl',
          isRTL ? 'text-right' : 'text-left'
        )}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-on-surface">
            {isRTL ? 'تكليف وكيل' : 'Assign Agent'}
          </h2>
          <button onClick={onClose} className="text-on-surface-tertiary hover:text-on-surface p-1 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Agent picker */}
          <div>
            <label className="block text-xs text-on-surface-secondary mb-1.5">
              {isRTL ? 'الوكيل' : 'Agent'}
            </label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full text-sm rounded-lg border border-border bg-surface-secondary text-on-surface px-3 py-2 focus:outline-none focus:border-accent"
            >
              {BUILTIN_AGENTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a[language]} — {a.id}
                </option>
              ))}
            </select>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-xs text-on-surface-secondary mb-1.5">
              {isRTL ? 'المهمة / الطلب' : 'Task / Request'}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder={isRTL ? 'اكتب المهمة هنا…' : 'Describe the task…'}
              className="w-full text-sm rounded-lg border border-border bg-surface-secondary text-on-surface px-3 py-2 resize-none focus:outline-none focus:border-accent placeholder:text-on-surface-tertiary"
              autoFocus
            />
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-xs text-on-surface-secondary mb-1.5">
              {isRTL ? 'الجدولة' : 'Schedule'}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SCHEDULE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setSchedulePreset(p.value)}
                  className={cn(
                    'text-xs px-3 py-1 rounded-full border transition-colors',
                    schedulePreset === p.value
                      ? 'bg-accent text-on-accent border-accent'
                      : 'border-border text-on-surface-secondary hover:border-border-hover'
                  )}
                >
                  {p.label[language]}
                </button>
              ))}
            </div>
            {schedulePreset === '__custom__' && (
              <input
                type="text"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                placeholder={isRTL ? 'مثال: بعد 3 ساعات، الصبح، in 2 hours' : 'e.g. in 2 hours, tomorrow, بعد ساعة'}
                className="mt-2 w-full text-sm rounded-lg border border-border bg-surface-secondary text-on-surface px-3 py-2 focus:outline-none focus:border-accent placeholder:text-on-surface-tertiary"
              />
            )}
          </div>

          {/* Report on complete */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={reportOnComplete}
              onChange={(e) => setReportOnComplete(e.target.checked)}
              className="w-4 h-4 accent-[var(--color-accent)]"
            />
            <span className="text-xs text-on-surface-secondary">
              {isRTL ? 'أرسل النتيجة للصندوق عند الانتهاء' : 'Send result to inbox on complete'}
            </span>
          </label>

          {/* Toast */}
          {toast && (
            <p className={cn(
              'text-xs text-center px-3 py-2 rounded-lg',
              toast.includes('فشل') || toast.includes('failed')
                ? 'bg-red-500/10 text-red-500'
                : 'bg-green-500/10 text-green-600 dark:text-green-400'
            )}>
              {toast}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-4 py-2 rounded-lg border border-border text-on-surface-secondary hover:bg-surface-secondary"
          >
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() || submitting}
            className="text-xs px-4 py-2 rounded-lg bg-accent text-on-accent hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {isRTL ? 'كلّف الوكيل' : 'Assign Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
