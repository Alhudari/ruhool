'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Key, Palette, Languages, Shield, HardDrive, FileText, DollarSign, Bell, CheckCircle, CheckSquare, Globe, Mic, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { ProvidersSettings } from './providers-settings';
import { PrivacySettings } from './privacy-settings';
import { BackupsSettings } from './backups-settings';
import { BudgetSettings } from './budget-settings';
import { NotificationSettings } from './notification-settings';
import { ExternalApisSettings } from './external-apis-settings';
import { VoiceSettings } from './voice-settings';
import { TimezoneSettings } from './timezone-settings';
import { TasksNotesSettings } from './tasks-notes-settings';
import { apiFetch } from '@/lib/api';

const TABS = [
  { id: 'providers', icon: Key, label: { en: 'API Providers', ar: 'مزودي API' } },
  { id: 'external-apis', icon: Globe, label: { en: 'External Services', ar: 'خدمات خارجية' } },
  { id: 'voice', icon: Mic, label: { en: 'Voice', ar: 'الصوت' } },
  { id: 'timezone', icon: Clock, label: { en: 'Time Zones', ar: 'المناطق الزمنية' } },
  { id: 'appearance', icon: Palette, label: { en: 'Appearance', ar: 'المظهر' } },
  { id: 'language', icon: Languages, label: { en: 'Language', ar: 'اللغة' } },
  { id: 'privacy', icon: Shield, label: { en: 'Privacy', ar: 'الخصوصية' } },
  { id: 'budget', icon: DollarSign, label: { en: 'Budget', ar: 'الميزانية' } },
  { id: 'notifications', icon: Bell, label: { en: 'Notifications', ar: 'الإشعارات' } },
  { id: 'tasks-notes', icon: CheckSquare, label: { en: 'Tasks & Notes', ar: 'المهام والملاحظات' } },
  { id: 'agent-notifications', icon: Bell, label: { en: 'Agent Notifications', ar: 'تنبيهات الوكلاء' } },
  { id: 'approvals', icon: CheckCircle, label: { en: 'Approval Level', ar: 'مستوى الموافقة' } },
  { id: 'backups', icon: HardDrive, label: { en: 'Backups', ar: 'النسخ الاحتياطية' } },
  { id: 'prompts', icon: FileText, label: { en: 'Prompts Library', ar: 'مكتبة التعليمات' } },
];

export function SettingsPage() {
  const { language } = useAppStore();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('providers');
  const isRTL = language === 'ar';

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Settings size={24} className="text-on-surface-secondary" />
        <h1 className="text-xl font-semibold text-on-surface">
          {isRTL ? 'الإعدادات' : 'Settings'}
        </h1>
      </div>

      <div className="flex gap-8">
        {/* Sidebar tabs */}
        <nav className="w-48 shrink-0 space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 rounded-[var(--radius)] text-sm transition-colors text-start',
                activeTab === tab.id
                  ? 'bg-surface-secondary text-on-surface font-medium'
                  : 'text-on-surface-secondary hover:bg-surface-secondary'
              )}
            >
              <tab.icon size={16} />
              {tab.label[language]}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'providers' && <ProvidersSettings />}
          {activeTab === 'external-apis' && <ExternalApisSettings />}
          {activeTab === 'voice' && <VoiceSettings />}
          {activeTab === 'timezone' && <TimezoneSettings />}
          {activeTab === 'appearance' && (
            <AppearanceSettings />
          )}
          {activeTab === 'language' && (
            <LanguageSettings />
          )}
          {activeTab === 'privacy' && <PrivacySettings />}
          {activeTab === 'budget' && <BudgetSettings />}
          {activeTab === 'notifications' && <NotificationSettings />}
          {activeTab === 'tasks-notes' && <TasksNotesSettings />}
          {activeTab === 'agent-notifications' && <AgentNotificationsRedirect router={router} />}
          {activeTab === 'approvals' && <ApprovalLevelSettings />}
          {activeTab === 'backups' && <BackupsSettings />}
          {activeTab === 'prompts' && <PromptsRedirect router={router} />}
        </div>
      </div>
    </div>
  );
}

