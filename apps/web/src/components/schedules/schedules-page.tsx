'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Plus,
  Play,
  X,
  Bot,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ItemMenu, ShowArchivedToggle } from '@/components/ui/item-menu';

interface Schedule {
  id: string;
  name: { en: string; ar: string };
  agentId: string;
  prompt: string;
  cron: string;
  enabled: boolean;
  archived?: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResult: string | null;
  createdAt: string;
}

interface AgentOption {
  id: string;
  name: { en: string; ar: string };
}

const BUILTIN_AGENTS: AgentOption[] = [
  { id: 'manager', name: { en: "Al-Ra'i", ar: 'الراعي' } },
  { id: 'doctor', name: { en: 'Al-Duktor', ar: 'الدكتور' } },
  { id: 'research', name: { en: 'Al-Bahith', ar: 'الباحث' } },
  { id: 'reading-helper', name: { en: 'Al-Mulakhkhis', ar: 'المُلخِّص' } },
  { id: 'writing-critic', name: { en: 'Al-Naqid', ar: 'الناقد' } },
  { id: 'comparator', name: { en: 'Al-Muqarin', ar: 'المُقارِن' } },
  { id: 'content-creator', name: { en: 'Al-Sarid', ar: 'السارد' } },
  { id: 'creative', name: { en: "Al-Mubdi'", ar: 'المبدع' } },
  { id: 'tasks-agent', name: { en: 'Maham', ar: 'مهام' } },
  { id: 'analyst', name: { en: 'Al-Muhallil', ar: 'المحلل' } },
  { id: 'research-companion', name: { en: 'Al-Khuwy', ar: 'الخوي' } },
  { id: 'mudawwin', name: { en: 'Al-Mudawwin', ar: 'المُدوّن' } },
];

const CRON_PRESETS = [
  { label: { en: 'Every Hour', ar: 'كل ساعة' }, value: '0 * * * *' },
  { label: { en: 'Daily at 9 AM', ar: 'يومياً الساعة 9 صباحاً' }, value: '0 9 * * *' },
  { label: { en: 'Weekly (Monday)', ar: 'أسبوعياً (الإثنين)' }, value: '0 9 * * 1' },
  { label: { en: 'Monthly (1st)', ar: 'شهرياً (اليوم الأول)' }, value: '0 9 1 * *' },
];

function formatDate(d: string | null): string {
  if (!d) return '--';
  return new Date(d).toLocaleString();
}

