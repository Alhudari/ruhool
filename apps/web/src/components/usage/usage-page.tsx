'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  DollarSign,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface UsageSummary {
  totalCost: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

interface UsageRecord {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  durationMs: number;
  success: boolean;
}

type Period = 'today' | 'week' | 'month' | 'all';

export function UsagePage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [loading, setLoading] = useState(true);
  const [budget, setBudget] = useState<{ monthlyBudget: number; budgetAlertPercent: number } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, recentData, budgetData] = await Promise.all([
        apiFetch<UsageSummary>('/api/usage/summary'),
        apiFetch<UsageRecord[]>(`/api/usage/recent?period=${period}&limit=100`),
        apiFetch<{ monthlyBudget: number; budgetAlertPercent: number }>('/api/settings/budget'),
      ]);
      setSummary(summaryData);
      setRecords(recentData);
      setBudget(budgetData);
    } catch {}
    setLoading(false);
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;
  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
    return tokens.toString();
  };

  const periodLabels: Record<Period, { en: string; ar: string }> = {
    today: { en: 'Today', ar: 'اليوم' },
    week: { en: 'This Week', ar: 'هذا الأسبوع' },
    month: { en: 'This Month', ar: 'هذا الشهر' },
    all: { en: 'All Time', ar: 'الكل' },
  };

  const handleDownloadCSV = async () => {
    try {
      const allRecords = await apiFetch<UsageRecord[]>('/api/usage/recent?period=all&limit=10000');
      const header = 'timestamp,model,input_tokens,output_tokens,cost,duration\n';
      const rows = allRecords.map((r) =>
        [
          r.timestamp,
          r.model,
          r.inputTokens,
          r.outputTokens,
          r.totalCostUsd.toFixed(6),
          r.durationMs,
        ].join(',')
      ).join('\n');
      const csv = header + rows;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ruhool-usage-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
  };

  const periodRecordsCost = records.reduce((s, r) => s + r.totalCostUsd, 0);
  const periodRecordsCalls = records.length;
  const periodInputTokens = records.reduce((s, r) => s + r.inputTokens, 0);
  const periodOutputTokens = records.reduce((s, r) => s + r.outputTokens, 0);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <BarChart3 size={24} className="text-on-surface-secondary" />
          <h1 className="text-xl font-semibold text-on-surface">
            {isRTL ? 'الاستخدام والتكلفة' : 'Usage & Cost'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius)] text-xs bg-surface-secondary text-on-surface-secondary hover:text-on-surface hover:bg-surface-tertiary transition-colors"
          >
            <Download size={14} />
            {isRTL ? 'تحميل CSV' : 'Download CSV'}
          </button>

        <div className="flex gap-1 p-1 bg-surface-secondary rounded-[var(--radius)]">
          {(Object.keys(periodLabels) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1.5 rounded-[var(--radius-sm)] text-xs transition-colors',
                period === p
                  ? 'bg-accent text-on-accent'
                  : 'text-on-surface-secondary hover:text-on-surface'
              )}
            >
              {periodLabels[p][language]}
            </button>
          ))}
        </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-on-surface-tertiary" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              icon={<DollarSign size={18} />}
              label={isRTL ? 'التكلفة الإجمالية' : 'Total Cost'}
              value={formatCost(periodRecordsCost)}
              sublabel={summary ? `${isRTL ? 'كل الوقت:' : 'All time:'} ${formatCost(summary.totalCost)}` : undefined}
              color="text-green-400"
            />
            <StatCard
              icon={<Zap size={18} />}
              label={isRTL ? 'عدد المكالمات' : 'API Calls'}
              value={periodRecordsCalls.toString()}
              sublabel={summary ? `${isRTL ? 'كل الوقت:' : 'All time:'} ${summary.totalCalls}` : undefined}
              color="text-blue-400"
            />
            <StatCard
              icon={<ArrowUpRight size={18} />}
              label={isRTL ? 'رموز الإدخال' : 'Input Tokens'}
              value={formatTokens(periodInputTokens)}
              sublabel={summary ? `${isRTL ? 'كل الوقت:' : 'All time:'} ${formatTokens(summary.totalInputTokens)}` : undefined}
              color="text-amber-400"
            />
            <StatCard
              icon={<ArrowDownRight size={18} />}
              label={isRTL ? 'رموز الإخراج' : 'Output Tokens'}
              value={formatTokens(periodOutputTokens)}
              sublabel={summary ? `${isRTL ? 'كل الوقت:' : 'All time:'} ${formatTokens(summary.totalOutputTokens)}` : undefined}
              color="text-purple-400"
            />
          </div>

          {/* Budget Alert */}
          {budget && budget.monthlyBudget > 0 && summary && (() => {
            const spent = summary.totalCost;
            const pct = Math.min((spent / budget.monthlyBudget) * 100, 100);
            const isWarning = pct >= budget.budgetAlertPercent && pct < 100;
            const isOver = pct >= 100;
            return (
              <div className={cn(
                'mb-8 border rounded-[var(--radius-lg)] p-4 space-y-3',
                isOver ? 'border-red-500/50 bg-red-500/5' : isWarning ? 'border-amber-500/50 bg-amber-500/5' : 'border-border bg-surface'
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {(isWarning || isOver) && <AlertTriangle size={16} className={isOver ? 'text-red-400' : 'text-amber-400'} />}
                    <span className="text-sm font-medium text-on-surface">
                      {isRTL ? 'الميزانية الشهرية' : 'Monthly Budget'}
                    </span>
                  </div>
                  <span className={cn(
                    'text-sm font-medium tabular-nums',
                    isOver ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-on-surface'
                  )}>
                    ${spent.toFixed(2)} / ${budget.monthlyBudget.toFixed(2)}
                  </span>
                </div>
                <div className="w-full h-3 bg-surface-secondary rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      isOver ? 'bg-red-400' : isWarning ? 'bg-amber-400' : 'bg-accent'
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-on-surface-tertiary">
                  <span>{pct.toFixed(1)}%</span>
                  <span>
                    {isRTL ? `التنبيه عند ${budget.budgetAlertPercent}%` : `Alert at ${budget.budgetAlertPercent}%`}
                  </span>
                </div>
                {isWarning && (
                  <p className="text-xs text-amber-400 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    {isRTL
                      ? 'تحذير: اقتربت من حد الميزانية!'
                      : 'Warning: Approaching budget limit!'}
                  </p>
                )}
                {isOver && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    {isRTL
                      ? 'تجاوزت الميزانية! لقد تجاوزت الحد الشهري.'
                      : 'Over budget! You have exceeded your monthly limit.'}
                  </p>
                )}
              </div>
            );
          })()}

          {/* Records Table */}
          <div className="border border-border rounded-[var(--radius-lg)] bg-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-sm font-medium text-on-surface">
                {isRTL ? 'سجل المكالمات' : 'Call Log'}
              </h3>
            </div>

            {records.length === 0 ? (
              <div className="text-center py-12 text-on-surface-tertiary">
                <BarChart3 size={36} className="mx-auto mb-3 opacity-30" />
                <p>{isRTL ? 'لا توجد مكالمات في هذه الفترة' : 'No API calls in this period'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-on-surface-tertiary">
                      <th className="text-start px-5 py-2 font-medium">{isRTL ? 'الوقت' : 'Time'}</th>
                      <th className="text-start px-5 py-2 font-medium">{isRTL ? 'النموذج' : 'Model'}</th>
                      <th className="text-end px-5 py-2 font-medium">{isRTL ? 'الإدخال' : 'Input'}</th>
                      <th className="text-end px-5 py-2 font-medium">{isRTL ? 'الإخراج' : 'Output'}</th>
                      <th className="text-end px-5 py-2 font-medium">{isRTL ? 'التكلفة' : 'Cost'}</th>
                      <th className="text-end px-5 py-2 font-medium">{isRTL ? 'المدة' : 'Duration'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-surface-secondary/50 transition-colors">
                        <td className="px-5 py-2.5 text-on-surface-secondary whitespace-nowrap">
                          {new Date(r.timestamp).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-5 py-2.5">
                          <span className="text-on-surface font-mono text-xs bg-surface-secondary px-2 py-0.5 rounded">
                            {r.model.replace('claude-', '').replace('-20251001', '')}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-end text-on-surface-secondary tabular-nums">
                          {formatTokens(r.inputTokens)}
                        </td>
                        <td className="px-5 py-2.5 text-end text-on-surface-secondary tabular-nums">
                          {formatTokens(r.outputTokens)}
                        </td>
                        <td className="px-5 py-2.5 text-end text-on-surface tabular-nums font-medium">
                          {formatCost(r.totalCostUsd)}
                        </td>
                        <td className="px-5 py-2.5 text-end text-on-surface-tertiary tabular-nums">
                          {r.durationMs > 0 ? `${(r.durationMs / 1000).toFixed(1)}s` : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  color: string;
}) {
  return (
    <div className="border border-border rounded-[var(--radius-lg)] bg-surface p-4">
      <div className={cn('mb-2', color)}>{icon}</div>
      <p className="text-xs text-on-surface-tertiary mb-1">{label}</p>
      <p className="text-xl font-semibold text-on-surface tabular-nums">{value}</p>
      {sublabel && (
        <p className="text-xs text-on-surface-tertiary mt-1">{sublabel}</p>
      )}
    </div>
  );
}