function AppearanceSettings() {
  const { language, theme, setTheme, themeVariant, setThemeVariant } = useAppStore();
  const isRTL = language === 'ar';

  const themes = [
    { id: 'claude-clean', name: { en: 'Claude Clean', ar: 'كلود النظيف' }, desc: { en: 'Minimalist, professional', ar: 'بسيط واحترافي' } },
    { id: 'desert-caravan', name: { en: 'Desert Caravan', ar: 'قافلة الصحراء' }, desc: { en: 'Warm sand tones, Ruhool inspired', ar: 'ألوان رمال دافئة، مستوحى من الرحول' } },
    { id: 'academic', name: { en: 'Academic', ar: 'أكاديمي' }, desc: { en: 'Paper-like, serif, reading-focused', ar: 'ملمس ورقي، خطوط مذنبة، للقراءة' } },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-on-surface mb-1">
          {isRTL ? 'المظهر' : 'Appearance'}
        </h2>
        <p className="text-sm text-on-surface-secondary">
          {isRTL ? 'اختر الثيم والوضع' : 'Choose your theme and mode'}
        </p>
      </div>

      <div className="space-y-3">
        {themes.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-[var(--radius-lg)] border transition-colors text-start',
              theme === t.id
                ? 'border-accent bg-accent/5'
                : 'border-border hover:border-border-hover'
            )}
          >
            <div className={cn(
              'w-4 h-4 rounded-full border-2',
              theme === t.id ? 'border-accent bg-accent' : 'border-on-surface-tertiary'
            )} />
            <div>
              <p className="text-sm font-medium text-on-surface">{t.name[language]}</p>
              <p className="text-xs text-on-surface-tertiary mt-0.5">{t.desc[language]}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-sm text-on-surface-secondary mb-3">
          {isRTL ? 'الوضع' : 'Mode'}
        </p>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setThemeVariant(v)}
              className={cn(
                'px-4 py-2 rounded-[var(--radius)] text-sm transition-colors',
                themeVariant === v
                  ? 'bg-accent text-on-accent'
                  : 'bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary'
              )}
            >
              {v === 'light' ? (isRTL ? 'فاتح' : 'Light') :
               v === 'dark' ? (isRTL ? 'داكن' : 'Dark') :
               isRTL ? 'تلقائي' : 'System'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LanguageSettings() {
  const { language, setLanguage } = useAppStore();
  const isRTL = language === 'ar';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-on-surface mb-1">
          {isRTL ? 'اللغة' : 'Language'}
        </h2>
        <p className="text-sm text-on-surface-secondary">
          {isRTL ? 'اختر لغة الواجهة' : 'Choose your interface language'}
        </p>
      </div>

      <div className="space-y-3">
        {([
          { id: 'en' as const, name: 'English', native: 'English' },
          { id: 'ar' as const, name: 'Arabic', native: 'العربية' },
        ]).map((lang) => (
          <button
            key={lang.id}
            onClick={() => {
              setLanguage(lang.id);
              localStorage.setItem('ruhool-language', lang.id);
            }}
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-[var(--radius-lg)] border transition-colors text-start',
              language === lang.id
                ? 'border-accent bg-accent/5'
                : 'border-border hover:border-border-hover'
            )}
          >
            <div className={cn(
              'w-4 h-4 rounded-full border-2',
              language === lang.id ? 'border-accent bg-accent' : 'border-on-surface-tertiary'
            )} />
            <div>
              <p className="text-sm font-medium text-on-surface">{lang.native}</p>
              <p className="text-xs text-on-surface-tertiary mt-0.5">{lang.name}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PromptsRedirect({ router }: { router: ReturnType<typeof useRouter> }) {
  useEffect(() => {
    router.push('/settings/prompts');
  }, [router]);
  return null;
}

function AgentNotificationsRedirect({ router }: { router: ReturnType<typeof useRouter> }) {
  useEffect(() => {
    router.push('/settings/notifications');
  }, [router]);
  return null;
}

type ApprovalLevel = 'strict' | 'normal' | 'relaxed';

const APPROVAL_LEVELS: {
  id: ApprovalLevel;
  name: { en: string; ar: string };
  desc: { en: string; ar: string };
  color: string;
}[] = [
  {
    id: 'strict',
    name: { en: 'Strict', ar: 'صارم' },
    desc: {
      en: 'All agent actions require approval: create, update, delete, and memory changes.',
      ar: 'جميع إجراءات الوكلاء تتطلب موافقة: الإنشاء، التعديل، الحذف، وتغييرات الذاكرة.',
    },
    color: 'text-red-500',
  },
  {
    id: 'normal',
    name: { en: 'Normal', ar: 'عادي' },
    desc: {
      en: 'Only destructive actions need approval: delete agents and clear memories.',
      ar: 'فقط الإجراءات التدميرية تحتاج موافقة: حذف الوكلاء ومسح الذاكرة.',
    },
    color: 'text-amber-500',
  },
  {
    id: 'relaxed',
    name: { en: 'Relaxed', ar: 'مرن' },
    desc: {
      en: 'Only agent deletion requires approval. All other actions execute immediately.',
      ar: 'فقط حذف الوكلاء يتطلب موافقة. باقي الإجراءات تُنفّذ مباشرة.',
    },
    color: 'text-green-500',
  },
];

function ApprovalLevelSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [level, setLevel] = useState<ApprovalLevel>('normal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ level: ApprovalLevel }>('/api/settings/approval-level')
      .then((data) => setLevel(data.level))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = async (newLevel: ApprovalLevel) => {
    setLevel(newLevel);
    setSaving(true);
    try {
      await apiFetch('/api/settings/approval-level', {
        method: 'PUT',
        body: JSON.stringify({ level: newLevel }),
      });
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-on-surface mb-1">
          {isRTL ? 'مستوى الموافقة' : 'Approval Level'}
        </h2>
        <p className="text-sm text-on-surface-secondary">
          {isRTL
            ? 'تحكّم بمستوى الصرامة لنظام الموافقات. كلما كان أكثر صرامة، كلما احتاجت إجراءات أكثر لموافقتك.'
            : 'Control how strict the approval system is. Stricter means more actions need your approval before execution.'}
        </p>
      </div>

      <div className="space-y-3">
        {APPROVAL_LEVELS.map((lvl) => (
          <button
            key={lvl.id}
            onClick={() => handleChange(lvl.id)}
            disabled={saving}
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-[var(--radius-lg)] border transition-colors text-start',
              level === lvl.id
                ? 'border-accent bg-accent/5'
                : 'border-border hover:border-border-hover'
            )}
          >
            <div className={cn(
              'w-4 h-4 rounded-full border-2',
              level === lvl.id ? 'border-accent bg-accent' : 'border-on-surface-tertiary'
            )} />
            <div>
              <p className={cn('text-sm font-medium', lvl.color)}>
                {lvl.name[language]}
              </p>
              <p className="text-xs text-on-surface-tertiary mt-0.5">
                {lvl.desc[language]}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
