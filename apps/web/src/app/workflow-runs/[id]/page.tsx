'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Pause,
  Play,
  X as XIcon,
  Loader2,
  ChevronDown,
  ChevronUp,
  Workflow,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/app';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/workflow-runs/status-badge';
import { StepCard } from '@/components/workflow-runs/step-card';
import {
  useWorkflowSSE,
  type WorkflowRun,
  type WorkflowStep,
  type WorkflowRunStatus,
} from '@/hooks/use-workflow-sse';

interface HandleMeta {
  mode?: 'temporal' | 'bullmq' | 'inproc' | string;
  durable?: boolean;
  handleId?: string;
}

function formatTotalCost(run: WorkflowRun | null, steps: WorkflowStep[]): string {
  const total =
    run?.totalCost ??
    steps.reduce((acc, s) => acc + (s.usage?.cost || 0), 0);
  if (!total) return '$0.0000';
  return `$${total.toFixed(4)}`;
}

function elapsedText(run: WorkflowRun | null, isRTL: boolean): string {
  if (!run?.startedAt) return '—';
  const start = new Date(run.startedAt).getTime();
  const end = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
  const secs = Math.max(0, Math.round((end - start) / 1000));
  if (secs < 60) return `${secs}${isRTL ? ' ث' : 's'}`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return isRTL ? `${m}د ${s}ث` : `${m}m ${s}s`;
}

