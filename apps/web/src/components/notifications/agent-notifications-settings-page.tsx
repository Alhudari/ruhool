'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bell, Save, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface AgentNotificationSettings {
  agentId: string;
  enabled: boolean;
  instructions: string;
  schedule?: string;
  triggers: {
    onTaskComplete?: boolean;
    onTaskOverdue?: boolean;
    onAgentFinish?: boolean;
    onError?: boolean;
    custom?: string[];
  };
  dailyDigestTime?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

const BUILTIN_AGENTS = [
  { id: 'manager', name: { en: 'Al-Ra\'i', ar: 'الراعي' } },
  { id: 'tasks-agent', name: { en: 'Maham', ar: 'مهام' } },
  { id: 'research', name: { en: 'Al-Bahith', ar: 'الباحث' } },
  { id: 'reading-helper', name: { en: 'Al-Mulakhkhis', ar: 'المُلخِّص' } },
  { id: 'writing-critic', name: { en: 'Al-Naqid', ar: 'الناقد' } },
  { id: 'comparator', name: { en: 'Al-Muqarin', ar: 'المُقارِن' } },
  { id: 'architect', name: { en: "Al-Ra'i", ar: 'الراعي' } },
  { id: 'content-creator', name: { en: 'Al-Sarid', ar: 'السارد' } },
  { id: 'creative', name: { en: "Al-Mubdi'", ar: 'المبدع' } },
];

const TRIGGERS: Array<{ key: keyof AgentNotificationSettings['triggers']; label: { en: string; ar: string } }> = [
  { key: 'onTaskComplete', label: { en: 'On task complete', ar: 'عند انتهاء مهمة' } },
  { key: 'onTaskOverdue', label: { en: 'On task overdue', ar: 'عند تأخر مهمة' } },
  { key: 'onAgentFinish', label: { en: 'On agent finish', ar: 'عند انتهاء الوكيل من عمل' } },
  { key: 'onError', label: { en: 'On error', ar: 'عند حدوث خطأ' } },
];

function AgentCard({ agent, isRTL, language }: { agent: { id: string; name: { en: string; ar: string } }; isRTL: boolean; language: 'en' | 'ar' }) {
  const [settings, setSettings] = useState<AgentNotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await apiFetch<AgentNotificationSettings>(`/api/agents/${agent.id}/notification-settings`);
      setSettings(s);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [agent.id]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await apiFetch(`/api/agents/${agent.id}/notification-settings`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled: settings.enabled,
          instructions: settings.instructions,
          schedule: settings.schedule || undefined,
          triggers: settings.triggers,
          dailyDigestTime: settings.dailyDigestTime || null,
          quietHoursStart: settings.quietHoursStart || null,
          quietHoursEnd: settings.quietHoursEnd || null,
        }),
      });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="p-4 border border-border rounded-[var(--radius-lg)] flex items-center justify-center">
        <Loader2 size={16} className="animate-spin text-on-surface-tertiary" />
      </div>
    );
  }

  return (
    <div className="p-4 border border-border rounded-[var(--radius-lg)] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-sm font-medium text-accent">
            {agent.name[language].charAt(0)}
          </div>
          <span className="text-sm font-medium text-on-surface">{agent.name[language]}</span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-surface-tertiary peer-checked:bg-accent rounded-full relative transition-colors">
            <div className={cn(
              'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform',
              settings.enabled ? (isRTL ? 'right-0.5 -translate-x-4' : 'left-0.5 translate-x-4') : (isRTL ? 'right-0.5' : 'left-0.5')
            )} />
          </div>
        </label>
      </div>

      {settings.enabled && (
        <>
          <div>
            <label className="block text-xs text-on-surface-secondary mb-1">
              {isRTL ? 'تعليمات مخصصة للتنبيهات' : 'Custom notification instructions'}
            </label>
            <textarea
              value={settings.instructions}
              onChange={(e) => setSettings({ ...settings, instructions: e.target.value })}
              rows={2}
              placeholder={isRTL ? 'اكتب تعليمات مخصصة للتنبيهات' : 'When should this agent notify you?'}
              className="w-full px-3 py-2 text-xs bg-surface-secondary border border-border rounded-[var(--radius)] text-on-surface placeholder:text-on-surface-tertiary resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-on-surface-secondary mb-1.5">
              {isRTL ? 'المحفزات' : 'Triggers'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TRIGGERS.map((t) => (
                <label key={t.key} className="flex items-center gap-2 text-xs text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.triggers[t.key])}
                    onChange={(e) => setSettings({ ...settings, triggers: { ...settings.triggers, [t.key]: e.target.checked } })}
                    className="rounded"
                  />
                  {t.label[language]}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-on-surface-secondary mb-1">
                {isRTL ? 'ملخص يومي' : 'Daily digest'}
              </label>
              <input
                type="time"
                value={settings.dailyDigestTime || ''}
                onChange={(e) => setSettings({ ...settings, dailyDigestTime: e.target.value })}
                className="w-full px-2 py-1.5 text-xs bg-surface-secondary border border-border rounded-[var(--radius)] text-on-surface"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-secondary mb-1">
                {isRTL ? 'بداية الهدوء' : 'Quiet start'}
              </label>
              <input
                type="time"
                value={settings.quietHoursStart || ''}
                onChange={(e) => setSettings({ ...settings, quietHoursStart: e.target.value })}
                className="w-full px-2 py-1.5 text-xs bg-surface-secondary border border-border rounded-[var(--radius)] text-on-surface"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-secondary mb-1">
                {isRTL ? 'نهاية الهدوء' : 'Quiet end'}
              </label>
              <input
                type="time"
                value={settings.quietHoursEnd || ''}
                onChange={(e) => setSettings({ ...settings, quietHoursEnd: e.target.value })}
                className="w-full px-2 py-1.5 text-xs bg-surface-secondary border border-border rounded-[var(--radius)] text-on-surface"
              />
            </div>
          </div>
        </>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {savedAt && (
          <span className="text-xs text-green-500">{isRTL ? 'تم الحفظ' : 'Saved'}</span>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 text-xs rounded-[var(--radius)] bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {isRTL ? 'حفظ' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export function AgentNotificationsSettingsPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [customAgents, setCustomAgents] = useState<Array<{ id: string; name: { en: string; ar: string } }>>([]);

  useEffect(() => {
    apiFetch<Array<{ id: string; name: { en: string; ar: string } }>>('/api/custom-agents')
      .then(setCustomAgents)
      .catch(() => {});
  }, []);

  const allAgents = [...BUILTIN_AGENTS, ...customAgents];

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Bell size={22} className="text-on-surface-secondary" />
        <h1 className="text-xl font-semibold text-on-surface">
          {isRTL ? 'تنبيهات الوكلاء' : 'Agent Notifications'}
        </h1>
      </div>
      <p className="text-sm text-on-surface-secondary mb-6">
        {isRTL
          ? 'تحكّم بأي الوكلاء يمكنهم إرسال تنبيهات، ومتى، وكيف'
          : 'Control which agents can send you notifications, when, and how'}
      </p>
      <div className="space-y-3">
        {allAgents.map((a) => (
          <AgentCard key={a.id} agent={a} isRTL={isRTL} language={language} />
        ))}
      </div>
    </div>
  );
}
