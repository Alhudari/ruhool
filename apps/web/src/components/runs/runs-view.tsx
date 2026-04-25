'use client';

import { useEffect, useState } from 'react';
import { Play, PlayCircle, Loader2, CheckCircle2, XCircle, Clock, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ClippyHelp } from '@/components/help/clippy-help';
import { TranscriptDrawer } from './TranscriptDrawer';

const RUNS_HELP = [
  { illustration: '🎯', title: { ar: 'ما هو التشغيل؟', en: 'What is a Run?' },
    body: { ar: 'هدف معقد تطلب من النظام إنجازه. الوكلاء يتناوبون على تنفيذه خطوة بعد خطوة حتى الاكتمال.', en: 'A complex goal you hand to the system. Agents take turns executing steps until done.' } },
  { illustration: '⚙️', title: { ar: 'كيف يعمل؟', en: 'How does it work?' },
    body: { ar: 'اكتب هدفاً، اختر وكيلاً أولياً، واضغط "ابدأ". النظام يمنح ميزانية (خطوات + توكنز) ويوقف التشغيل عند تجاوزها.', en: 'Write a goal, pick a starting agent, click Start. System gives a budget (steps + tokens) and stops when exceeded.' } },
  { illustration: '📊', title: { ar: 'متابعة التقدم', en: 'Track progress' },
    body: { ar: 'اضغط أي تشغيل لرؤية كل خطوة وما فعله كل وكيل.', en: 'Click any run to see every step and what each agent did.' } },
];

interface AgentRun {
  id: string;
  conversationId: string;
  agentId: string;
  status: 'running' | 'waiting_user' | 'done' | 'failed' | 'aborted' | 'budget_exceeded';
  stepCount: number;
  maxSteps: number;
  tokensUsed: number;
  maxTokens: number;
  startedAt: string;
  endedAt?: string;
  trace?: Array<{ stepNumber: number; agentId: string; summary: string; tokensUsed: number; at: string }>;
}

const STATUS_COLOR: Record<string, string> = {
  running: 'text-blue-500 bg-blue-500/10',
  done: 'text-emerald-500 bg-emerald-500/10',
  failed: 'text-red-500 bg-red-500/10',
  waiting_user: 'text-amber-500 bg-amber-500/10',
  budget_exceeded: 'text-orange-500 bg-orange-500/10',
  aborted: 'text-gray-500 bg-gray-500/10',
};

const STATUS_ICON: Record<string, LucideIcon> = {
  running: Loader2,
  done: CheckCircle2,
  failed: XCircle,
  waiting_user: Clock,
  budget_exceeded: XCircle,
  aborted: XCircle,
};