export function SchedulesPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>(BUILTIN_AGENTS);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Form state
  const [formNameEn, setFormNameEn] = useState('');
  const [formNameAr, setFormNameAr] = useState('');
  const [formAgentId, setFormAgentId] = useState('manager');
  const [formPrompt, setFormPrompt] = useState('');
  const [formCron, setFormCron] = useState('0 9 * * *');
  const [formCustomCron, setFormCustomCron] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<Schedule[]>(`/api/schedules?archived=${showArchived}`).catch(() => []),
      apiFetch<Array<{ id: string; name: { en: string; ar: string } }>>('/api/custom-agents').catch(() => []),
    ]).then(([scheds, customs]) => {
      setSchedules(scheds);
      if (customs.length > 0) {
        setAgents([...BUILTIN_AGENTS, ...customs]);
      }
      setLoading(false);
    });
  }, [showArchived]);

  const refresh = useCallback(() => {
    apiFetch<Schedule[]>(`/api/schedules?archived=${showArchived}`)
      .then(setSchedules)
      .catch(() => {});
  }, [showArchived]);

  const handleCreate = useCallback(async () => {
    const cronVal = formCron === 'custom' ? formCustomCron : formCron;
    if (!formPrompt.trim() || !cronVal.trim()) return;
    try {
      await apiFetch('/api/schedules', {
        method: 'POST',
        body: JSON.stringify({
          name: { en: formNameEn || 'Unnamed', ar: formNameAr || 'بدون اسم' },
          agentId: formAgentId,
          prompt: formPrompt,
          cron: cronVal,
        }),
      });
      setShowForm(false);
      setFormNameEn('');
      setFormNameAr('');
      setFormAgentId('manager');
      setFormPrompt('');
      setFormCron('0 9 * * *');
      setFormCustomCron('');
      refresh();
    } catch {
      // ignore
    }
  }, [formNameEn, formNameAr, formAgentId, formPrompt, formCron, formCustomCron, refresh]);

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    await apiFetch(`/api/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }).catch(() => {});
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (id: string) => {
    await apiFetch(`/api/schedules/${id}`, { method: 'DELETE' }).catch(() => {});
    refresh();
  }, [refresh]);

  const handleArchive = useCallback(async (id: string, archived: boolean) => {
    await apiFetch(`/api/schedules/${id}/archive`, { method: 'PUT', body: JSON.stringify({ archived }) }).catch(() => {});
    refresh();
  }, [refresh]);

  const handleRunNow = useCallback(async (id: string) => {
    setRunningId(id);
    await apiFetch(`/api/schedules/${id}/run`, { method: 'POST' }).catch(() => {});
    setRunningId(null);
    refresh();
  }, [refresh]);

  const getAgentName = useCallback((agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent ? agent.name[language] : agentId;
  }, [agents, language]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-on-surface-tertiary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-[var(--radius)] bg-accent/10 text-accent">
            <Clock size={24} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-on-surface">
              {isRTL ? 'الجدولة' : 'Schedules'}
            </h1>
            <p className="text-sm text-on-surface-tertiary">
              {isRTL ? 'جدولة مهام تلقائية للوكلاء' : 'Schedule automated agent tasks'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ShowArchivedToggle value={showArchived} onChange={setShowArchived} isRTL={isRTL} />
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] bg-accent text-on-accent hover:bg-accent-hover transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            {isRTL ? 'جدولة جديدة' : 'New Schedule'}
          </button>
        </div>
      </div>

      {/* New Schedule Form */}
      {showForm && (
        <div className="mb-6 p-5 border border-border rounded-[var(--radius-lg)] bg-surface">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-on-surface">
              {isRTL ? 'جدولة جديدة' : 'New Schedule'}
            </h3>
            <button onClick={() => setShowForm(false)} className="text-on-surface-tertiary hover:text-on-surface">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-on-surface-secondary mb-1 block">
                {isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}
              </label>
              <input
                type="text"
                value={formNameEn}
                onChange={(e) => setFormNameEn(e.target.value)}
                placeholder="Daily research update"
                className="w-full px-3 py-2 text-sm bg-input border border-border rounded-[var(--radius)] text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-on-surface-secondary mb-1 block">
                {isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'}
              </label>
              <input
                type="text"
                value={formNameAr}
                onChange={(e) => setFormNameAr(e.target.value)}
                placeholder="تحديث البحث اليومي"
                dir="rtl"
                className="w-full px-3 py-2 text-sm bg-input border border-border rounded-[var(--radius)] text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs text-on-surface-secondary mb-1 block">
              {isRTL ? 'الوكيل' : 'Agent'}
            </label>
            <select
              value={formAgentId}
              onChange={(e) => setFormAgentId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-input border border-border rounded-[var(--radius)] text-on-surface focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name[language]}</option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="text-xs text-on-surface-secondary mb-1 block">
              {isRTL ? 'التعليمات' : 'Prompt'}
            </label>
            <textarea
              value={formPrompt}
              onChange={(e) => setFormPrompt(e.target.value)}
              placeholder={isRTL ? 'ماذا تريد من الوكيل أن يفعل؟' : 'What should the agent do?'}
              rows={3}
              dir={isRTL ? 'rtl' : 'ltr'}
              className="w-full px-3 py-2 text-sm bg-input border border-border rounded-[var(--radius)] text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div className="mb-4">
            <label className="text-xs text-on-surface-secondary mb-1 block">
              {isRTL ? 'الجدولة' : 'Schedule'}
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {CRON_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setFormCron(preset.value)}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-[var(--radius)] border transition-colors',
                    formCron === preset.value
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
                  )}
                >
                  {preset.label[language]}
                </button>
              ))}
              <button
                onClick={() => setFormCron('custom')}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-[var(--radius)] border transition-colors',
                  formCron === 'custom'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
                )}
              >
                {isRTL ? 'مخصص' : 'Custom'}
              </button>
            </div>
            {formCron === 'custom' && (
              <input
                type="text"
                value={formCustomCron}
                onChange={(e) => setFormCustomCron(e.target.value)}
                placeholder="0 */6 * * *"
                className="w-full px-3 py-2 text-sm bg-input border border-border rounded-[var(--radius)] text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-on-surface-secondary hover:text-on-surface rounded-[var(--radius)] hover:bg-surface-secondary transition-colors"
            >
              {isRTL ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={handleCreate}
              disabled={!formPrompt.trim()}
              className="px-4 py-2 text-sm font-medium rounded-[var(--radius)] bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {isRTL ? 'إنشاء' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Schedules List */}
      {schedules.length === 0 ? (
        <div className="text-center py-16">
          <Clock size={48} className="mx-auto mb-4 text-on-surface-tertiary/30" />
          <p className="text-on-surface-secondary text-sm">
            {isRTL ? 'لا توجد جدولات بعد' : 'No schedules yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <div
              key={schedule.id}
              className="border border-border rounded-[var(--radius-lg)] bg-surface overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(schedule.id, !schedule.enabled)}
                  className={cn(
                    'w-10 h-5 rounded-full transition-colors relative shrink-0',
                    schedule.enabled ? 'bg-accent' : 'bg-on-surface-tertiary/20'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
                      schedule.enabled ? 'translate-x-5' : 'translate-x-0.5'
                    )}
                  />
                </button>

                {/* Info */}
                <button
                  onClick={() => setExpandedId(expandedId === schedule.id ? null : schedule.id)}
                  className="flex-1 min-w-0 text-start"
                >
                  <p className="text-sm font-medium text-on-surface truncate">
                    {schedule.name[language]}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-on-surface-tertiary">
                    <span className="flex items-center gap-1">
                      <Bot size={11} />
                      {getAgentName(schedule.agentId)}
                    </span>
                    <span className="font-mono">{schedule.cron}</span>
                  </div>
                </button>

                {/* Status */}
                <div className="hidden sm:block text-end shrink-0">
                  <p className="text-[10px] text-on-surface-tertiary">
                    {isRTL ? 'آخر تشغيل' : 'Last run'}
                  </p>
                  <p className="text-xs text-on-surface-secondary">
                    {formatDate(schedule.lastRunAt)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleRunNow(schedule.id)}
                    disabled={runningId === schedule.id}
                    className="p-1.5 rounded-[var(--radius)] text-on-surface-tertiary hover:text-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
                    title={isRTL ? 'تشغيل الآن' : 'Run Now'}
                  >
                    {runningId === schedule.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Play size={14} />
                    )}
                  </button>
                  <ItemMenu
                    isRTL={isRTL}
                    archived={!!schedule.archived}
                    onArchive={() => handleArchive(schedule.id, true)}
                    onUnarchive={() => handleArchive(schedule.id, false)}
                    onDelete={() => handleDelete(schedule.id)}
                    deleteConfirmMessage={isRTL ? 'حذف هذه الجدولة نهائيًا؟' : 'Delete this schedule permanently?'}
                  />
                </div>
              </div>

              {/* Expanded: show prompt + next run + last result */}
              {expandedId === schedule.id && (
                <div className="px-4 py-3 border-t border-border bg-surface-secondary/30 space-y-2">
                  <div>
                    <p className="text-[10px] text-on-surface-tertiary uppercase tracking-wider mb-0.5">
                      {isRTL ? 'التعليمات' : 'Prompt'}
                    </p>
                    <p className="text-xs text-on-surface-secondary whitespace-pre-wrap" dir={isRTL ? 'rtl' : 'ltr'}>
                      {schedule.prompt}
                    </p>
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <p className="text-[10px] text-on-surface-tertiary uppercase tracking-wider">
                        {isRTL ? 'التشغيل القادم' : 'Next Run'}
                      </p>
                      <p className="text-xs text-on-surface-secondary">
                        {schedule.enabled ? formatDate(schedule.nextRunAt) : (isRTL ? 'معطل' : 'Disabled')}
                      </p>
                    </div>
                  </div>
                  {schedule.lastResult && (
                    <div>
                      <p className="text-[10px] text-on-surface-tertiary uppercase tracking-wider mb-0.5">
                        {isRTL ? 'آخر نتيجة' : 'Last Result'}
                      </p>
                      <div className="text-xs text-on-surface-secondary max-h-40 overflow-auto whitespace-pre-wrap bg-surface rounded-[var(--radius)] p-2 border border-border">
                        {schedule.lastResult.slice(0, 500)}
                        {schedule.lastResult.length > 500 && '...'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
