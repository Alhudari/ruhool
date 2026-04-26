'use client';

import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, X, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { AgentTaskDialog } from './AgentTaskDialog';

type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

interface AgentTask {
  id: string;
  agentId: string;
  prompt: string;
  status: TaskStatus;
  scheduledFor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  result: string | null;
  conversationId: string | null;
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

const AGENT_NAMES: Record<string, { ar: string; en: string }> = {
  manager:          { ar: 'الراعي',    en: "Al-Ra'i" },
  research:         { ar: 'الباحث',    en: 'Al-Bahith' },
  'reading-helper': { ar: 'المُلخِّص',  en: 'Al-Mulakhkhis' },
  'writing-critic': { ar: 'الناقد',    en: 'Al-Naqid' },
  comparator:       { ar: 'المُقارِن',  en: 'Al-Muqarin' },
  architect:        { ar: 'المصمم',    en: 'Al-Musammim' },
  'content-creator':{ ar: 'السارد',    en: 'Al-Sarid' },
  creative:         { ar: 'المبدع',    en: "Al-Mubdi'" },
  'tasks-agent':    { ar: 'مهام',      en: 'Maham' },
  analyst:          { ar: 'المحلل',    en: 'Al-Muhallil' },
  mudawwin:         { ar: 'المُدوّن',   en: 'Al-Mudawwin' },
  sayyaq:           { ar: 'الكاتب',    en: 'Al-Katib' },
  fatin:            { ar: 'الفطين',    en: 'Al-Fatin' },
  system:           { ar: 'النظام',    en: 'System' },
};

const STATUS_TABS: { key: TaskStatus | 'all'; label: { ar: string; en: string } }[] = [
  { key: 'running', label: { ar: 'الجارية',   en: 'Running' } },
  { key: 'queued',  label: { ar: 'المجدولة',  en: 'Queued' } },
  { key: 'done',    label: { ar: 'المنتهية',  en: 'Done' } },
  { key: 'failed',  label: { ar: 'الفاشلة',   en: 'Failed' } },
];

function relTime(iso: string | null, isRTL: boolean): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return isRTL ? 'الآن' : 'just now';
  if (m < 60) return isRTL ? `قبل ${m} د` : `${m}m ago`;
  const h = Math.floor(m / 60);
  return isRTL ? `قبل ${h} س` : `${h}h ago`;
}

