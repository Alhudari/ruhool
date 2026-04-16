'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Activity, Play, Pause, StopCircle, MessageSquare, Bot, Clock, CheckSquare, AlertTriangle, Radio, Send, ChevronDown, ChevronRight, Zap, Eye, FolderCog, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ClippyHelp } from '@/components/help/clippy-help';

interface Run {
  id: string; conversationId: string; agentId: string;
  status: string; stepCount: number; maxSteps: number;
  tokensUsed: number; maxTokens: number;
  startedAt: string; endedAt?: string; lastStepAt?: string;
  trace?: Array<{ stepNumber: number; agentId: string; summary: string; tokensUsed: number; at: string }>;
}
interface Conv { id: string; title: string; participants: string[]; messageCount: number; lastAt: string; lastAgent?: string; lastPreview: string; }
interface BgTask { id: string; query: string; status: string; progress: number; updatedAt: string; }
interface Activity { id: string; timestamp: string; type: string; action: string; details: string; agentId?: string; }
interface Alert { id: string; kind: string; severity: string; title: string; description: string; createdAt: string; }
interface TaskLite { id: string; title: string; priority: string; assignedAgent?: string; dueDate?: string | null; graphStatus?: string; completedAt?: string | null; }
interface Snapshot {
  stats: { activeRuns: number; pendingTasks: number; tasksDoneToday: number; bgResearchRunning: number; activeConversations: number; unresolvedAlerts: number };
  activeRuns: Run[]; recentRuns: Run[];
  tasksByStatus: { running: TaskLite[]; ready: TaskLite[]; blocked: TaskLite[]; done_today: TaskLite[] };
  bgResearch: BgTask[]; recentActivity: Activity[]; liveConvs: Conv[]; alerts: Alert[];
}

const HELP = [
  { illustration: '🎛️', title: { ar: 'غرفة التحكم', en: 'Mission Control' }, body: { ar: 'كل ما يحدث في المنصة في مكان واحد ومحدّث كل ثانيتين.', en: 'Everything happening across the platform in one place, refreshed every 2s.' } },
  { illustration: '⏯️', title: { ar: 'التدخل', en: 'Intervene' }, body: { ar: 'تقدر توقف أي تشغيل، أو تبعث رسالة توجيه في وسط السلسلة.', en: 'Abort any run, or inject a directive message mid-chain.' } },
  { illustration: '👁️', title: { ar: 'ما الذي تراه؟', en: 'What you see' }, body: { ar: 'تشغيلات نشطة، مهام جاهزة/محجوزة، أبحاث خلفية، محادثات حية، تنبيهات.', en: 'Active runs, ready/blocked tasks, background research, live convos, alerts.' } },
];

const STATUS_COLOR: Record<string, string> = {
  running: 'text-blue-500 bg-blue-500/10',
  done: 'text-emerald-500 bg-emerald-500/10',
  failed: 'text-red-500 bg-red-500/10',
  waiting_user: 'text-amber-500 bg-amber-500/10',
  aborted: 'text-gray-500 bg-gray-500/10',
  budget_exceeded: 'text-orange-500 bg-orange-500/10',
};

