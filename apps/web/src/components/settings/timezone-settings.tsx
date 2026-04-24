'use client';

import { useEffect, useState } from 'react';
import { Clock, Globe } from 'lucide-react';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { SaveBar, useSaveBarHeight } from '@/components/settings/save-bar';

const COMMON_ZONES = [
  { tz: 'Asia/Kuwait', labelAr: 'الكويت', labelEn: 'Kuwait', offset: '+03:00' },
  { tz: 'Europe/London', labelAr: 'لندن', labelEn: 'London', offset: '+00:00/+01:00' },
  { tz: 'Asia/Riyadh', labelAr: 'الرياض', labelEn: 'Riyadh', offset: '+03:00' },
  { tz: 'Asia/Dubai', labelAr: 'دبي', labelEn: 'Dubai', offset: '+04:00' },
  { tz: 'Europe/Paris', labelAr: 'باريس', labelEn: 'Paris', offset: '+01:00/+02:00' },
  { tz: 'America/New_York', labelAr: 'نيويورك', labelEn: 'New York', offset: '-05:00/-04:00' },
  { tz: 'America/Los_Angeles', labelAr: 'لوس أنجلوس', labelEn: 'Los Angeles', offset: '-08:00/-07:00' },
  { tz: 'Asia/Tokyo', labelAr: 'طوكيو', labelEn: 'Tokyo', offset: '+09:00' },
  { tz: 'Asia/Singapore', labelAr: 'سنغافورة', labelEn: 'Singapore', offset: '+08:00' },
  { tz: 'Australia/Sydney', labelAr: 'سيدني', labelEn: 'Sydney', offset: '+10:00/+11:00' },
];

type TimezoneValues = { primary: string; secondary: string };

export function TimezoneSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [primary, setPrimary] = useState('Asia/Kuwait');
  const [secondary, setSecondary] = useState<string>('Europe/London');
  const [original, setOriginal] = useState<TimezoneValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [live, setLive] = useState<{ primary: { formatted: string; formattedAr: string }; secondary: { formatted: string; formattedAr: string } | null } | null>(null);

  useEffect(() => {
    apiFetch<{ primary: string; secondary?: string }>('/api/settings/timezones')
      .then((r) => {
        const loaded: TimezoneValues = { primary: r.primary, secondary: r.secondary ?? '' };
        setPrimary(loaded.primary);
        setSecondary(loaded.secondary);
        setOriginal(loaded);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const load = () => apiFetch<{ primary: { formatted: string; formattedAr: string }; secondary: { formatted: string; formattedAr: string } | null }>('/api/time').then(setLive).catch(() => {});
    load();
    const iv = setInterval(load, 1000);
    return () => clearInterval(iv);
  }, []);

  const dirty = original !== null && (primary !== original.primary || secondary !== original.secondary);
  useUnsavedChanges(dirty);
  const saveBarPad = useSaveBarHeight(dirty || !!successMessage);

  const save = async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
      await apiFetch('/api/settings/timezones', { method: 'PUT', body: JSON.stringify({ primary, secondary: secondary || undefined }) });
      setOriginal({ primary, secondary });
      setSuccessMessage(isRTL ? 'حُفظ' : 'Saved');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : (isRTL ? 'فشل الحفظ' : 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!original) return;
    setPrimary(original.primary);
    setSecondary(original.secondary);
    setErrorMessage(null);
  };

  return (
    <div className="space-y-5" dir={isRTL ? 'rtl' : 'ltr'}>
      <div>
        <h2 className="text-lg font-medium text-on-surface mb-1 flex items-center gap-2">
          <Globe size={18} />
          {isRTL ? 'المناطق الزمنية' : 'Time Zones'}
        </h2>
        <p className="text-sm text-on-surface-secondary">
          {isRTL ? 'كل الوكلاء يستخدمون هذه المناطق عند تفسير "اليوم"، "بكرة"، أو أي تاريخ.' : 'All agents use these zones when interpreting "today", "tomorrow", or any date.'}
        </p>
      </div>

      {/* Live preview */}
      {live && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-[var(--radius-lg)] border border-accent/30 bg-accent/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={14} className="text-accent" />
              <span className="text-xs font-bold text-accent uppercase">{isRTL ? 'الأساسية' : 'Primary'}</span>
              <span className="text-[10px] text-on-surface-tertiary">{primary}</span>
            </div>
            <div className="text-lg font-mono text-on-surface">{live.primary.formatted}</div>
            <div className="text-xs text-on-surface-secondary mt-1">{live.primary.formattedAr}</div>
          </div>
          {live.secondary && (
            <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={14} className="text-on-surface-tertiary" />
                <span className="text-xs font-bold text-on-surface-tertiary uppercase">{isRTL ? 'الثانوية' : 'Secondary'}</span>
                <span className="text-[10px] text-on-surface-tertiary">{secondary}</span>
              </div>
              <div className="text-lg font-mono text-on-surface">{live.secondary.formatted}</div>
              <div className="text-xs text-on-surface-secondary mt-1">{live.secondary.formattedAr}</div>
            </div>
          )}
        </div>
      )}

      {/* Selectors */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-on-surface mb-1">
            {isRTL ? 'المنطقة الأساسية' : 'Primary timezone'}
          </label>
          <select value={primary} onChange={(e) => setPrimary(e.target.value)} className="w-full bg-input border border-border rounded-[var(--radius)] px-3 py-2 text-sm">
            {COMMON_ZONES.map((z) => <option key={z.tz} value={z.tz}>{z.tz} — {isRTL ? z.labelAr : z.labelEn} ({z.offset})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-on-surface mb-1">
            {isRTL ? 'المنطقة الثانوية (للسفر أو التعاون الدولي)' : 'Secondary timezone (travel / international work)'}
          </label>
          <select value={secondary} onChange={(e) => setSecondary(e.target.value)} className="w-full bg-input border border-border rounded-[var(--radius)] px-3 py-2 text-sm">
            <option value="">{isRTL ? '(لا شيء)' : '(none)'}</option>
            {COMMON_ZONES.map((z) => <option key={z.tz} value={z.tz}>{z.tz} — {isRTL ? z.labelAr : z.labelEn} ({z.offset})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-on-surface mb-1">
            {isRTL ? 'أو أدخل IANA مخصصة' : 'Or enter custom IANA'}
          </label>
          <input
            type="text" value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            placeholder="e.g., Asia/Tokyo"
            className="w-full bg-input border border-border rounded-[var(--radius)] px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>

      <div style={{ height: saveBarPad }} aria-hidden="true" />
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={save}
        onDiscard={discard}
        successMessage={successMessage}
        errorMessage={errorMessage}
      />
    </div>
  );
}