export function RunsView() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [transcriptRunId, setTranscriptRunId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const [rootAgent, setRootAgent] = useState('manager');
  const [starting, setStarting] = useState(false);

  const load = () => {
    apiFetch<{ runs: AgentRun[] }>('/api/runs').then((r) => setRuns(r.runs || [])).catch(() => {});
  };
  useEffect(() => {
    load();
    const iv = setInterval(load, 3000); // poll while runs are in flight
    return () => clearInterval(iv);
  }, []);

  const startRun = async () => {
    if (!goal.trim()) return;
    setStarting(true);
    try {
      await apiFetch('/api/runs/start', { method: 'POST', body: JSON.stringify({ goal: goal.trim(), rootAgent }) });
      setGoal('');
      load();
    } finally { setStarting(false); }
  };

  return (
    <div className={cn('max-w-5xl mx-auto px-6 py-6 space-y-4', isRTL && 'rtl')} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-accent/10 text-accent flex items-center justify-center">
          <PlayCircle size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-on-surface">{isRTL ? 'حلقات الوكلاء' : 'Agent Runs'}</h1>
          <p className="text-xs text-on-surface-tertiary">
            {isRTL ? 'شغّل هدفاً معقداً — النظام يوزعه على الوكلاء حتى الإنجاز' : 'Run a complex goal — the system chains agents until done'}
          </p>
        </div>
        <div className="ms-auto"><ClippyHelp steps={RUNS_HELP} title={{ ar: 'حلقات الوكلاء', en: 'Agent Runs' }} /></div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 space-y-2">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder={isRTL ? 'صف الهدف بالتفصيل... مثال: "ابحث عن 5 موردي إلكترونيات في الكويت، قارن أسعارهم، لخّص في جدول"' : 'Describe a goal... e.g., "Research 5 electronics vendors in Kuwait, compare prices, summarize in a table"'}
          rows={3}
          dir={isRTL ? 'rtl' : 'ltr'}
          className="w-full bg-input border border-border rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-on-surface-tertiary">{isRTL ? 'الوكيل الأول:' : 'Starting agent:'}</label>
          <select
            value={rootAgent} onChange={(e) => setRootAgent(e.target.value)}
            className="bg-input border border-border rounded-[var(--radius)] px-2 py-1 text-xs"
          >
            <option value="manager">الراعي (manager)</option>
            <option value="doctor">الدكتور (doctor)</option>
            <option value="research">الباحث (research)</option>
            <option value="reading-helper">المُلخِّص (reading)</option>
            <option value="writing-critic">الناقد (writing)</option>
            <option value="comparator">المُقارِن (compare)</option>
            <option value="analyst">المحلل (analyst)</option>
            <option value="architect">المصمم (architect)</option>
            <option value="content-creator">السارد (content)</option>
            <option value="creative">المبدع (video)</option>
            <option value="research-companion">الخوي (companion)</option>
            <option value="mudawwin">المُدوّن (meetings)</option>
          </select>
          <button
            onClick={startRun}
            disabled={!goal.trim() || starting}
            className="ms-auto px-3 py-1.5 rounded-[var(--radius)] bg-accent text-on-accent text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            {starting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {isRTL ? 'ابدأ' : 'Start'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {runs.length === 0 && (
          <div className="text-center text-xs text-on-surface-tertiary py-8 rounded-[var(--radius-lg)] border border-border bg-surface">
            {isRTL ? 'لم يبدأ أي تشغيل بعد' : 'No runs yet'}
          </div>
        )}
        {runs.map((r) => {
          const Icon = STATUS_ICON[r.status] || Clock;
          const color = STATUS_COLOR[r.status] || STATUS_COLOR.aborted;
          const expanded = expandedId === r.id;
          return (
            <div key={r.id} className="rounded-[var(--radius-lg)] border border-border bg-surface overflow-hidden">
              <button
                onClick={() => setExpandedId(expanded ? null : r.id)}
                className="w-full text-start px-4 py-3 flex items-center gap-3 hover:bg-surface-secondary"
              >
                <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', color)}>
                  <Icon size={14} className={r.status === 'running' ? 'animate-spin' : ''} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-on-surface truncate">{r.trace?.[0]?.summary.slice(0, 80) || r.agentId}</div>
                  <div className="text-[10px] text-on-surface-tertiary font-mono">
                    {r.id.slice(0, 8)} · {r.stepCount}/{r.maxSteps} steps · {r.tokensUsed.toLocaleString()} tokens · {r.status}
                  </div>
                </div>
                {/* D-5: Transcript button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setTranscriptRunId(r.id); }}
                  className="shrink-0 text-[10px] px-2 py-1 rounded border border-border text-on-surface-tertiary hover:text-accent hover:border-accent"
                >
                  {isRTL ? 'سجل' : 'Transcript'}
                </button>
              </button>
              {expanded && r.trace && (
                <div className="px-4 pb-3 space-y-1 border-t border-border">
                  {r.trace.map((step, i) => (
                    <div key={i} className="text-xs p-2 rounded bg-surface-secondary">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-1.5 py-0.5 rounded bg-accent/20 text-accent text-[10px] font-bold">#{step.stepNumber}</span>
                        <span className="font-semibold">{step.agentId}</span>
                        <span className="text-on-surface-tertiary ms-auto">{step.tokensUsed} tok</span>
                      </div>
                      <div className="text-on-surface-secondary whitespace-pre-wrap">{step.summary}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* D-5: Transcript Drawer */}
      {transcriptRunId && (
        <TranscriptDrawer runId={transcriptRunId} onClose={() => setTranscriptRunId(null)} />
      )}
    </div>
  );
}
