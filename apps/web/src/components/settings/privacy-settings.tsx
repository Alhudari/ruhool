'use client';

import { useState, useEffect } from 'react';
import { Shield, Server, Globe, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

type PrivacyMode = 'strict' | 'balanced' | 'open';

const MODES: {
  id: PrivacyMode;
  icon: typeof Shield;
  name: { en: string; ar: string };
  desc: { en: string; ar: string };
  color: string;
}[] = [
  {
    id: 'strict',
    icon: Server,
    name: { en: 'Strict', ar: 'صارم' },
    desc: {
      en: 'Local models only (Ollama). No data leaves your machine. Cloud API calls are blocked.',
      ar: 'نماذج محلية فقط (Ollama). لا تخرج بياناتك من جهازك. يتم حظر استدعاءات API السحابية.',
    },
    color: 'text-red-500',
  },
  {
    id: 'balanced',
    icon: Shield,
    name: { en: 'Balanced', ar: 'متوازن' },
    desc: {
      en: 'Cloud allowed for non-private content. Default mode for general use.',
      ar: 'السحابة مسموحة للمحتوى غير الخاص. الوضع الافتراضي للاستخدام العام.',
    },
    color: 'text-amber-500',
  },
  {
    id: 'open',
    icon: Globe,
    name: { en: 'Open', ar: 'مفتوح' },
    desc: {
      en: 'Cloud for everything. Maximum capability, all providers available.',
      ar: 'السحابة لكل شيء. أقصى قدرة، جميع المزودين متاحون.',
    },
    color: 'text-green-500',
  },
];

export function PrivacySettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [mode, setMode] = useState<PrivacyMode>('balanced');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ privacyMode: PrivacyMode }>('/api/settings/privacy')
      .then((data) => setMode(data.privacyMode))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = async (newMode: PrivacyMode) => {
    setSaving(true);
    try {
      await apiFetch('/api/settings/privacy', {
        method: 'PUT',
        body: JSON.stringify({ privacyMode: newMode }),
      });
      setMode(newMode);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-on-surface mb-1">
          {isRTL ? 'الخصوصية' : 'Privacy'}
        </h2>
        <p className="text-sm text-on-surface-secondary">
          {isRTL
            ? 'تحكم في كيفية معالجة بياناتك ومن يمكنه الوصول إليها'
            : 'Control how your data is processed and who can access it'}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-on-surface-tertiary py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">{isRTL ? 'جاري التحميل...' : 'Loading...'}</span>
        </div>
      ) : (
        <div className="space-y-3">
          {MODES.map((m) => {
            const Icon = m.icon;
            const isActive = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleChange(m.id)}
                disabled={saving}
                className={cn(
                  'w-full flex items-start gap-4 p-4 rounded-[var(--radius-lg)] border transition-colors text-start disabled:opacity-50',
                  isActive
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-border-hover'
                )}
              >
                <div className={cn(
                  'w-4 h-4 rounded-full border-2 mt-0.5 shrink-0',
                  isActive ? 'border-accent bg-accent' : 'border-on-surface-tertiary'
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon size={16} className={m.color} />
                    <p className="text-sm font-medium text-on-surface">{m.name[language]}</p>
                  </div>
                  <p className="text-xs text-on-surface-tertiary mt-1">{m.desc[language]}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="border-t border-border pt-4">
        <p className="text-xs text-on-surface-tertiary">
          {isRTL
            ? 'الوضع الحالي: ' + MODES.find((m) => m.id === mode)?.name.ar
            : 'Current mode: ' + MODES.find((m) => m.id === mode)?.name.en}
        </p>
      </div>
    </div>
  );
}