export function ControlView() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [injectTarget, setInjectTarget] = useState<string | null>(null);
  const [injectText, setInjectText] = useState('');

  const load = useCallback(() => {
    apiFetch<Snapshot>('/api/control/snapshot').then(setSnap).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 2000);
    return () => clearInterval(iv);
  }, [load]);

  const abort = async (runId: string) => {
    if (!confirm(isRTL ? 'إيقاف هذا التشغيل؟' : 'Abort this run?')) return;
    await apiFetch(`/api/runs/${runId}/abort`, { method: 'POST' });
    load();
  };

  const inject = async () => {
    if (!injectTarget || !injectText.trim()) return;
    await apiFetch(`/api/runs/${injectTarget}/inject`, { method: 'POST', body: JSON.stringify({ message: injectText.trim() }) });
    setInjectText(''); setInjectTarget(null);
    load();
  };

  if (!snap) {
    return <div className="p-12 text-center text-on-surface-tertiary"><Loader2 className="animate-spin inline" /></div>;
  }

  const s = snap.stats;

  return (
    <div className={cn('max-w-7xl mx-auto px-6 py-6 space-y-4', isRTL && 'rtl')} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-accent/10 text-accent flex items-center justify-center">
          <Activity size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-on-surface">{isRTL ? 'غرفة التحكم' : 'Mission Control'}</h1>
          <p className="text-xs text-on-surface-tertiary flex items-center gap-1">
            <Radio size={10} className="text-emerald-500 animate-pulse" />
            {isRTL ? 'بث مباشر — يُحدَّث كل ثانيتين' : 'Live — refreshed every 2s'}
          </p>
        </div>
        <div className="ms-auto"><ClippyHelp steps={HELP} title={{ ar: 'غرفة التحكم', en: 'Mission Control' }} /></div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <StatCard icon={Play} color="blue" label={isRTL ? 'تشغيلات نشطة' : 'Active Runs'} value={s.activeRuns} />
        <StatCard icon={CheckSquare} color="amber" label={isRTL ? 'مهام معلّقة' : 'Pending'} value={s.pendingTasks} />
        <StatCard icon={CheckSquare} color="emerald" label={isRTL ? 'أُنجزت اليوم' : 'Done today'} value={s.tasksDoneToday} />
        <StatCard icon={FolderCog} color="violet" label={isRTL ? 'بحث خلفي' : 'BG Research'} value={s.bgResearchRunning} />
        <StatCard icon={MessageSquare} color="sky" label={isRTL ? 'محادثات حيّة' : 'Live Convos'} value={s.activeConversations} />
        <StatCard icon={AlertTriangle} color="rose" label={isRTL ? 'تنبيهات' : 'Alerts'} value={s.unresolvedAlerts} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
        {/* Main column */}
        <div className="space-y-4">
          {/* Active Runs */}
          <Section title={isRTL ? 'تشغيلات جارية' : 'Active Runs'} count={snap.activeRuns.length}>
            {snap.activeRuns.length === 0 && <Empty text={isRTL ? 'لا تشغيلات نشطة' : 'No active runs'} />}
            {snap.activeRuns.map((r) => {
              const pct = Math.round((r.stepCount / r.maxSteps) * 100);
              const tokPct = Math.round((r.tokensUsed / r.maxTokens) * 100);
              const expanded = expandedRunId === r.id;
              return (
                <div key={r.id} className="rounded-[var(--radius)] border border-border bg-surface overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button onClick={() => setExpandedRunId(expanded ? null : r.id)} className="p-0.5">
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', STATUS_COLOR[r.status])}>{r.status}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-on-surface truncate">{r.trace?.[0]?.summary.slice(0, 100) || r.agentId}</div>
                      <div className="flex items-center gap-3 text-[10px] text-on-surface-tertiary">
                        <span>@{r.agentId}</span>
                        <span>{r.stepCount}/{r.maxSteps} steps ({pct}%)</span>
                        <span>{r.tokensUsed.toLocaleString()} / {r.maxTokens.toLocaleString()} tok ({tokPct}%)</span>
                      </div>
                    </div>
                    <button onClick={() => setInjectTarget(r.id)} className="p-1.5 rounded text-accent hover:bg-accent/10" title={isRTL ? 'تدخّل' : 'Inject'}>
                      <Send size={12} />
                    </button>
                    <button onClick={() => abort(r.id)} className="p-1.5 rounded text-red-500 hover:bg-red-500/10" title={isRTL ? 'إيقاف' : 'Abort'}>
                      <StopCircle size={14} />
                    </button>
                    <Link href={`/chat/${r.conversationId}`} className="p-1.5 rounded text-on-surface-tertiary hover:bg-surface-secondary" title={isRTL ? 'افتح المحادثة' : 'Open chat'}>
                      <MessageSquare size={12} />
                    </Link>
                  </div>
                  {/* Progress bars */}
                  <div className="px-3 pb-2 space-y-1">
                    <div className="h-1 rounded-full bg-surface-secondary overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="h-1 rounded-full bg-surface-secondary overflow-hidden">
                      <div className={cn('h-full transition-all', tokPct > 85 ? 'bg-orange-500' : 'bg-emerald-500')} style={{ width: `${tokPct}%` }} />
                    </div>
                  </div>
                  {expanded && r.trace && (
                    <div className="px-3 pb-3 space-y-1 border-t border-border">
                      {r.trace.map((t, i) => (
                        <div key={i} className="text-xs p-2 rounded bg-surface-secondary">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-1.5 py-0.5 rounded bg-accent/20 text-accent text-[10px] font-bold">#{t.stepNumber}</span>
                            <span className="font-semibold">{t.agentId}</span>
                            <span className="text-on-surface-tertiary text-[10px] ms-auto">{new Date(t.at).toLocaleTimeString()} · {t.tokensUsed} tok</span>
                          </div>
                          <div className="text-on-surface-secondary whitespace-pre-wrap">{t.summary}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {injectTarget === r.id && (
                    <div className="px-3 pb-3 border-t border-border pt-2 space-y-1">
                      <textarea
                        value={injectText}
                        onChange={(e) => setInjectText(e.target.value)}
                        rows={2}
                        placeholder={isRTL ? 'رسالة توجيه للوكلاء في هذه السلسلة...' : 'Directive to inject into this chain...'}
                        className="w-full bg-input border border-border rounded px-2 py-1 text-xs"
                      />
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setInjectTarget(null); setInjectText(''); }} className="px-2 py-1 rounded bg-surface-secondary text-xs">{isRTL ? 'إلغاء' : 'Cancel'}</button>
                        <button onClick={inject} disabled={!injectText.trim()} className="px-2 py-1 rounded bg-accent text-on-accent text-xs disabled:opacity-40">{isRTL ? 'أرسل' : 'Send'}</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Section>

          {/* Background Research */}
          {snap.bgResearch.length > 0 && (
            <Section title={isRTL ? 'بحث في الخلفية' : 'Background Research'} count={snap.bgResearch.length}>
              {snap.bgResearch.map((t) => (
                <div key={t.id} className="rounded-[var(--radius)] border border-border bg-surface p-2">
                  <div className="flex items-center gap-2">
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', t.status === 'complete' ? 'text-emerald-500 bg-emerald-500/10' : 'text-blue-500 bg-blue-500/10')}>{t.status}</span>
                    <div className="flex-1 min-w-0 text-xs truncate">{t.query}</div>
                    <span className="text-[10px] text-on-surface-tertiary">{t.progress}%</span>
                  </div>
                  <div className="h-1 mt-1 rounded-full bg-surface-secondary overflow-hidden">
                    <div className="h-full bg-violet-500 transition-all" style={{ width: `${t.progress}%` }} />
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* Live Conversations */}
          <Section title={isRTL ? 'محادثات حيّة' : 'Live Conversations'} count={snap.liveConvs.length}>
            {snap.liveConvs.length === 0 && <Empty text={isRTL ? 'لا محادثات حية' : 'None active'} />}
            {snap.liveConvs.map((cv) => (
              <Link key={cv.id} href={`/chat/${cv.id}`} className="block rounded-[var(--radius)] border border-border bg-surface p-2 hover:border-accent/40">
                <div className="flex items-center gap-2 mb-1">
                  <Bot size={12} className="text-on-surface-tertiary" />
                  <span className="text-sm font-medium truncate flex-1">{cv.title}</span>
                  <span className="text-[10px] text-on-surface-tertiary">{cv.messageCount} msg</span>
                  <span className="text-[10px] text-on-surface-tertiary">{new Date(cv.lastAt).toLocaleTimeString()}</span>
                </div>
                <div className="text-xs text-on-surface-secondary truncate italic">{cv.lastAgent ? `@${cv.lastAgent}: ` : ''}{cv.lastPreview}</div>
                <div className="flex gap-1 mt-1">
                  {cv.participants.slice(0, 5).map((p) => (
                    <span key={p} className="text-[9px] px-1 py-0.5 rounded bg-surface-secondary">{p}</span>
                  ))}
                </div>
              </Link>
            ))}
          </Section>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Tasks */}
          <Section title={isRTL ? 'المهام' : 'Tasks'} count={snap.tasksByStatus.ready.length + snap.tasksByStatus.blocked.length}>
            {snap.tasksByStatus.ready.length > 0 && (
              <div className="text-[10px] uppercase text-emerald-600 font-bold mb-1">{isRTL ? 'جاهزة' : 'Ready'} · {snap.tasksByStatus.ready.length}</div>
            )}
            {snap.tasksByStatus.ready.slice(0, 5).map((t) => (
              <div key={t.id} className="text-xs p-1.5 rounded bg-emerald-500/5 border border-emerald-500/20 mb-1">
                <div className="truncate">{t.title}</div>
                {t.assignedAgent && <span className="text-[9px] text-on-surface-tertiary">@{t.assignedAgent}</span>}
              </div>
            ))}
            {snap.tasksByStatus.blocked.length > 0 && (
              <div className="text-[10px] uppercase text-amber-600 font-bold mt-2 mb-1">{isRTL ? 'محجوزة' : 'Blocked'} · {snap.tasksByStatus.blocked.length}</div>
            )}
            {snap.tasksByStatus.blocked.slice(0, 5).map((t) => (
              <div key={t.id} className="text-xs p-1.5 rounded bg-amber-500/5 border border-amber-500/20 mb-1">
                <div className="truncate">{t.title}</div>
                {t.assignedAgent && <span className="text-[9px] text-on-surface-tertiary">@{t.assignedAgent}</span>}
              </div>
            ))}
            {snap.tasksByStatus.done_today.length > 0 && (
              <div className="text-[10px] uppercase text-on-surface-tertiary font-bold mt-2 mb-1">{isRTL ? 'أُنجزت اليوم' : 'Done today'} · {snap.tasksByStatus.done_today.length}</div>
            )}
            {snap.tasksByStatus.done_today.slice(0, 3).map((t) => (
              <div key={t.id} className="text-xs p-1.5 rounded bg-surface-secondary mb-1 line-through text-on-surface-tertiary">
                <div className="truncate">{t.title}</div>
              </div>
            ))}
          </Section>

          {/* Alerts */}
          {snap.alerts.length > 0 && (
            <Section title={isRTL ? 'تنبيهات' : 'Alerts'} count={snap.alerts.length}>
              {snap.alerts.map((a) => (
                <div key={a.id} className="text-xs p-2 rounded bg-rose-500/5 border border-rose-500/20 mb-1">
                  <div className="font-semibold">{a.title}</div>
                  <div className="text-on-surface-secondary">{a.description}</div>
                </div>
              ))}
            </Section>
          )}

          {/* Recent Activity */}
          <Section title={isRTL ? 'النشاط الأخير' : 'Recent Activity'} count={snap.recentActivity.length}>
            <div className="max-h-[400px] overflow-auto space-y-1">
              {snap.recentActivity.length === 0 && <Empty text={isRTL ? 'لا نشاط حديث' : 'No recent activity'} />}
              {snap.recentActivity.map((a) => (
                <div key={a.id} className="text-[11px] p-1.5 rounded bg-surface-secondary">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-[9px] text-on-surface-tertiary">{new Date(a.timestamp).toLocaleTimeString()}</span>
                    <span className="text-[9px] px-1 rounded bg-surface">{a.type}</span>
                    {a.agentId && <span className="text-[9px] text-accent">@{a.agentId}</span>}
                  </div>
                  <div className="text-on-surface truncate">{a.action}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, color, label, value }: { icon: LucideIcon; color: string; label: string; value: number }) {
  const COLORS: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-500',
    amber: 'bg-amber-500/10 text-amber-500',
    emerald: 'bg-emerald-500/10 text-emerald-500',
    violet: 'bg-violet-500/10 text-violet-500',
    sky: 'bg-sky-500/10 text-sky-500',
    rose: 'bg-rose-500/10 text-rose-500',
  };
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-3">
      <div className={cn('w-7 h-7 rounded flex items-center justify-center mb-1', COLORS[color])}>
        <Icon size={14} />
      </div>
      <div className="text-[10px] text-on-surface-tertiary truncate">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-3">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {count !== undefined && <span className="text-[10px] text-on-surface-tertiary">({count})</span>}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-xs text-on-surface-tertiary italic text-center py-4">{text}</div>;
}
