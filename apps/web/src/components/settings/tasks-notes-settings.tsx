'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckSquare } from 'lucide-react';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CARD_COLORS } from '@/components/tasks/tasks-page';

interface TaskPrefs {
  defaultView?: 'list' | 'grid';
  defaultColor?: string;
  showCompleted?: boolean;
  autoArchiveDays?: number;
  dateFormat?: 'short' | 'long' | 'iso';
}

export function TasksNotesSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [prefs, setPrefs] = useState<TaskPrefs>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<TaskPrefs>('/api/task-prefs')
      .then((p) => setPrefs(p || {}))
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  }, []);

  const save = async (patch: Partial<TaskPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    try {
      await apiFetch<TaskPrefs>('/api/task-prefs', {
        method: 'PUT',
        body: JSON.stringify(next),
      });
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-on-surface-tertiary">
        <Loader2 className="animate-spin" size={16} /> {isRTL ? 'تحميل...' : 'Loading...'}
      </div>
    );
  }

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-2">
        <CheckSquare size={18} className="text-emerald-500" />
        <h2 className="text-lg font-semibold text-on-surface">
          {isRTL ? 'المهام والملاحظات' : 'Tasks & Notes'}
        </h2>
        {saving && <Loader2 className="animate-spin text-on-surface-tertiary" size={14} />}
      </div>

      {/* Default view */}
      <div>
        <label className="block text-sm text-on-surface-secondary mb-2">
          {isRTL ? 'العرض الافتراضي' : 'Default view'}
        </label>
        <div className="flex items-center gap-2">
          {(['list', 'grid'] as const).map((v) => (
            <button
              key={v}
              onClick={() => save({ defaultView: v })}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                (prefs.defaultView || 'list') === v
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-on-surface-tertiary hover:text-on-surface'
              )}
            >
              {v === 'list' ? (isRTL ? 'قائمة' : 'List') : (isRTL ? 'شبكة' : 'Grid')}
            </button>
          ))}
        </div>
      </div>

      {/* Default color */}
      <div>
        <label className="block text-sm text-on-surface-secondary mb-2">
          {isRTL ? 'اللون الافتراضي' : 'Default color'}
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          {CARD_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => save({ defaultColor: c.id })}
              className={cn(
                'w-7 h-7 rounded-full border-2 transition-colors',
                c.bg,
                (prefs.defaultColor || 'none') === c.id
                  ? 'border-accent ring-2 ring-accent/20'
                  : 'border-border'
              )}
              title={c.label}
            />
          ))}
        </div>
      </div>

      {/* Show completed toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-on-surface">
            {isRTL ? 'إظهار المهام المكتملة' : 'Show completed tasks'}
          </p>
          <p className="text-xs text-on-surface-tertiary">
            {isRTL ? 'افتراضياً عند فتح صفحة المهام' : 'By default when opening the tasks page'}
          </p>
        </div>
        <button
          onClick={() => save({ showCompleted: !prefs.showCompleted })}
          className={cn(
            'relative w-10 h-5 rounded-full transition-colors',
            prefs.showCompleted ? 'bg-accent' : 'bg-surface-secondary'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
              prefs.showCompleted ? 'start-5' : 'start-0.5'
            )}
          />
        </button>
      </div>

      {/* Auto-archive */}
      <div>
        <label className="block text-sm text-on-surface-secondary mb-2">
          {isRTL ? 'الأرشفة التلقائية للمهام المكتملة بعد (أيام)' : 'Auto-archive completed tasks after (days)'}
        </label>
        <input
          type="number"
          min={0}
          max={365}
          value={prefs.autoArchiveDays ?? 0}
          onChange={(e) => save({ autoArchiveDays: parseInt(e.target.value || '0', 10) })}
          className="w-32 bg-input border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-xs text-on-surface-tertiary mt-1">
          {isRTL ? '0 = بدون أرشفة تلقائية' : '0 = disabled'}
        </p>
      </div>

      {/* Date format */}
      <div>
        <label className="block text-sm text-on-surface-secondary mb-2">
          {isRTL ? 'صيغة التاريخ' : 'Date format'}
        </label>
        <div className="flex items-center gap-2">
          {(['short', 'long', 'iso'] as const).map((f) => (
            <button
              key={f}
              onClick={() => save({ dateFormat: f })}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                (prefs.dateFormat || 'short') === f
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-on-surface-tertiary hover:text-on-surface'
              )}
            >
              {f === 'short'
                ? (isRTL ? 'قصيرة' : 'Short')
                : f === 'long'
                ? (isRTL ? 'طويلة' : 'Long')
                : 'ISO'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
