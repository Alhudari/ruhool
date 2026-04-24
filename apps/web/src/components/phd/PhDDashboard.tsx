'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, FileText, Brain, Calendar, CheckSquare, Loader2,
  GraduationCap, BookMarked, Star, RefreshCw, TrendingUp,
  Target, FlaskConical, ArrowRight, ChevronRight, Lightbulb,
  Award, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

// ── PhD timeline ──────────────────────────────────────────────────────
const PHD_START = new Date('2026-01-05');
const PHD_END   = new Date('2029-07-05');

const MILESTONES = [
  { label: { en: 'Lit Review', ar: 'مراجعة أدبية' },     pct: 24 },
  { label: { en: 'Fieldwork',  ar: 'الدراسة الميدانية' }, pct: 47 },
  { label: { en: 'Analysis',   ar: 'التحليل' },          pct: 68 },
  { label: { en: 'Writing',    ar: 'الكتابة' },           pct: 87 },
];

function phdProgress() {
  const now = Date.now();
  const total = PHD_END.getTime() - PHD_START.getTime();
  const elapsed = now - PHD_START.getTime();
  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  const daysIn = Math.floor(elapsed / 86400000);
  const daysLeft = Math.ceil((PHD_END.getTime() - now) / 86400000);
  return { pct, daysIn, daysLeft };
}

// ── Types ─────────────────────────────────────────────────────────────
interface LitNote {
  path: string; name: string; citekey?: string; type?: string;
  year?: number; authors?: string; tags?: string[];
  readingStatus?: string; relevance?: string;
}
interface VaultTask { text: string; done: boolean; line: number; section?: string; notePath: string; }
interface MeetingSession {
  id: string; title: string; updatedAt: string;
  record?: { date?: string | null; Summary?: string; action_plan_next?: string[]; Next_Meeting?: string | null; } | null;
}
interface DashData { litNotes: LitNote[]; litTotal: number; tasks: VaultTask[]; meetings: MeetingSession[]; }

type InsightCategory = 'insight' | 'idea' | 'decision' | 'concern' | 'goal' | 'progress' | 'note';
interface MemoryEntry {
  id: string;
  category: InsightCategory;
  content: string;
  date: string;
  tags?: string[];
}

// ── Sub-components ────────────────────────────────────────────────────
function Ring({ pct, size = 80, stroke = 6, color = 'var(--color-accent)', label }: {
  pct: number; size?: number; stroke?: number; color?: string; label?: string;
}) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-border" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold text-on-surface">{Math.round(pct)}%</span>
        {label && <span className="text-[9px] text-on-surface-tertiary uppercase tracking-wider">{label}</span>}
      </div>
    </div>
  );
}

