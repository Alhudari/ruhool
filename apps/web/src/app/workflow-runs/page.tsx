'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Workflow, Plus, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/app';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/workflow-runs/status-badge';
import { PlanDialog } from '@/components/workflow-runs/plan-dialog';
import type { WorkflowRun, WorkflowRunStatus } from '@/hooks/use-workflow-sse';

type FilterKey = 'all' | 'running' | 'completed' | 'failed' | 'canceled' | 'paused';

const FILTERS: { key: FilterKey; en: string; ar: string }[] = [
  { key: 'all', en: 'All', ar: 'الكل' },
  { key: 'running', en: 'Running', ar: 'قيد التشغيل' },
  { key: 'completed', en: 'Completed', ar: 'اكتمل' },
  { key: 'failed', en: 'Failed', ar: 'فشل' },
  { key: 'canceled', en: 'Canceled', ar: 'ملغى' },
  { key: 'paused', en: 'Paused', ar: 'متوقف' },
];

function formatDate(iso?: string, isRTL = false) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(isRTL ? 'ar' : 'en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function duration(run: WorkflowRun) {
  if (!run.startedAt) return '—';
  const start = new Date(run.startedAt).getTime();
  const end = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
  const secs = Math.max(0, Math.round((end - start) / 1000));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

export default function WorkflowRunsListPage() {
  const router = useRouter();
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showPlan, setShowPlan] = useState(false);

  const fetchRuns = useCallback(async () => {
    try {
      const data = await apiFetch<WorkflowRun[]>('/api/workflow-runs');
      setRuns(Array.isArray(data) ? data : []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
    const id = setInterval(fetchRuns, 5000);
    return () => clearInterval(id);
  }, [fetchRuns]);

  const filtered = useMemo(() => {
    if (filter === 'all') return runs;
    return runs.filter((r) => (r.status as WorkflowRunStatus) === filter);
  }, [runs, filter]);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Workflow size={24} className="text-on-surface-secondary" />
            <h1 className="text-xl font-semibold text-on-surface">
              {isRTL ? 'مسارات العمل' : 'Workflow Runs'}
            </h1>
          </div>
          <button
            onClick={() => setShowPlan(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors"
          >
            <Plus size={16} />
            {isRTL ? 'مسار جديد' : 'New run'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs border transition-colors',
                filter === f.key
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-on-surface-secondary hover:bg-surface-secondary',
              )}
            >
              {isRTL ? f.ar : f.en}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-on-surface-tertiary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-on-surface-tertiary">
            <Workflow size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg mb-2">
              {isRTL ? 'لا توجد مسارات بعد' : 'No runs yet'}
            </p>
            <p className="text-sm">
              {isRTL ? 'أنشئ مسارًا جديدًا للبدء' : 'Create a new run to get started'}
            </p>
          </div>
        ) : (
          <div className="border border-border rounded-[var(--radius-lg)] bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary/50 text-xs text-on-surface-tertiary uppercase">
                <tr>
                  <th className="text-start px-4 py-2 font-medium">{isRTL ? 'العنوان' : 'Title'}</th>
                  <th className="text-start px-4 py-2 font-medium">{isRTL ? 'الحالة' : 'Status'}</th>
                  <th className="text-start px-4 py-2 font-medium">{isRTL ? 'الخطوات' : 'Steps'}</th>
                  <th className="text-start px-4 py-2 font-medium">{isRTL ? 'التكلفة' : 'Cost'}</th>
                  <th className="text-start px-4 py-2 font-medium">{isRTL ? 'البدء' : 'Started'}</th>
                  <th className="text-start px-4 py-2 font-medium">{isRTL ? 'المدة' : 'Duration'}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((run) => {
                  const steps = Array.isArray(run.steps) ? run.steps : [];
                  const done = steps.filter(
                    (s) => s.status === 'completed' || s.status === 'skipped',
                  ).length;
                  return (
                    <tr
                      key={run.id}
                      onClick={() => router.push(`/workflow-runs/${run.id}`)}
                      className="border-t border-border hover:bg-surface-secondary/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-on-surface font-medium truncate max-w-xs">
                        {run.title || run.userRequest?.slice(0, 60) || run.id}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={run.status as WorkflowRunStatus} isRTL={isRTL} />
                      </td>
                      <td className="px-4 py-3 text-on-surface-secondary font-mono text-xs">
                        {done}/{steps.length || '—'}
                      </td>
                      <td className="px-4 py-3 text-on-surface-secondary">
                        {run.totalCost != null ? `$${run.totalCost.toFixed(4)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-on-surface-tertiary">
                        {formatDate(run.startedAt || run.createdAt, isRTL)}
                      </td>
                      <td className="px-4 py-3 text-on-surface-tertiary">{duration(run)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {showPlan && (
          <PlanDialog
            isRTL={isRTL}
            onClose={() => setShowPlan(false)}
            onCreated={(id) => {
              setShowPlan(false);
              router.push(`/workflow-runs/${id}`);
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
