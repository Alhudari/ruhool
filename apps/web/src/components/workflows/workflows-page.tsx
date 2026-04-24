'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Workflow,
  Plus,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Timer,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ItemMenu, ShowArchivedToggle } from '@/components/ui/item-menu';

interface WorkflowStep {
  id: string;
  agentId: string;
  prompt: string;
  order: number;
}

interface WorkflowRun {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  results: Array<{ stepId: string; output: string; error?: string }>;
}

interface WorkflowItem {
  id: string;
  name: string | { en: string; ar: string };
  description: string;
  steps: WorkflowStep[];
  trigger: { type: 'manual' | 'schedule'; cron?: string };
  enabled: boolean;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
  lastRun: WorkflowRun | null;
}

export function WorkflowsPage() {
  const router = useRouter();
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, WorkflowRun[]>>({});
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);

  const fetchWorkflows = useCallback(async () => {
    try {
      const data = await apiFetch<WorkflowItem[]>(`/api/workflows?archived=${showArchived}`);
      setWorkflows(data);
    } catch {}
    setLoading(false);
  }, [showArchived]);

  useEffect(() => { fetchWorkflows(); }, [fetchWorkflows]);

  const handleCreate = async (form: {
    name: string;
    description: string;
    steps: Array<{ agentId: string; prompt: string }>;
    triggerType: 'manual' | 'schedule';
    cron: string;
  }) => {
    try {
      await apiFetch('/api/workflows', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          steps: form.steps,
          trigger: { type: form.triggerType, ...(form.triggerType === 'schedule' ? { cron: form.cron } : {}) },
        }),
      });
      setShowCreate(false);
      fetchWorkflows();
    } catch {}
  };

  const handleRun = async (id: string) => {
    setRunningIds((prev) => new Set(prev).add(id));
    try {
      await apiFetch(`/api/workflows/${id}/run`, { method: 'POST' });
      // Poll for completion
      const poll = setInterval(async () => {
        const runData = await apiFetch<WorkflowRun[]>(`/api/workflows/${id}/runs`);
        if (runData[0] && runData[0].status !== 'running') {
          clearInterval(poll);
          setRunningIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          fetchWorkflows();
        }
      }, 2000);
    } catch {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/workflows/${id}`, { method: 'DELETE' });
      fetchWorkflows();
    } catch {}
  };

  const handleArchive = async (id: string, archived: boolean) => {
    try {
      await apiFetch(`/api/workflows/${id}/archive`, { method: 'PUT', body: JSON.stringify({ archived }) });
      fetchWorkflows();
    } catch {}
  };

  const loadRuns = async (id: string) => {
    try {
      const data = await apiFetch<WorkflowRun[]>(`/api/workflows/${id}/runs`);
      setRuns((prev) => ({ ...prev, [id]: data }));
    } catch {}
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadRuns(id);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Workflow size={24} className="text-on-surface-secondary" />
          <h1 className="text-xl font-semibold text-on-surface">
            {isRTL ? 'سير العمل' : 'Workflows'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <ShowArchivedToggle value={showArchived} onChange={setShowArchived} isRTL={isRTL} />
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors"
          >
            <Plus size={16} />
            {isRTL ? 'سير عمل جديد' : 'New Workflow'}
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateWorkflowForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          isRTL={isRTL}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-on-surface-tertiary" />
        </div>
      ) : workflows.length === 0 ? (
        <div className="text-center py-16 text-on-surface-tertiary">
          <Workflow size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg mb-2">{isRTL ? 'لا توجد سير عمل' : 'No workflows yet'}</p>
          <p className="text-sm">
            {isRTL
              ? 'اضغط "سير عمل جديد" لإنشاء أول سير عمل'
              : 'Click "New Workflow" to create your first workflow'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className="border border-border rounded-[var(--radius-lg)] bg-surface overflow-hidden"
            >
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-on-surface truncate">{typeof wf.name === 'string' ? wf.name : wf.name[language]}</h3>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full',
                      wf.trigger.type === 'schedule'
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'bg-surface-secondary text-on-surface-tertiary'
                    )}>
                      {wf.trigger.type === 'schedule' ? (
                        <span className="flex items-center gap-1"><Timer size={10} />{wf.trigger.cron}</span>
                      ) : (
                        isRTL ? 'يدوي' : 'Manual'
                      )}
                    </span>
                  </div>
                  <p className="text-sm text-on-surface-tertiary truncate">{wf.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-on-surface-tertiary">
                    <span>{wf.steps.length} {isRTL ? 'خطوات' : 'steps'}</span>
                    {wf.lastRun && (
                      <span className="flex items-center gap-1">
                        {wf.lastRun.status === 'completed' && <CheckCircle2 size={12} className="text-green-400" />}
                        {wf.lastRun.status === 'failed' && <XCircle size={12} className="text-red-400" />}
                        {wf.lastRun.status === 'running' && <Loader2 size={12} className="animate-spin text-amber-400" />}
                        {isRTL ? 'آخر تشغيل:' : 'Last run:'}{' '}
                        {new Date(wf.lastRun.startedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => router.push(`/workflows/${wf.id}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-sm bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary transition-colors"
                    title={isRTL ? 'تعديل بصري' : 'Visual Editor'}
                  >
                    <Pencil size={14} />
                    {isRTL ? 'تعديل' : 'Edit'}
                  </button>
                  <button
                    onClick={() => handleRun(wf.id)}
                    disabled={runningIds.has(wf.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    {runningIds.has(wf.id) ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Play size={14} />
                    )}
                    {isRTL ? 'تشغيل' : 'Run'}
                  </button>
                  <ItemMenu
                    isRTL={isRTL}
                    archived={!!wf.archived}
                    onArchive={() => handleArchive(wf.id, true)}
                    onUnarchive={() => handleArchive(wf.id, false)}
                    onDelete={() => handleDelete(wf.id)}
                    deleteConfirmMessage={isRTL ? 'حذف سير العمل هذا نهائيًا؟' : 'Delete this workflow permanently?'}
                  />
                  <button
                    onClick={() => toggleExpand(wf.id)}
                    className="p-1.5 rounded-[var(--radius)] text-on-surface-tertiary hover:bg-surface-secondary transition-colors"
                  >
                    {expandedId === wf.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {expandedId === wf.id && (
                <div className="border-t border-border px-5 py-4 bg-surface-secondary/50">
                  <h4 className="text-sm font-medium text-on-surface mb-3">
                    {isRTL ? 'سجل التشغيل' : 'Run History'}
                  </h4>
                  {!runs[wf.id] || runs[wf.id].length === 0 ? (
                    <p className="text-sm text-on-surface-tertiary">
                      {isRTL ? 'لا يوجد سجل بعد' : 'No runs yet'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {runs[wf.id].slice(0, 5).map((run) => (
                        <div
                          key={run.id}
                          className="flex items-center gap-3 text-sm p-2 rounded-[var(--radius)] bg-surface"
                        >
                          {run.status === 'completed' && <CheckCircle2 size={14} className="text-green-400 shrink-0" />}
                          {run.status === 'failed' && <XCircle size={14} className="text-red-400 shrink-0" />}
                          {run.status === 'running' && <Loader2 size={14} className="animate-spin text-amber-400 shrink-0" />}
                          <span className="text-on-surface-secondary">
                            {new Date(run.startedAt).toLocaleString()}
                          </span>
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full',
                            run.status === 'completed' && 'bg-green-500/10 text-green-400',
                            run.status === 'failed' && 'bg-red-500/10 text-red-400',
                            run.status === 'running' && 'bg-amber-500/10 text-amber-400',
                          )}>
                            {run.status}
                          </span>
                          {run.completedAt && (
                            <span className="text-on-surface-tertiary text-xs flex items-center gap-1">
                              <Clock size={10} />
                              {Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s
                            </span>
                          )}
                        </div>
                      ))}
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

function CreateWorkflowForm({
  onSubmit,
  onCancel,
  isRTL,
}: {
  onSubmit: (form: {
    name: string;
    description: string;
    steps: Array<{ agentId: string; prompt: string }>;
    triggerType: 'manual' | 'schedule';
    cron: string;
  }) => void;
  onCancel: () => void;
  isRTL: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<'manual' | 'schedule'>('manual');
  const [cron, setCron] = useState('');
  const [steps, setSteps] = useState<Array<{ agentId: string; prompt: string }>>([
    { agentId: 'manager', prompt: '' },
  ]);

  const addStep = () => setSteps([...steps, { agentId: 'manager', prompt: '' }]);
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i));
  const updateStep = (i: number, field: 'agentId' | 'prompt', value: string) => {
    const updated = [...steps];
    updated[i] = { ...updated[i], [field]: value };
    setSteps(updated);
  };

  return (
    <div className="border border-border rounded-[var(--radius-lg)] bg-surface p-6 mb-6">
      <h3 className="text-lg font-medium text-on-surface mb-4">
        {isRTL ? 'سير عمل جديد' : 'New Workflow'}
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-on-surface-secondary mb-1">
            {isRTL ? 'الاسم' : 'Name'}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder={isRTL ? 'مثال: بحث يومي' : 'e.g. Daily Research Summary'}
          />
        </div>

        <div>
          <label className="block text-sm text-on-surface-secondary mb-1">
            {isRTL ? 'الوصف' : 'Description'}
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder={isRTL ? 'وصف مختصر' : 'Brief description'}
          />
        </div>

        <div>
          <label className="block text-sm text-on-surface-secondary mb-1">
            {isRTL ? 'المشغل' : 'Trigger'}
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setTriggerType('manual')}
              className={cn(
                'px-3 py-1.5 rounded-[var(--radius)] text-sm border transition-colors',
                triggerType === 'manual'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
              )}
            >
              {isRTL ? 'يدوي' : 'Manual'}
            </button>
            <button
              onClick={() => setTriggerType('schedule')}
              className={cn(
                'px-3 py-1.5 rounded-[var(--radius)] text-sm border transition-colors',
                triggerType === 'schedule'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
              )}
            >
              {isRTL ? 'مجدول' : 'Schedule'}
            </button>
          </div>
          {triggerType === 'schedule' && (
            <input
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              className="w-full mt-2 px-3 py-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="0 9 * * * (every day at 9am)"
            />
          )}
        </div>

        <div>
          <label className="block text-sm text-on-surface-secondary mb-2">
            {isRTL ? 'الخطوات' : 'Steps'}
          </label>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-xs flex items-center justify-center mt-2">
                  {i + 1}
                </span>
                <div className="flex-1 space-y-2">
                  <select
                    value={step.agentId}
                    onChange={(e) => updateStep(i, 'agentId', e.target.value)}
                    className="w-full px-3 py-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="manager">Ruhool (Manager)</option>
                    <option value="research">Al-Bahith (Research)</option>
                    <option value="reading-helper">Al-Mulakhkhis (Reading)</option>
                    <option value="writing-critic">Al-Naqid (Writing Critic)</option>
                  </select>
                  <textarea
                    value={step.prompt}
                    onChange={(e) => updateStep(i, 'prompt', e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                    placeholder={isRTL ? 'الأمر لهذه الخطوة...' : 'Prompt for this step...'}
                  />
                </div>
                {steps.length > 1 && (
                  <button
                    onClick={() => removeStep(i)}
                    className="p-1.5 mt-2 rounded-[var(--radius)] text-on-surface-tertiary hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addStep}
            className="mt-2 text-sm text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
          >
            <Plus size={14} />
            {isRTL ? 'إضافة خطوة' : 'Add Step'}
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-[var(--radius)] text-sm text-on-surface-secondary hover:bg-surface-secondary transition-colors"
        >
          {isRTL ? 'إلغاء' : 'Cancel'}
        </button>
        <button
          onClick={() => onSubmit({ name, description, steps, triggerType, cron })}
          disabled={!name || steps.some((s) => !s.prompt)}
          className="px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {isRTL ? 'إنشاء' : 'Create'}
        </button>
      </div>
    </div>
  );
}