export default function WorkflowRunDetailPage() {
  const params = useParams<{ id: string }>();
  const runId = params?.id;
  const router = useRouter();
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [handle, setHandle] = useState<HandleMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const sse = useWorkflowSSE(runId);

  const fetchRun = useCallback(async () => {
    if (!runId) return;
    try {
      const data = await apiFetch<WorkflowRun>(`/api/workflow-runs/${runId}`);
      setRun(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [runId]);

  const fetchHandle = useCallback(async () => {
    if (!runId) return;
    try {
      const data = await apiFetch<HandleMeta>(`/api/workflow-runs/${runId}/handle`);
      setHandle(data);
    } catch {
      // ignore
    }
  }, [runId]);

  useEffect(() => {
    fetchRun();
    fetchHandle();
  }, [fetchRun, fetchHandle]);

  // Merge SSE updates into run state
  useEffect(() => {
    if (!sse.lastEvent) return;
    fetchRun();
  }, [sse.lastEvent, fetchRun]);

  // Tick for live elapsed display
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const steps: WorkflowStep[] = useMemo(() => {
    // Prefer SSE steps if present, else fall back to run steps
    if (sse.steps.length > 0) return [...sse.steps].sort((a, b) => a.index - b.index);
    return Array.isArray(run?.steps) ? [...run!.steps].sort((a, b) => a.index - b.index) : [];
  }, [sse.steps, run]);

  const effectiveStatus: WorkflowRunStatus | 'unknown' =
    sse.status !== 'unknown' ? sse.status : (run?.status as WorkflowRunStatus) || 'unknown';

  const currentStep = steps.find((s) => s.status === 'running');
  const completedCount = steps.filter(
    (s) => s.status === 'completed' || s.status === 'skipped',
  ).length;

  const act = async (verb: 'pause' | 'resume' | 'cancel' | 'start') => {
    if (!runId) return;
    setActing(true);
    try {
      const path =
        verb === 'start'
          ? `/api/workflow-runs/${runId}/start?durable=true`
          : `/api/workflow-runs/${runId}/${verb}`;
      await apiFetch(path, { method: 'POST' });
      await fetchRun();
      await fetchHandle();
    } catch {
      // silent
    } finally {
      setActing(false);
    }
  };

  const durabilityLabel = () => {
    const mode = handle?.mode;
    if (mode === 'temporal') return isRTL ? 'دائم: Temporal' : 'Durable: Temporal';
    if (mode === 'bullmq') return isRTL ? 'احتياطي: BullMQ' : 'Fallback: BullMQ';
    if (mode === 'inproc') return isRTL ? 'احتياطي: inproc' : 'Fallback: inproc';
    return isRTL ? 'وضع التنفيذ غير معروف' : 'Execution mode unknown';
  };

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const canPause = effectiveStatus === 'running';
  const canResume = effectiveStatus === 'paused';
  const canCancel = effectiveStatus === 'running' || effectiveStatus === 'paused' || effectiveStatus === 'pending';
  const canStart = effectiveStatus === 'pending' || effectiveStatus === 'planning';

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <button
          onClick={() => router.push('/workflow-runs')}
          className="inline-flex items-center gap-1.5 text-sm text-on-surface-tertiary hover:text-on-surface-secondary mb-4"
        >
          <BackIcon size={14} />
          {isRTL ? 'رجوع للمسارات' : 'Back to runs'}
        </button>

        {loading && !run ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-on-surface-tertiary" />
          </div>
        ) : !run ? (
          <div className="text-center py-16 text-on-surface-tertiary">
            <Workflow size={48} className="mx-auto mb-4 opacity-30" />
            <p>{isRTL ? 'لم يتم العثور على المسار' : 'Run not found'}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-on-surface truncate">
                  {run.title || run.userRequest?.slice(0, 80) || run.id}
                </h1>
                <div className="flex items-center gap-2 mt-1 text-xs text-on-surface-tertiary">
                  <StatusBadge status={effectiveStatus} isRTL={isRTL} />
                  <span>•</span>
                  <span>{durabilityLabel()}</span>
                  {sse.connected && (
                    <>
                      <span>•</span>
                      <span className="text-green-400">
                        {isRTL ? 'متصل مباشرة' : 'Live'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {canStart && (
                  <button
                    onClick={() => act('start')}
                    disabled={acting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-50"
                  >
                    <Play size={14} />
                    {isRTL ? 'بدء' : 'Start'}
                  </button>
                )}
                {canPause && (
                  <button
                    onClick={() => act('pause')}
                    disabled={acting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-sm bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary disabled:opacity-50"
                  >
                    <Pause size={14} />
                    {isRTL ? 'إيقاف مؤقت' : 'Pause'}
                  </button>
                )}
                {canResume && (
                  <button
                    onClick={() => act('resume')}
                    disabled={acting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-50"
                  >
                    <Play size={14} />
                    {isRTL ? 'استئناف' : 'Resume'}
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={() => act('cancel')}
                    disabled={acting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-sm bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    <XIcon size={14} />
                    {isRTL ? 'إلغاء' : 'Cancel'}
                  </button>
                )}
              </div>
            </div>

            {/* Summary bar */}
            <div
              key={tick}
              className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 p-4 rounded-[var(--radius-lg)] border border-border bg-surface"
            >
              <div>
                <p className="text-xs text-on-surface-tertiary mb-1">
                  {isRTL ? 'إجمالي الخطوات' : 'Total Steps'}
                </p>
                <p className="text-lg font-semibold text-on-surface">
                  {completedCount}/{steps.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-on-surface-tertiary mb-1">
                  {isRTL ? 'الخطوة الحالية' : 'Current'}
                </p>
                <p className="text-sm text-on-surface truncate">
                  {currentStep ? `#${currentStep.index + 1}` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-on-surface-tertiary mb-1">
                  {isRTL ? 'المدة' : 'Elapsed'}
                </p>
                <p className="text-lg font-semibold text-on-surface">
                  {elapsedText(run, isRTL)}
                </p>
              </div>
              <div>
                <p className="text-xs text-on-surface-tertiary mb-1">
                  {isRTL ? 'التكلفة' : 'Cost'}
                </p>
                <p className="text-lg font-semibold text-on-surface">
                  {formatTotalCost(run, steps)}
                </p>
              </div>
            </div>

            {/* Steps timeline */}
            {steps.length === 0 ? (
              <div className="text-center py-12 text-on-surface-tertiary border border-border rounded-[var(--radius-lg)] bg-surface">
                <p>{isRTL ? 'لا توجد خطوات بعد' : 'No steps yet'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {steps.map((step) => (
                  <StepCard key={step.id} step={step} isRTL={isRTL} />
                ))}
              </div>
            )}

            {/* Raw JSON */}
            <div className="mt-6 border border-border rounded-[var(--radius-lg)] bg-surface overflow-hidden">
              <button
                onClick={() => setRawOpen((v) => !v)}
                className="flex items-center gap-2 w-full px-4 py-3 text-sm text-on-surface-secondary hover:bg-surface-secondary transition-colors"
              >
                {rawOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {isRTL ? 'JSON الخام' : 'Raw JSON'}
              </button>
              {rawOpen && (
                <pre
                  className={cn(
                    'px-4 py-3 text-xs text-on-surface-secondary overflow-auto max-h-96 border-t border-border',
                    'bg-surface-secondary font-mono whitespace-pre-wrap',
                  )}
                >
                  {JSON.stringify(run, null, 2)}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