export function AgentTasksPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [activeTab, setActiveTab] = useState<TaskStatus>('running');
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [counts, setCounts] = useState<Partial<Record<TaskStatus, number>>>({});

  const fetchTasks = useCallback(async (status: TaskStatus) => {
    setLoading(true);
    try {
      const data = await apiFetch<{ tasks: AgentTask[]; total: number }>(
        `/api/agent-tasks?status=${status}&limit=50`
      );
      setTasks(data.tasks);
      setTotal(data.total);
      setCounts((prev) => ({ ...prev, [status]: data.total }));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial + tab-change fetch
  useEffect(() => { void fetchTasks(activeTab); }, [activeTab, fetchTasks]);

  // Polling every 15s for running/queued
  useEffect(() => {
    if (activeTab !== 'running' && activeTab !== 'queued') return;
    const id = setInterval(() => { void fetchTasks(activeTab); }, 15_000);
    return () => clearInterval(id);
  }, [activeTab, fetchTasks]);

  const doCancel = async (id: string) => {
    try {
      await apiFetch(`/api/agent-tasks/${id}/cancel`, { method: 'POST' });
      void fetchTasks(activeTab);
    } catch { /* ignore */ }
  };

  const doRetry = async (id: string) => {
    try {
      await apiFetch(`/api/agent-tasks/${id}/retry`, { method: 'POST' });
      setActiveTab('queued');
    } catch { /* ignore */ }
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const agentName = (agentId: string) =>
    (AGENT_NAMES[agentId] ?? { ar: agentId, en: agentId })[language];

  return (
    <div className="flex flex-col h-full" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-on-surface">
            {isRTL ? 'مهام الوكلاء' : 'Agent Tasks'}
          </h1>
          <p className="text-xs text-on-surface-tertiary mt-0.5">
            {isRTL ? `${total} مهمة` : `${total} tasks`}
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-accent text-on-accent hover:opacity-90"
        >
          + {isRTL ? 'مهمة جديدة' : 'New Task'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-2 border-b border-border shrink-0 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as TaskStatus)}
            className={cn(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors',
              activeTab === tab.key
                ? 'bg-accent text-on-accent'
                : 'text-on-surface-secondary hover:bg-surface-secondary'
            )}
          >
            {tab.label[language]}
            {counts[tab.key as TaskStatus] !== undefined && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full',
                activeTab === tab.key ? 'bg-white/20' : 'bg-surface-secondary'
              )}>
                {counts[tab.key as TaskStatus]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-2">
        {loading && tasks.length === 0 && (
          <p className="text-xs text-on-surface-tertiary text-center py-8 animate-pulse">
            {isRTL ? 'جاري التحميل…' : 'Loading…'}
          </p>
        )}
        {!loading && tasks.length === 0 && (
          <p className="text-xs text-on-surface-tertiary text-center py-8">
            {isRTL ? 'لا توجد مهام' : 'No tasks'}
          </p>
        )}

        {tasks.map((task) => {
          const isExpanded = expanded.has(task.id);
          const isRunning = task.status === 'running';
          const isFailed = task.status === 'failed';
          const isDone = task.status === 'done';
          const isQueued = task.status === 'queued';

          return (
            <div
              key={task.id}
              className={cn(
                'rounded-xl border bg-surface p-4 transition-colors',
                isRunning ? 'border-accent/30 animate-pulse' : 'border-border',
                isFailed && 'border-red-300/40'
              )}
            >
              {/* Card header */}
              <div className="flex items-start gap-3">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0',
                  isRunning ? 'bg-accent' :
                  isDone    ? 'bg-green-500' :
                  isFailed  ? 'bg-red-500' :
                  isQueued  ? 'bg-amber-500' : 'bg-surface-tertiary'
                )}>
                  {agentName(task.agentId).slice(0, 1)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-on-surface">
                      {agentName(task.agentId)}
                    </span>
                    <span className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full font-medium',
                      isRunning ? 'bg-accent/15 text-accent' :
                      isDone    ? 'bg-green-500/15 text-green-600 dark:text-green-400' :
                      isFailed  ? 'bg-red-500/15 text-red-500' :
                      isQueued  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
                      'bg-surface-secondary text-on-surface-tertiary'
                    )}>
                      {isRTL
                        ? (isRunning ? 'جارية' : isDone ? 'مكتملة' : isFailed ? 'فاشلة' : isQueued ? 'بالطابور' : 'ملغاة')
                        : task.status}
                    </span>
                    <span className="text-[10px] text-on-surface-tertiary ms-auto">
                      {relTime(task.startedAt ?? task.createdAt, isRTL)}
                    </span>
                  </div>

                  <p className="text-xs text-on-surface-secondary mt-1 truncate">
                    {task.label ?? task.prompt}
                  </p>

                  {task.scheduledFor && isQueued && (
                    <p className="text-[10px] text-amber-500 mt-0.5">
                      {isRTL ? 'مجدولة: ' : 'Scheduled: '}
                      {new Date(task.scheduledFor).toLocaleString(isRTL ? 'ar-SA' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {(isRunning || isQueued) && (
                    <button
                      onClick={() => doCancel(task.id)}
                      title={isRTL ? 'إلغاء' : 'Cancel'}
                      className="p-1.5 rounded text-on-surface-tertiary hover:text-red-500 hover:bg-red-500/10"
                    >
                      <X size={14} />
                    </button>
                  )}
                  {isFailed && (
                    <button
                      onClick={() => doRetry(task.id)}
                      title={isRTL ? 'إعادة المحاولة' : 'Retry'}
                      className="p-1.5 rounded text-on-surface-tertiary hover:text-accent hover:bg-accent/10"
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                  {task.conversationId && (
                    <a
                      href={`/chat?conv=${task.conversationId}`}
                      title={isRTL ? 'فتح المحادثة' : 'Open conversation'}
                      className="p-1.5 rounded text-on-surface-tertiary hover:text-accent hover:bg-accent/10"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                  {(isDone || isFailed) && task.result && (
                    <button
                      onClick={() => toggleExpand(task.id)}
                      title={isRTL ? 'عرض النتيجة' : 'View result'}
                      className="p-1.5 rounded text-on-surface-tertiary hover:text-on-surface hover:bg-surface-secondary"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded result */}
              {isExpanded && task.result && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[10px] text-on-surface-tertiary mb-1.5">
                    {isRTL ? 'النتيجة' : 'Result'}
                  </p>
                  <p className="text-xs text-on-surface-secondary whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                    {task.result}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AgentTaskDialog open={dialogOpen} onClose={() => { setDialogOpen(false); void fetchTasks(activeTab); }} />
    </div>
  );
}
