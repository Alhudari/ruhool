'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity, Bot, CheckSquare, DollarSign, AlertTriangle, Database, RefreshCw, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface ObsStats {
  runs: { total: number; running: number; succeeded: number; failed: number; last24h: number };
  agents: Record<string, { calls: number; errors: number; totalCostUsd: number }>;
  tasks: { queued: number; running: number; done: number; failed: number; avgRetryCount: number };
  pipelines: { active: number; completed: number; partialFailure: number; scheduled: number };
  budget: { monthlyLimit: number | null; spentToday: number };
  entities: { total: number; byType: Record<string, number> };
  recentErrors: Array<{ action: string; details: string; at: string }>;
  generatedAt: string;
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: LucideIcon;
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex items-start gap-3">
      <div className={cn('p-2 rounded-lg', color ?? 'bg-accent/10')}>
        <Icon size={16} className={cn('text-accent', color && 'text-current')} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-on-surface-tertiary">{label}</p>
        <p className="text-lg font-semibold text-on-surface tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-on-surface-tertiary mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function ObservabilityDashboard() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [stats, setStats] = useState<ObsStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const data = await apiFetch<ObsStats>('/api/observability/stats');
      setStats(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, [fetch]);

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <RefreshCw size={20} className="animate-spin text-on-surface-tertiary" />
    </div>
  );
  if (!stats) return null;

  const topAgents = Object.entries(stats.agents)
    .sort(([, a], [, b]) => b.calls - a.calls)
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-on-surface">
            {isRTL ? 'لوحة المراقبة' : 'Observability'}
          </h2>
          <p className="text-[10px] text-on-surface-tertiary mt-0.5">
            {isRTL ? 'آخر تحديث: ' : 'Updated: '}
            {new Date(stats.generatedAt).toLocaleTimeString(isRTL ? 'ar-SA' : 'en-GB')}
          </p>
        </div>
        <button onClick={fetch} className="p-2 rounded-lg text-on-surface-tertiary hover:bg-surface-secondary">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Activity}
          label={isRTL ? 'Runs اليوم' : 'Runs Today'}
          value={stats.runs.last24h}
          sub={isRTL ? `${stats.runs.running} جارية` : `${stats.runs.running} running`}
        />
        <StatCard
          icon={CheckSquare}
          label={isRTL ? 'مهام نشطة' : 'Active Tasks'}
          value={stats.tasks.running + stats.tasks.queued}
          sub={isRTL ? `${stats.tasks.done} مكتملة` : `${stats.tasks.done} done`}
        />
        <StatCard
          icon={Bot}
          label={isRTL ? 'Pipelines' : 'Pipelines'}
          value={stats.pipelines.active + stats.pipelines.scheduled}
          sub={isRTL ? `${stats.pipelines.completed} مكتملة` : `${stats.pipelines.completed} completed`}
        />
        <StatCard
          icon={DollarSign}
          label={isRTL ? 'تكلفة اليوم' : "Today's Cost"}
          value={`$${stats.budget.spentToday.toFixed(3)}`}
          sub={stats.budget.monthlyLimit ? (isRTL ? `من $${stats.budget.monthlyLimit}` : `of $${stats.budget.monthlyLimit}`) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Top agents */}
        {topAgents.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-on-surface mb-3">
              {isRTL ? 'أكثر الوكلاء نشاطاً' : 'Top Agents'}
            </h3>
            <div className="space-y-2">
              {topAgents.map(([agentId, data]) => (
                <div key={agentId} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[9px] font-bold text-accent shrink-0">
                    {agentId.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-on-surface truncate">{agentId}</p>
                    <p className="text-[10px] text-on-surface-tertiary">{data.calls} calls · ${data.totalCostUsd.toFixed(3)}</p>
                  </div>
                  {data.errors > 0 && (
                    <span className="text-[9px] bg-red-500/15 text-red-500 px-1.5 py-0.5 rounded">
                      {data.errors} err
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Entity memory */}
        {stats.entities.total > 0 && (
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-on-surface mb-3 flex items-center gap-1.5">
              <Database size={12} />
              {isRTL ? `ذاكرة الكيانات (${stats.entities.total})` : `Entity Memory (${stats.entities.total})`}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(stats.entities.byType).map(([type, count]) => (
                <span key={type} className="text-[10px] bg-surface-secondary text-on-surface-secondary px-2 py-0.5 rounded-full">
                  {type}: {count}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recent errors */}
        {stats.recentErrors.length > 0 && (
          <div className="bg-surface border border-red-300/20 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-red-500 mb-3 flex items-center gap-1.5">
              <AlertTriangle size={12} />
              {isRTL ? 'أحدث الأخطاء' : 'Recent Errors'}
            </h3>
            <div className="space-y-2">
              {stats.recentErrors.slice(0, 4).map((e, i) => (
                <div key={i} className="text-[10px] text-on-surface-secondary border-s-2 border-red-300/40 ps-2">
                  <p className="font-medium">{e.action}</p>
                  <p className="text-on-surface-tertiary truncate">{e.details}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
