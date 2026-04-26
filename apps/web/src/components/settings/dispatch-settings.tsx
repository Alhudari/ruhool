'use client';

import { useState, useEffect } from 'react';
import { Network, Save, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface DispatchLimits {
  hierarchicalDispatchUsd?: number;
  dispatchMaxFanout?: number;
}

export function DispatchSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [limits, setLimits] = useState<DispatchLimits>({ hierarchicalDispatchUsd: 0.5, dispatchMaxFanout: 3 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dispatchEnabled, setDispatchEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ enabled: boolean }>('/api/dispatch/config').catch(() => ({ enabled: false })),
      apiFetch<{ limits?: DispatchLimits }>('/api/store/dispatch-limits').catch(() => ({ limits: undefined })),
    ]).then(([config, store]) => {
      setDispatchEnabled(config.enabled);
      if (store.limits) setLimits(store.limits);
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/settings/dispatch', {
        method: 'PUT',
        body: JSON.stringify({ limits }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex items-center gap-2 py-8 text-on-surface-tertiary">
      <Loader2 className="h-4 w-4 animate-spin" />
      {isRTL ? 'جاري التحميل...' : 'Loading...'}
    </div>
  );

  return (
    <div className={cn('space-y-6', isRTL && 'rtl')}>
      <div className="flex items-center gap-3">
        <Network size={20} className="text-primary" />
        <div>
          <h2 className="text-base font-semibold">{isRTL ? 'الإسناد الهرمي' : 'Hierarchical Dispatch'}</h2>
          <p className="text-sm text-on-surface-tertiary">
            {isRTL ? 'إعدادات تشغيل الوكلاء: CEO → مدير القسم → عمال → تجميع' : 'Agent dispatch settings: CEO → dept manager → workers → synthesis'}
          </p>
        </div>
        <div className={cn(
          'ms-auto px-2.5 py-1 rounded-full text-xs font-medium',
          dispatchEnabled ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-600'
        )}>
          {dispatchEnabled ? (isRTL ? 'مفعّل' : 'Enabled') : (isRTL ? 'معطّل' : 'Disabled')}
        </div>
      </div>

      <div className="space-y-4 border border-border rounded-xl p-4">
        <div>
          <label className="text-sm font-medium block mb-1">
            {isRTL ? 'حد الميزانية لكل dispatch ($)' : 'Budget cap per dispatch ($)'}
          </label>
          <p className="text-xs text-on-surface-tertiary mb-2">
            {isRTL ? 'إذا وصلت التكلفة لهذا الحد، يتوقف الـ dispatch ويعيد ما أُنجز' : 'When cost reaches this limit, dispatch stops and returns what was completed'}
          </p>
          <input
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            value={limits.hierarchicalDispatchUsd ?? 0.5}
            onChange={(e) => setLimits(l => ({ ...l, hierarchicalDispatchUsd: parseFloat(e.target.value) || 0.5 }))}
            className="w-32 h-9 rounded-[var(--radius)] bg-input border border-border px-3 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">
            {isRTL ? 'الحد الأقصى للعمال المتوازيين' : 'Max parallel workers (fan-out)'}
          </label>
          <p className="text-xs text-on-surface-tertiary mb-2">
            {isRTL ? 'عدد الوكلاء المتخصصين الذين يعملون في نفس الوقت داخل القسم الواحد' : 'Number of specialist agents working simultaneously within a single department'}
          </p>
          <input
            type="number"
            min={1}
            max={10}
            step={1}
            value={limits.dispatchMaxFanout ?? 3}
            onChange={(e) => setLimits(l => ({ ...l, dispatchMaxFanout: parseInt(e.target.value) || 3 }))}
            className="w-24 h-9 rounded-[var(--radius)] bg-input border border-border px-3 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] bg-primary text-on-primary text-sm font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isRTL ? 'حفظ' : 'Save'}
        </button>
        {saved && (
          <span className="text-sm text-emerald-600">{isRTL ? 'تم الحفظ ✓' : 'Saved ✓'}</span>
        )}
        <a
          href="/agents"
          className="ms-auto flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {isRTL ? 'عرض هيكل الوكلاء' : 'View agent org'}
        </a>
      </div>

      <div className="border border-border rounded-xl p-4 bg-surface-variant/20 text-sm space-y-2">
        <p className="font-medium text-on-surface">{isRTL ? 'كيف يعمل الإسناد الهرمي؟' : 'How does hierarchical dispatch work?'}</p>
        <ol className={cn('space-y-1 text-on-surface-secondary', isRTL ? 'pe-4' : 'ps-4', 'list-decimal')}>
          <li>{isRTL ? 'المستخدم يرسل طلباً' : 'User sends a request'}</li>
          <li>{isRTL ? 'الراعي (CEO) يحدد القسم المناسب' : "Al-Ra'i (CEO) selects the appropriate department"}</li>
          <li>{isRTL ? 'مدير القسم يوزّع المهمة على الوكلاء المتخصصين' : 'Dept manager distributes task to specialist workers'}</li>
          <li>{isRTL ? 'الوكلاء يعملون بالتوازي (max workers above)' : 'Workers run in parallel (max workers set above)'}</li>
          <li>{isRTL ? 'مدير القسم يجمّع النتائج في رد واحد' : 'Dept manager synthesizes results into one reply'}</li>
        </ol>
      </div>
    </div>
  );
}