function StatPillar({ icon: Icon, value, label, sub, color = 'accent' }: {
  icon: React.ElementType; value: string | number; label: string; sub?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    accent: 'text-accent bg-accent/10',
    info: 'text-info bg-info/10',
    success: 'text-success bg-success/10',
    warning: 'text-warning bg-warning/10',
    error: 'text-error bg-error/10',
  };
  return (
    <div className="rounded-xl border border-border bg-surface-secondary p-4 flex items-center gap-3">
      <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', colorMap[color] ?? colorMap.accent)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none text-on-surface">{value}</p>
        <p className="text-[11px] text-on-surface-tertiary mt-1 truncate uppercase tracking-wider">{label}</p>
        {sub && <p className="text-[10px] text-on-surface-secondary mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function ProgressBar({ pct, color = 'var(--color-accent)', height = 6 }: {
  pct: number; color?: string; height?: number;
}) {
  return (
    <div className="rounded-full bg-surface-tertiary overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── Greeting ──────────────────────────────────────────────────────────
function greeting(lang: 'en' | 'ar') {
  const h = new Date().getHours();
  if (lang === 'ar') {
    return h < 12 ? 'صباح الخير، عبدالله' : h < 18 ? 'مساء الخير، عبدالله' : 'مساء النور، عبدالله';
  }
  return h < 12 ? 'Good morning, Abdullah' : h < 18 ? 'Good afternoon, Abdullah' : 'Good evening, Abdullah';
}

// ── Tab IDs ────────────────────────────────────────────────────────────
type Tab = 'overview' | 'tasks' | 'literature' | 'meetings' | 'insights';
const TABS: { id: Tab; icon: React.ElementType; label: { en: string; ar: string } }[] = [
  { id: 'overview',   icon: Layers,      label: { en: 'Overview',   ar: 'نظرة عامة' } },
  { id: 'tasks',      icon: CheckSquare, label: { en: 'Tasks',      ar: 'المهام' } },
  { id: 'literature', icon: BookMarked,  label: { en: 'Literature', ar: 'الأدبيات' } },
  { id: 'meetings',   icon: Calendar,    label: { en: 'Meetings',   ar: 'الاجتماعات' } },
  { id: 'insights',   icon: Lightbulb,   label: { en: 'Insights',   ar: 'رؤى' } },
];

// ──────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────
export function PhDDashboard() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [taskFilter, setTaskFilter] = useState<'pending' | 'done' | 'all'>('pending');

  const [insights, setInsights] = useState<MemoryEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [litRes, taskRes, meetRes, memRes] = await Promise.all([
        apiFetch<{ notes: LitNote[]; total: number }>('/api/vault/literature'),
        apiFetch<{ tasks: VaultTask[]; total: number }>('/api/vault/tasks?subPath=01%20PhD'),
        apiFetch<MeetingSession[]>('/api/meetings/sessions'),
        apiFetch<MemoryEntry[]>('/api/companion/memory').catch(() => [] as MemoryEntry[]),
      ]);
      setData({ litNotes: litRes.notes, litTotal: litRes.total, tasks: taskRes.tasks, meetings: meetRes });
      setInsights(memRes);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { pct: phdPct, daysIn, daysLeft } = phdProgress();

  // Derived metrics
  const pendingTasks = data?.tasks.filter((t) => !t.done) ?? [];
  const doneTasks = data?.tasks.filter((t) => t.done) ?? [];
  const taskCompletionPct = data?.tasks.length ? (doneTasks.length / data.tasks.length) * 100 : 0;

  const statusCounts = useMemo(() => {
    return (data?.litNotes ?? []).reduce<Record<string, number>>((acc, n) => {
      const s = n.readingStatus ?? 'Unknown';
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});
  }, [data]);
  const readCount = (statusCounts['Read'] ?? 0);
  const readPct = data?.litTotal ? (readCount / data.litTotal) * 100 : 0;

  const recentMeetings = (data?.meetings ?? [])
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const lastActions = recentMeetings.find((m) => m.record?.action_plan_next?.length)?.record?.action_plan_next ?? [];
  const nextMeeting = recentMeetings.find((m) => m.record?.Next_Meeting)?.record?.Next_Meeting;

  // Year breakdown of papers
  const yearCounts = useMemo(() => {
    const c: Record<number, number> = {};
    for (const n of (data?.litNotes ?? [])) {
      if (n.year) c[n.year] = (c[n.year] ?? 0) + 1;
    }
    return Object.entries(c).map(([y, n]) => ({ year: Number(y), n })).sort((a, b) => a.year - b.year);
  }, [data]);
  const maxYearCount = yearCounts.reduce((m, x) => Math.max(m, x.n), 0);

  // Type breakdown
  const typeCounts = useMemo(() => {
    return (data?.litNotes ?? []).reduce<Record<string, number>>((acc, n) => {
      const t = n.type ?? 'unknown';
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});
  }, [data]);

  const today = new Date().toLocaleDateString(isRTL ? 'ar-SA' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-surface">
      <Loader2 className="h-8 w-8 animate-spin text-on-surface-tertiary" />
    </div>
  );

  const visibleTasks = taskFilter === 'pending' ? pendingTasks : taskFilter === 'done' ? doneTasks : (data?.tasks ?? []);

  return (
    <div className="flex-1 overflow-y-auto bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-accent/10 via-info/5 to-surface px-6 md:px-10 py-8">
        <div className="max-w-6xl mx-auto">

          {/* Top row: greeting + date + refresh */}
          <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-on-surface">{greeting(language)}</h1>
              <p className="text-sm text-on-surface-secondary mt-1">{today}</p>
              <p className="text-xs italic text-on-surface-tertiary mt-2 max-w-2xl">
                {isRTL
                  ? 'تحديات وفرص تعزيز تبني نمذجة معلومات البناء في الكويت — جامعة برمنغهام'
                  : 'Challenges and Opportunities of Advancing BIM Adoption in Kuwait — University of Birmingham'}
              </p>
            </div>
            <button
              onClick={load}
              className="flex items-center gap-1.5 text-xs text-on-surface-tertiary hover:text-on-surface transition-colors px-3 py-1.5 rounded-lg border border-border hover:border-border-hover bg-surface-secondary"
            >
              <RefreshCw className="h-3 w-3" />
              {isRTL ? 'تحديث' : 'Refresh'}
            </button>
          </div>

          {/* Hero metrics: ring + 4 pillars */}
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-center">
            <div className="flex items-center gap-4">
              <Ring pct={phdPct} size={92} stroke={6} color="var(--color-accent)" label={isRTL ? 'مكتمل' : 'done'} />
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-widest text-on-surface-tertiary">
                  {isRTL ? 'مسار الدكتوراه' : 'PhD Journey'}
                </p>
                <p className="text-lg font-bold text-on-surface">
                  {daysIn}
                  <span className="text-xs text-on-surface-tertiary font-normal mx-1">{isRTL ? 'يوم' : 'days in'}</span>
                </p>
                <p className="text-xs text-on-surface-secondary">
                  {daysLeft} {isRTL ? 'يوم متبقٍ' : 'days remaining'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatPillar
                icon={BookOpen}
                value={data?.litTotal ?? 0}
                label={isRTL ? 'مصادر' : 'Papers'}
                sub={`${readCount} ${isRTL ? 'مقروءة' : 'read'}`}
                color="info"
              />
              <StatPillar
                icon={CheckSquare}
                value={pendingTasks.length}
                label={isRTL ? 'مهام' : 'Tasks'}
                sub={`${doneTasks.length} ${isRTL ? 'مكتملة' : 'done'}`}
                color="warning"
              />
              <StatPillar
                icon={Calendar}
                value={data?.meetings.length ?? 0}
                label={isRTL ? 'اجتماعات' : 'Meetings'}
                sub={nextMeeting ? `${isRTL ? 'التالي' : 'Next'}: ${nextMeeting}` : undefined}
                color="accent"
              />
              <StatPillar
                icon={TrendingUp}
                value={`${Math.round(readPct)}%`}
                label={isRTL ? 'وتيرة القراءة' : 'Read Rate'}
                color="success"
              />
            </div>
          </div>

          {/* Timeline — battery-fill style with milestones ON the bar */}
          <div className="mt-8">
            <div className="relative h-7 rounded-full bg-surface-tertiary overflow-hidden border border-border">
              {/* Animated fill (gradient + shimmer) */}
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                style={{
                  width: `${phdPct}%`,
                  background: 'linear-gradient(90deg, var(--color-accent) 0%, var(--color-info) 50%, var(--color-success) 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'batteryShimmer 4s linear infinite',
                }}
              />
              {/* Milestone marks ON the bar */}
              {MILESTONES.map((m) => {
                const isPast = phdPct >= m.pct;
                return (
                  <div
                    key={m.pct}
                    className="absolute top-0 bottom-0 flex items-center"
                    style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}
                  >
                    <div
                      className={cn(
                        'h-3 w-3 rounded-full border-2 transition-all',
                        isPast ? 'bg-white border-white scale-100' : 'bg-surface border-border-hover scale-90'
                      )}
                      style={{ boxShadow: isPast ? '0 0 8px rgba(255,255,255,0.6)' : 'none' }}
                    />
                  </div>
                );
              })}
              {/* "Now" indicator — vertical line WITH a pin head, perfectly on the bar */}
              <div
                className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none"
                style={{ left: `${phdPct}%`, transform: 'translateX(-50%)' }}
              >
                <div className="h-full w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
              </div>
            </div>
            {/* Milestone labels under the bar */}
            <div className="relative h-5 mt-1.5">
              {MILESTONES.map((m) => {
                const isPast = phdPct >= m.pct;
                return (
                  <div
                    key={m.pct}
                    className="absolute"
                    style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}
                  >
                    <span className={cn(
                      'text-[9px] uppercase tracking-wider whitespace-nowrap',
                      isPast ? 'text-on-surface font-semibold' : 'text-on-surface-tertiary opacity-70'
                    )}>
                      {m.label[language]}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] text-on-surface-tertiary uppercase tracking-wider mt-3">
              <span>Jan 2026</span>
              <span className="text-accent font-bold">{Math.round(phdPct)}% — {daysIn} {isRTL ? 'يوم' : 'days'}</span>
              <span>Jul 2029</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── TABS BAR ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur-sm px-6 md:px-10">
        <div className="max-w-6xl mx-auto flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                tab === t.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-on-surface-tertiary hover:text-on-surface-secondary'
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label[language]}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB CONTENT ──────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8">

        {error && (
          <div className="mb-6 rounded-lg border border-warning bg-warning/10 px-4 py-3 text-sm text-warning">
            {isRTL ? 'تعذّر تحميل بعض البيانات.' : 'Could not load some data.'} {error}
          </div>
        )}

        {/* ── OVERVIEW ─────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Lit progress ring + breakdown */}
            <div className="lg:col-span-2 rounded-xl border border-border bg-surface-secondary p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="font-semibold text-on-surface">{isRTL ? 'تقدّم القراءة' : 'Reading Progress'}</h3>
                  <p className="text-xs text-on-surface-tertiary mt-1">
                    {isRTL ? 'حالة المراجعة الأدبية' : 'Literature review status'}
                  </p>
                </div>
                <Ring pct={readPct} size={70} stroke={5} color="var(--color-info)" />
              </div>

              <div className="space-y-3">
                {Object.entries(statusCounts)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([status, count]) => {
                    const p = (count / (data?.litTotal || 1)) * 100;
                    return (
                      <div key={status} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-on-surface-secondary">{status}</span>
                          <span className="text-on-surface-tertiary font-mono">{count} ({Math.round(p)}%)</span>
                        </div>
                        <ProgressBar pct={p} color="var(--color-info)" />
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Action plan card */}
            <div className="rounded-xl border border-border bg-surface-secondary p-6">
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-warning" />
                <h3 className="font-semibold text-on-surface text-sm">
                  {isRTL ? 'بنود العمل' : 'Action Items'}
                </h3>
              </div>
              {lastActions.length === 0 ? (
                <p className="text-xs text-on-surface-tertiary py-6 text-center">
                  {isRTL ? 'لا توجد بنود حالياً' : 'No action items'}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {lastActions.slice(0, 6).map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <ArrowRight className="h-3 w-3 text-warning shrink-0 mt-0.5" />
                      <span className="text-on-surface-secondary leading-snug">{a}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Year distribution sparkline-style chart */}
            <div className="lg:col-span-2 rounded-xl border border-border bg-surface-secondary p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-on-surface text-sm">
                    {isRTL ? 'توزيع المصادر بالسنوات' : 'Papers by Year'}
                  </h3>
                  <p className="text-[11px] text-on-surface-tertiary mt-0.5">
                    {yearCounts.length} {isRTL ? 'سنوات نشر' : 'publication years'}
                  </p>
                </div>
                <FlaskConical className="h-4 w-4 text-info" />
              </div>
              {yearCounts.length === 0 ? (
                <p className="text-xs text-on-surface-tertiary py-6 text-center">
                  {isRTL ? 'لا يوجد بيانات' : 'No data'}
                </p>
              ) : (
                <div className="flex items-end gap-1 h-24">
                  {yearCounts.slice(-15).map(({ year, n }) => (
                    <div key={year} className="flex-1 flex flex-col items-center gap-1 group">
                      <span className="text-[9px] font-mono text-on-surface-tertiary opacity-0 group-hover:opacity-100 transition-opacity">
                        {n}
                      </span>
                      <div
                        className="w-full bg-info/40 hover:bg-info rounded-t transition-colors min-h-[2px]"
                        style={{ height: `${(n / maxYearCount) * 100}%` }}
                      />
                      <span className="text-[8px] text-on-surface-tertiary">{String(year).slice(-2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Type donut-ish (bars) */}
            <div className="rounded-xl border border-border bg-surface-secondary p-6">
              <div className="flex items-center gap-2 mb-4">
                <Award className="h-4 w-4 text-accent" />
                <h3 className="font-semibold text-on-surface text-sm">
                  {isRTL ? 'أنواع المصادر' : 'Source Types'}
                </h3>
              </div>
              {Object.keys(typeCounts).length === 0 ? (
                <p className="text-xs text-on-surface-tertiary py-6 text-center">
                  {isRTL ? 'لا يوجد بيانات' : 'No data'}
                </p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(typeCounts).slice(0, 5).map(([t, c]) => {
                    const p = (c / (data?.litTotal || 1)) * 100;
                    return (
                      <div key={t} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate text-on-surface-secondary">{t}</span>
                        <span className="text-on-surface-tertiary font-mono w-8 text-right">{c}</span>
                        <div className="w-12">
                          <ProgressBar pct={p} color="var(--color-accent)" height={4} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Task completion stat */}
            <div className="lg:col-span-3 rounded-xl border border-border bg-surface-secondary p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-warning" />
                  <h3 className="font-semibold text-on-surface text-sm">
                    {isRTL ? 'إكمال المهام' : 'Task Completion'}
                  </h3>
                </div>
                <span className="text-sm font-bold text-on-surface">
                  {Math.round(taskCompletionPct)}%
                </span>
              </div>
              <ProgressBar pct={taskCompletionPct} color="var(--color-warning)" height={10} />
              <div className="flex justify-between text-[11px] text-on-surface-tertiary mt-2">
                <span>{doneTasks.length} {isRTL ? 'مكتملة' : 'done'}</span>
                <span>{pendingTasks.length} {isRTL ? 'معلقة' : 'pending'}</span>
                <span>{data?.tasks.length ?? 0} {isRTL ? 'إجمالي' : 'total'}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── TASKS ────────────────────────────────────────────── */}
        {tab === 'tasks' && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <StatPillar icon={Layers} value={data?.tasks.length ?? 0} label={isRTL ? 'إجمالي' : 'Total'} color="accent" />
              <StatPillar icon={CheckSquare} value={doneTasks.length} label={isRTL ? 'مكتملة' : 'Done'} color="success" />
              <StatPillar icon={ChevronRight} value={pendingTasks.length} label={isRTL ? 'معلقة' : 'Pending'} color="warning" />
            </div>

            <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div className="text-sm font-semibold text-on-surface">
                  {isRTL ? 'كل المهام' : 'All Tasks'}
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {(['pending', 'done', 'all'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setTaskFilter(f)}
                      className={cn(
                        'px-3 py-1 rounded-full transition-colors',
                        taskFilter === f
                          ? 'bg-accent text-on-accent'
                          : 'text-on-surface-tertiary hover:bg-surface-tertiary'
                      )}
                    >
                      {f === 'pending' ? (isRTL ? 'معلّق' : 'Pending')
                        : f === 'done' ? (isRTL ? 'مكتمل' : 'Done')
                        : (isRTL ? 'الكل' : 'All')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                {visibleTasks.length === 0 ? (
                  <p className="px-5 py-12 text-center text-sm text-on-surface-tertiary">
                    {isRTL ? 'لا توجد مهام' : 'No tasks'}
                  </p>
                ) : (
                  visibleTasks.map((t, i) => (
                    <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-tertiary transition-colors">
                      <div className={cn(
                        'h-4 w-4 rounded border shrink-0 mt-0.5 flex items-center justify-center text-[10px]',
                        t.done ? 'bg-success border-success text-white' : 'border-border'
                      )}>
                        {t.done && '✓'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-sm leading-snug',
                          t.done ? 'line-through text-on-surface-tertiary' : 'text-on-surface-secondary'
                        )}>{t.text}</p>
                        {t.section && (
                          <p className="text-[10px] text-on-surface-tertiary mt-1">{t.section}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── LITERATURE ───────────────────────────────────────── */}
        {tab === 'literature' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatPillar icon={BookOpen} value={data?.litTotal ?? 0} label={isRTL ? 'إجمالي المصادر' : 'Total Papers'} color="info" />
              <StatPillar icon={CheckSquare} value={readCount} label={isRTL ? 'مقروءة' : 'Read'} color="success" />
              <StatPillar
                icon={TrendingUp}
                value={`${Math.round(readPct)}%`}
                label={isRTL ? 'نسبة القراءة' : 'Read Rate'}
                color="warning"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="rounded-xl border border-border bg-surface-secondary p-5">
                <h3 className="text-sm font-semibold text-on-surface mb-4">
                  {isRTL ? 'حالة القراءة' : 'Reading Status'}
                </h3>
                <div className="space-y-3">
                  {Object.entries(statusCounts).sort(([, a], [, b]) => b - a).map(([s, c]) => {
                    const p = (c / (data?.litTotal || 1)) * 100;
                    return (
                      <div key={s} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-on-surface-secondary">{s}</span>
                          <span className="text-on-surface-tertiary font-mono">{c}</span>
                        </div>
                        <ProgressBar pct={p} color="var(--color-info)" />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface-secondary p-5">
                <h3 className="text-sm font-semibold text-on-surface mb-4">
                  {isRTL ? 'أنواع المصادر' : 'Source Types'}
                </h3>
                <div className="space-y-2">
                  {Object.entries(typeCounts).sort(([, a], [, b]) => b - a).map(([t, c]) => {
                    const p = (c / (data?.litTotal || 1)) * 100;
                    return (
                      <div key={t} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate text-on-surface-secondary">{t}</span>
                        <span className="text-on-surface-tertiary font-mono w-8 text-right">{c}</span>
                        <div className="w-16">
                          <ProgressBar pct={p} color="var(--color-accent)" height={4} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Recent papers table */}
            <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-on-surface">
                  {isRTL ? 'أحدث المصادر' : 'Recent Papers'}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-on-surface-tertiary">
                      <th className="text-start px-5 py-2 font-medium">{isRTL ? 'العنوان' : 'Title'}</th>
                      <th className="text-start px-3 py-2 font-medium">{isRTL ? 'المؤلف' : 'Authors'}</th>
                      <th className="text-start px-3 py-2 font-medium">{isRTL ? 'السنة' : 'Year'}</th>
                      <th className="text-start px-3 py-2 font-medium">{isRTL ? 'الحالة' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(data?.litNotes ?? []).slice(0, 15).map((n) => (
                      <tr key={n.path} className="hover:bg-surface-tertiary transition-colors">
                        <td className="px-5 py-2 max-w-xs truncate font-medium text-on-surface">{n.name}</td>
                        <td className="px-3 py-2 text-on-surface-tertiary truncate max-w-[140px]">
                          {n.authors?.split(',')[0]?.trim() ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-on-surface-tertiary">{n.year ?? '—'}</td>
                        <td className="px-3 py-2">
                          {n.readingStatus ? (
                            <span className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-medium',
                              n.readingStatus.toLowerCase().includes('read') && !n.readingStatus.toLowerCase().includes('to')
                                ? 'bg-success/15 text-success'
                                : n.readingStatus.toLowerCase().includes('to read')
                                  ? 'bg-warning/15 text-warning'
                                  : 'bg-surface-tertiary text-on-surface-tertiary'
                            )}>
                              {n.readingStatus}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(data?.litNotes.length ?? 0) > 15 && (
                <p className="text-xs text-on-surface-tertiary px-5 py-3 text-center border-t border-border">
                  +{(data?.litNotes.length ?? 0) - 15} {isRTL ? 'مصادر إضافية' : 'more papers'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── MEETINGS ─────────────────────────────────────────── */}
        {tab === 'meetings' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatPillar icon={Calendar} value={data?.meetings.length ?? 0} label={isRTL ? 'إجمالي الاجتماعات' : 'Total Meetings'} color="accent" />
              <StatPillar
                icon={Star}
                value={lastActions.length}
                label={isRTL ? 'بنود عمل حالية' : 'Open Actions'}
                color="warning"
              />
              <StatPillar
                icon={ChevronRight}
                value={nextMeeting ?? '—'}
                label={isRTL ? 'الاجتماع القادم' : 'Next Meeting'}
                color="info"
              />
            </div>

            <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-on-surface">
                  {isRTL ? 'سجل الاجتماعات' : 'Meeting Log'}
                </h3>
              </div>
              {recentMeetings.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-on-surface-tertiary">
                  {isRTL ? 'لا اجتماعات مسجّلة بعد' : 'No meetings logged yet'}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {recentMeetings.map((m) => (
                    <div key={m.id} className="px-5 py-4 hover:bg-surface-tertiary transition-colors">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="text-sm font-semibold text-on-surface">
                            {m.record?.date ?? m.title}
                          </p>
                          {m.record?.Summary && (
                            <p className="text-xs text-on-surface-secondary leading-relaxed mt-1">
                              {m.record.Summary}
                            </p>
                          )}
                        </div>
                        {m.record?.Next_Meeting && (
                          <span className="text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-full shrink-0">
                            {isRTL ? `التالي: ${m.record.Next_Meeting}` : `Next: ${m.record.Next_Meeting}`}
                          </span>
                        )}
                      </div>
                      {m.record?.action_plan_next && m.record.action_plan_next.length > 0 && (
                        <div className="mt-3 ps-3 border-s-2 border-warning/40 space-y-1">
                          {m.record.action_plan_next.slice(0, 3).map((a, i) => (
                            <p key={i} className="text-xs text-on-surface-secondary flex items-start gap-1.5">
                              <ArrowRight className="h-3 w-3 text-warning shrink-0 mt-0.5" />
                              {a}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── INSIGHTS ─────────────────────────────────────────── */}
        {tab === 'insights' && (() => {
          const CAT_INFO: Record<InsightCategory, { ar: string; en: string; color: string; bg: string; icon: React.ElementType }> = {
            insight:  { ar: 'رؤى', en: 'Insights',  color: 'text-info',    bg: 'bg-info/10',    icon: Brain },
            idea:     { ar: 'أفكار', en: 'Ideas',     color: 'text-warning', bg: 'bg-warning/10', icon: Lightbulb },
            decision: { ar: 'قرارات', en: 'Decisions', color: 'text-accent',  bg: 'bg-accent/10',  icon: Target },
            concern:  { ar: 'مخاوف', en: 'Concerns', color: 'text-error',   bg: 'bg-error/10',   icon: ChevronRight },
            goal:     { ar: 'أهداف', en: 'Goals',    color: 'text-success', bg: 'bg-success/10', icon: GraduationCap },
            progress: { ar: 'تقدم', en: 'Progress', color: 'text-success', bg: 'bg-success/10', icon: TrendingUp },
            note:     { ar: 'ملاحظات', en: 'Notes', color: 'text-on-surface-secondary', bg: 'bg-surface-tertiary', icon: BookOpen },
          };
          const grouped: Partial<Record<InsightCategory, MemoryEntry[]>> = {};
          for (const e of insights) {
            (grouped[e.category] ??= []).push(e);
          }
          const order: InsightCategory[] = ['decision', 'insight', 'idea', 'goal', 'progress', 'concern', 'note'];

          return (
            <div className="space-y-5">
              {/* Header + link to Al-Khuwy */}
              <div className="rounded-xl border border-border bg-gradient-to-br from-success/10 via-info/5 to-surface p-5 flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-info" />
                    <h3 className="text-base font-semibold text-on-surface">
                      {isRTL ? 'الرؤى البحثية — ذاكرة الخوي' : "Research Insights — Al-Khuwy's Memory"}
                    </h3>
                  </div>
                  <p className="text-xs text-on-surface-tertiary mt-1 max-w-lg">
                    {isRTL
                      ? 'كل ما حفظه الخوي من نقاشاتك: قرارات منهجية، رؤى، أفكار، مخاوف، أهداف، تقدّم. يتراكم تلقائياً عبر السنوات الأربع.'
                      : "Everything Al-Khuwy has saved from your discussions: methodology decisions, insights, ideas, concerns, goals, progress. Accumulates automatically across the 4 years."}
                  </p>
                </div>
                <a
                  href="/companion"
                  className="text-xs px-3 py-1.5 rounded-lg bg-success/15 text-success hover:bg-success/25 flex items-center gap-1.5 shrink-0"
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  {isRTL ? 'افتح الخوي لإضافة' : 'Open Al-Khuwy to add'}
                </a>
              </div>

              {insights.length === 0 ? (
                <div className="rounded-xl border border-border bg-surface-secondary p-12 text-center">
                  <Brain className="h-10 w-10 text-on-surface-tertiary mx-auto mb-3 opacity-40" />
                  <p className="text-sm text-on-surface-tertiary max-w-md mx-auto">
                    {isRTL
                      ? 'لا توجد رؤى بعد. تحدّث مع الخوي عن أفكارك وقراراتك، وسيحفظها هنا تلقائياً.'
                      : 'No insights yet. Talk to Al-Khuwy about your ideas and decisions, and they will appear here automatically.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Category counts strip */}
                  <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                    {order.map((cat) => {
                      const cfg = CAT_INFO[cat];
                      const count = grouped[cat]?.length ?? 0;
                      const Icon = cfg.icon;
                      return (
                        <div key={cat} className={cn('rounded-lg p-2.5 border border-border flex items-center gap-2', count > 0 ? cfg.bg : 'bg-surface-secondary opacity-60')}>
                          <Icon className={cn('h-3.5 w-3.5 shrink-0', cfg.color)} />
                          <div className="min-w-0">
                            <p className={cn('text-sm font-bold leading-none', cfg.color)}>{count}</p>
                            <p className="text-[9px] uppercase tracking-wider text-on-surface-tertiary mt-0.5 truncate">{cfg[language]}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Grouped entries */}
                  {order.filter((cat) => (grouped[cat]?.length ?? 0) > 0).map((cat) => {
                    const cfg = CAT_INFO[cat];
                    const Icon = cfg.icon;
                    const entries = grouped[cat] ?? [];
                    return (
                      <div key={cat} className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
                        <div className={cn('px-4 py-2.5 border-b border-border flex items-center gap-2', cfg.bg)}>
                          <Icon className={cn('h-4 w-4', cfg.color)} />
                          <h3 className={cn('text-sm font-semibold', cfg.color)}>
                            {cfg[language]} ({entries.length})
                          </h3>
                        </div>
                        <div className="divide-y divide-border">
                          {entries
                            .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
                            .map((e) => (
                              <div key={e.id} className="px-4 py-3 hover:bg-surface-tertiary transition-colors">
                                <p className="text-sm text-on-surface-secondary leading-snug">{e.content}</p>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  <span className="text-[10px] text-on-surface-tertiary">{e.date}</span>
                                  {(e.tags ?? []).map((t) => (
                                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary">#{t}</span>
                                  ))}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
