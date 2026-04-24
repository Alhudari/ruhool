'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen, Brain, Calendar, CheckSquare, Loader2,
  GraduationCap, BookMarked, Star, RefreshCw, TrendingUp,
  Target, FlaskConical, ArrowRight, ChevronRight, Lightbulb,
  Award, Layers, AlertTriangle, Clock, BookPlus, Crosshair,
  X, MessageCircle, ChevronDown, ChevronUp,
  CheckCircle2, Circle, ClipboardList, Zap, BarChart3, ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

// ── PhD timeline ──────────────────────────────────────────────────────
const PHD_START = new Date('2026-01-05');
const PHD_END   = new Date('2029-07-05');
const TOTAL_MS  = PHD_END.getTime() - PHD_START.getTime();

function datePct(d: Date) {
  return Math.max(0, Math.min(100, ((d.getTime() - PHD_START.getTime()) / TOTAL_MS) * 100));
}

// Year boundary markers (no shimmer, no milestone labels)
const YEAR_MARKERS = [
  { label: { en: 'Year 1', ar: 'السنة ١' }, pct: datePct(new Date('2027-01-05')) },
  { label: { en: 'Year 2', ar: 'السنة ٢' }, pct: datePct(new Date('2028-01-05')) },
  { label: { en: 'Year 3', ar: 'السنة ٣' }, pct: datePct(new Date('2029-01-05')) },
];

function phdProgress() {
  const now = Date.now();
  const elapsed = now - PHD_START.getTime();
  const pct = Math.max(0, Math.min(100, (elapsed / TOTAL_MS) * 100));
  const daysIn  = Math.max(0, Math.floor(elapsed / 86400000));
  const daysLeft = Math.max(0, Math.ceil((PHD_END.getTime() - now) / 86400000));
  const yearsPassed = Math.max(0, elapsed / (365.25 * 86400000));
  const currentYear = Math.min(4, Math.max(1, Math.floor(yearsPassed) + 1));
  const yearStart = new Date('2026-01-05');
  yearStart.setFullYear(yearStart.getFullYear() + currentYear - 1);
  const daysInYear = Math.max(0, Math.floor((now - yearStart.getTime()) / 86400000));
  return { pct, daysIn, daysLeft, currentYear, daysInYear };
}

// ── Types ─────────────────────────────────────────────────────────────
interface LitNote {
  path: string; name: string; citekey?: string; type?: string;
  year?: number; authors?: string; tags?: string[];
  readingStatus?: string; relevance?: string;
}
interface MeetingSession {
  id: string; title: string; createdAt: string; updatedAt: string;
  record?: {
    date?: string | null;
    location?: string | null;
    attendees?: string[] | null;
    Summary?: string;
    action_plan_next?: string[];
    Next_Meeting?: string | null;
  } | null;
}
type InsightCategory = 'insight' | 'idea' | 'decision' | 'concern' | 'goal' | 'progress' | 'note';
interface MemoryEntry {
  id: string; category: InsightCategory; content: string; date: string; tags?: string[];
}
interface Grs2Reminder {
  needsGrs2: boolean; urgentFollowUp: boolean; currentMonth: string; daysUntilMonthEnd: number;
}
interface Grs2Record {
  id: string; month: string;
  status: 'not_started' | 'submitted' | 'supervisor_approved' | 'student_confirmed' | 'university_approved';
  progress: number;
  content?: string; supervisorResponse?: string;
  submittedAt?: string; supervisorApprovedAt?: string; studentConfirmedAt?: string; universityApprovedAt?: string;
}
interface ScopePoint {
  id: string; number: number; title: string;
  status?: 'active' | 'completed' | 'paused' | 'dropped'; phase?: string;
}
interface ZoteroItem {
  key: string; title?: string; itemType?: string; dateAdded?: string;
  creators?: Array<{ lastName?: string; firstName?: string }>;
}
interface TaskItem {
  id: string; title: string; notes: string; completed: boolean;
  priority: string; dueDate: string | null; list: string;
  tags: string[]; createdAt: string; updatedAt: string;
}
interface UsageSummary {
  totalCost: number; totalCalls: number; totalInputTokens: number; totalOutputTokens: number;
}

// ── GRS2 stages ───────────────────────────────────────────────────────
const GRS2_STAGES: Array<{ key: Grs2Record['status']; pct: number; en: string; ar: string }> = [
  { key: 'not_started',        pct: 0,   en: 'Not Started',        ar: 'لم يبدأ' },
  { key: 'submitted',          pct: 25,  en: 'Submitted',           ar: 'مُقدَّم' },
  { key: 'supervisor_approved',pct: 75,  en: 'Supervisor Approved', ar: 'موافقة المشرف' },
  { key: 'university_approved',pct: 100, en: 'University Approved', ar: 'موافقة الجامعة' },
];

function monthLabel(month: string) {
  try {
    const [y, m] = month.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  } catch { return month; }
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
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-border" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
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
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }}
      />
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-surface-tertiary rounded', className)} />;
}

function greeting(lang: 'en' | 'ar') {
  const h = new Date().getHours();
  if (lang === 'ar') return h < 12 ? 'صباح الخير، عبدالله' : h < 18 ? 'مساء الخير، عبدالله' : 'مساء النور، عبدالله';
  return h < 12 ? 'Good morning, Abdullah' : h < 18 ? 'Good afternoon, Abdullah' : 'Good evening, Abdullah';
}

// ── Al-Khuwy Mini-Chat Popup ──────────────────────────────────────────
function AlKhuwyPopup({ open, onClose, isRTL }: { open: boolean; onClose: () => void; isRTL: boolean }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await apiFetch('/api/companion/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'note', content: trimmed }),
      });
      setText('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Popup */}
      <div
        className="fixed bottom-6 end-6 z-50 w-96 h-[500px] rounded-2xl border border-border bg-surface shadow-2xl flex flex-col overflow-hidden"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-success/10 to-info/5">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-success/15 flex items-center justify-center">
              <Brain className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface">الخوي</p>
              <p className="text-[10px] text-on-surface-tertiary">{isRTL ? 'مساعد البحث' : 'Research Companion'}</p>
            </div>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center text-on-surface-tertiary hover:bg-surface-tertiary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="rounded-xl bg-surface-secondary border border-border p-3">
            <p className="text-xs text-on-surface-secondary leading-relaxed">
              {isRTL
                ? 'أهلاً بك. أكتب ملاحظة أو فكرة أو قرار وسأحفظه في ذاكرتي. للمحادثة الكاملة، افتح صفحة الخوي.'
                : 'Hello! Write a note, idea, or decision and I\'ll save it to my memory. For a full conversation, open the Al-Khuwy page.'}
            </p>
          </div>
          {saved && (
            <div className="rounded-lg bg-success/10 border border-success/20 px-3 py-2 text-xs text-success flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isRTL ? 'تم الحفظ في الذاكرة' : 'Saved to memory'}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-3 space-y-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            dir="auto"
            placeholder={isRTL ? 'فكرة، ملاحظة، قرار…' : 'An idea, note, decision…'}
            className="w-full resize-none rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave(); }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-on-surface-tertiary">{isRTL ? 'Ctrl+Enter للحفظ' : 'Ctrl+Enter to save'}</span>
            <div className="flex gap-2">
              <a
                href="/companion"
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-on-surface-secondary hover:bg-surface-tertiary transition-colors"
              >
                {isRTL ? 'فتح الخوي' : 'Open Al-Khuwy'}
              </a>
              <button
                onClick={handleSave}
                disabled={saving || !text.trim()}
                className="text-xs px-3 py-1.5 rounded-lg bg-success text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {isRTL ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Tab IDs ────────────────────────────────────────────────────────────
type Tab = 'overview' | 'meetings' | 'grs2' | 'tasks' | 'library-stats' | 'insights' | 'calendar' | 'supervision';
const TABS: { id: Tab; icon: React.ElementType; label: { en: string; ar: string } }[] = [
  { id: 'overview',      icon: Layers,       label: { en: 'Overview',      ar: 'نظرة عامة' } },
  { id: 'meetings',      icon: Calendar,     label: { en: 'Meetings',      ar: 'الاجتماعات' } },
  { id: 'grs2',          icon: ClipboardList,label: { en: 'GRS2',          ar: 'GRS2' } },
  { id: 'tasks',         icon: CheckSquare,  label: { en: 'Tasks',         ar: 'المهام' } },
  { id: 'supervision',   icon: GraduationCap,label: { en: 'Supervision',   ar: 'الإشراف' } },
  { id: 'calendar',      icon: Calendar,     label: { en: 'Calendar',      ar: 'التقويم' } },
  { id: 'library-stats', icon: BookMarked,   label: { en: 'Library',       ar: 'المكتبة' } },
  { id: 'insights',      icon: Lightbulb,    label: { en: 'Insights',      ar: 'رؤى' } },
];

// ── Main Component ────────────────────────────────────────────────────
export function PhDDashboard() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  // Core data
  const [litNotes, setLitNotes] = useState<LitNote[]>([]);
  const [litTotal, setLitTotal] = useState(0);
  const [meetings, setMeetings] = useState<MeetingSession[]>([]);
  const [insights, setInsights] = useState<MemoryEntry[]>([]);
  const [grs2Reminder, setGrs2Reminder] = useState<Grs2Reminder | null>(null);
  const [scopePoints, setScopePoints] = useState<ScopePoint[]>([]);
  const [recentZotero, setRecentZotero] = useState<ZoteroItem[]>([]);
  const [platformTasks, setPlatformTasks] = useState<TaskItem[]>([]);
  const [grs2Current, setGrs2Current] = useState<Grs2Record | null>(null);
  const [grs2History, setGrs2History] = useState<Grs2Record[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [taskFilter, setTaskFilter] = useState<'pending' | 'done' | 'all'>('pending');
  const [khuwyOpen, setKhuwyOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);

  // GRS2 inline state
  const [grs2ContentDraft, setGrs2ContentDraft] = useState('');
  const [grs2SupervisorDraft, setGrs2SupervisorDraft] = useState('');
  const [grs2Saving, setGrs2Saving] = useState(false);
  const [grs2ExpandedMonth, setGrs2ExpandedMonth] = useState<string | null>(null);

  // Task toggle optimistic state
  const [togglingTask, setTogglingTask] = useState<string | null>(null);

  // Check if the URL has a ?tab= param (for /grs2 redirect)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('tab') as Tab | null;
      if (t && TABS.some(x => x.id === t)) setTab(t);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [
        litRes, meetRes, memRes, grs2RemRes, scopeRes, zotRes,
        tasksRes, grs2CurRes, grs2AllRes, usageRes,
      ] = await Promise.all([
        apiFetch<{ notes: LitNote[]; total: number }>('/api/vault/literature').catch(() => ({ notes: [], total: 0 })),
        apiFetch<MeetingSession[]>('/api/meetings/sessions').catch(() => [] as MeetingSession[]),
        apiFetch<MemoryEntry[]>('/api/companion/memory').catch(() => [] as MemoryEntry[]),
        apiFetch<Grs2Reminder>('/api/grs2/reminders').catch(() => null),
        apiFetch<{ scopePoints: ScopePoint[] }>('/api/scope-points').catch(() => ({ scopePoints: [] })),
        apiFetch<{ items: ZoteroItem[] }>('/api/zotero/items?limit=200').catch(() => ({ items: [] })),
        apiFetch<TaskItem[]>('/api/tasks').catch(() => [] as TaskItem[]),
        apiFetch<Grs2Record>('/api/grs2/current').catch(() => null),
        apiFetch<Grs2Record[]>('/api/grs2').catch(() => [] as Grs2Record[]),
        apiFetch<UsageSummary>('/api/usage/summary').catch(() => null),
      ]);

      setLitNotes(litRes.notes);
      setLitTotal(litRes.total);
      setMeetings(meetRes);
      setInsights(memRes);
      setGrs2Reminder(grs2RemRes);
      setScopePoints(scopeRes.scopePoints);
      setPlatformTasks(Array.isArray(tasksRes) ? tasksRes : []);
      setUsageSummary(usageRes);

      if (grs2CurRes) {
        setGrs2Current(grs2CurRes);
        setGrs2ContentDraft(grs2CurRes.content ?? '');
        setGrs2SupervisorDraft(grs2CurRes.supervisorResponse ?? '');
      }
      setGrs2History(
        (Array.isArray(grs2AllRes) ? grs2AllRes : [])
          .filter(r => r.month !== grs2CurRes?.month)
          .sort((a, b) => b.month.localeCompare(a.month))
      );

      const cutoff = Date.now() - 7 * 86400000;
      setRecentZotero(
        (zotRes.items ?? []).filter(item => item.dateAdded && new Date(item.dateAdded).getTime() >= cutoff)
      );
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { pct: phdPct, daysIn, daysLeft, currentYear, daysInYear } = phdProgress();

  // Canonical meeting order: sorted by createdAt ascending → Meeting #1, #2, …
  const sortedMeetings = useMemo(
    () => [...meetings].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [meetings]
  );

  // Derived: pending / done tasks from platform
  const pendingTasks = useMemo(() => platformTasks.filter(t => !t.completed), [platformTasks]);
  const doneTasks    = useMemo(() => platformTasks.filter(t => t.completed),  [platformTasks]);
  const meetingTasks = useMemo(() =>
    platformTasks.filter(t =>
      t.list?.toLowerCase().includes('اجتماع') ||
      t.list?.toLowerCase().includes('meeting')
    ),
    [platformTasks]
  );

  // Library stats
  const statusCounts = useMemo(() => litNotes.reduce<Record<string, number>>((acc, n) => {
    const s = n.readingStatus ?? 'Unknown';
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {}), [litNotes]);
  const typeCounts = useMemo(() => litNotes.reduce<Record<string, number>>((acc, n) => {
    const t = n.type ?? 'unknown';
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {}), [litNotes]);
  const readCount = statusCounts['Read'] ?? 0;
  const readPct   = litTotal ? (readCount / litTotal) * 100 : 0;

  // Next meeting
  const nextMeeting = sortedMeetings.findLast(m => m.record?.Next_Meeting)?.record?.Next_Meeting ?? null;
  const nextMeetingDays = useMemo(() => {
    if (!nextMeeting) return null;
    const parsed = new Date(nextMeeting.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'));
    if (!Number.isNaN(parsed.getTime())) return Math.ceil((parsed.getTime() - Date.now()) / 86400000);
    return null;
  }, [nextMeeting]);

  // Previous / last meeting
  const lastMeeting = sortedMeetings.length > 0 ? sortedMeetings[sortedMeetings.length - 1] : null;
  const lastMeetingNo = lastMeeting ? sortedMeetings.indexOf(lastMeeting) + 1 : null;

  // Last action items
  const lastActions = sortedMeetings.findLast(m => m.record?.action_plan_next?.length)?.record?.action_plan_next ?? [];

  // Year breakdown
  const yearCounts = useMemo(() => {
    const c: Record<number, number> = {};
    for (const n of litNotes) if (n.year) c[n.year] = (c[n.year] ?? 0) + 1;
    return Object.entries(c).map(([y, n]) => ({ year: Number(y), n })).sort((a, b) => a.year - b.year);
  }, [litNotes]);
  const maxYearCount = yearCounts.reduce((m, x) => Math.max(m, x.n), 0);

  const today = new Date().toLocaleDateString(isRTL ? 'ar-SA' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── GRS2 actions ────────────────────────────────────────────────────
  const grs2SaveContent = async () => {
    if (!grs2Current) return;
    setGrs2Saving(true);
    try {
      const updated = await apiFetch<Grs2Record>(`/api/grs2/${grs2Current.month}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: grs2ContentDraft, supervisorResponse: grs2SupervisorDraft }),
      });
      setGrs2Current(updated);
    } finally { setGrs2Saving(false); }
  };

  const grs2DoAction = async (endpoint: string, body?: object) => {
    if (!grs2Current) return;
    setGrs2Saving(true);
    try {
      const updated = await apiFetch<Grs2Record>(`/api/grs2/${grs2Current.month}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      setGrs2Current(updated);
    } finally { setGrs2Saving(false); }
  };

  // ── Task toggle ─────────────────────────────────────────────────────
  const toggleTask = async (taskId: string) => {
    setTogglingTask(taskId);
    // Optimistic update
    setPlatformTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
    try {
      await apiFetch(`/api/tasks/${taskId}/toggle`, { method: 'PUT' });
    } catch {
      // Revert on failure
      setPlatformTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
    } finally { setTogglingTask(null); }
  };

  // ── Loading skeleton ─────────────────────────────────────────────────
  if (loading) return (
    <div className="flex-1 overflow-y-auto bg-surface">
      <div className="h-48 bg-gradient-to-br from-accent/10 via-info/5 to-surface border-b border-border px-10 py-8">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64 mb-8" />
        <Skeleton className="h-7 w-full rounded-full" />
      </div>
      <div className="max-w-6xl mx-auto px-10 py-8 grid grid-cols-3 gap-5">
        {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    </div>
  );

  const visibleTasks =
    taskFilter === 'pending' ? pendingTasks :
    taskFilter === 'done'    ? doneTasks    :
    platformTasks;

  return (
    <div className="flex-1 overflow-y-auto bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Al-Khuwy popup ──────────────────────────────────────── */}
      <AlKhuwyPopup open={khuwyOpen} onClose={() => setKhuwyOpen(false)} isRTL={isRTL} />

      {/* ── HERO ────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-accent/10 via-info/5 to-surface px-6 md:px-10 py-8">
        <div className="max-w-6xl mx-auto">

          {/* Top row */}
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setKhuwyOpen(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-success/15 text-success hover:bg-success/25 transition-colors border border-success/20"
              >
                <Brain className="h-3.5 w-3.5" />
                {isRTL ? 'الخوي' : 'Al-Khuwy'}
              </button>
              <button
                onClick={load}
                className="flex items-center gap-1.5 text-xs text-on-surface-tertiary hover:text-on-surface transition-colors px-3 py-1.5 rounded-lg border border-border hover:border-border bg-surface-secondary"
              >
                <RefreshCw className="h-3 w-3" />
                {isRTL ? 'تحديث' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Stats pillars + ring */}
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-center mb-8">
            <div className="flex items-center gap-4">
              <Ring pct={phdPct} size={92} stroke={6} color="var(--color-accent)" label={isRTL ? 'مكتمل' : 'done'} />
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-widest text-on-surface-tertiary">
                  {isRTL ? `السنة ${currentYear} من الدكتوراه` : `PhD Year ${currentYear}`}
                </p>
                <p className="text-lg font-bold text-on-surface">
                  {daysIn}
                  <span className="text-xs text-on-surface-tertiary font-normal mx-1">{isRTL ? 'يوم' : 'days in'}</span>
                </p>
                <p className="text-xs text-on-surface-secondary">
                  {daysLeft} {isRTL ? 'يوم متبقٍ' : 'days remaining'}
                </p>
                <p className="text-[10px] text-on-surface-tertiary">
                  {isRTL ? `${daysInYear} يوم في السنة ${currentYear}` : `${daysInYear} days into Year ${currentYear}`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatPillar icon={BookOpen} value={litTotal} label={isRTL ? 'مصادر' : 'Sources'} sub={`${readCount} ${isRTL ? 'مقروءة' : 'read'}`} color="info" />
              <StatPillar icon={CheckSquare} value={pendingTasks.length} label={isRTL ? 'مهام' : 'Tasks'} sub={`${doneTasks.length} ${isRTL ? 'مكتملة' : 'done'}`} color="warning" />
              <StatPillar icon={Calendar} value={meetings.length} label={isRTL ? 'اجتماعات' : 'Meetings'} sub={nextMeeting ? `${isRTL ? 'التالي' : 'Next'}: ${nextMeeting}` : undefined} color="accent" />
              <StatPillar icon={TrendingUp} value={`${Math.round(readPct)}%`} label={isRTL ? 'وتيرة القراءة' : 'Read Rate'} color="success" />
            </div>
          </div>

          {/* Year-based timeline bar (no shimmer, no milestone names) */}
          <div>
            <div className="relative h-7 rounded-full bg-surface-tertiary overflow-visible border border-border">
              {/* Clean fill — accent color only */}
              <div
                className="absolute inset-y-0 start-0 rounded-full transition-all duration-500"
                style={{ width: `${phdPct}%`, backgroundColor: 'var(--color-accent)', opacity: 0.85 }}
              />
              {/* Year boundary marks */}
              {YEAR_MARKERS.map((m) => {
                const isPast = phdPct >= m.pct;
                return (
                  <div
                    key={m.pct}
                    className="absolute top-0 bottom-0 flex items-center pointer-events-none"
                    style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}
                  >
                    <div className={cn(
                      'h-full w-0.5 transition-colors',
                      isPast ? 'bg-white/60' : 'bg-border'
                    )} />
                  </div>
                );
              })}
              {/* "Now" pin */}
              <div
                className="absolute top-0 bottom-0 flex items-center pointer-events-none"
                style={{ left: `${phdPct}%`, transform: 'translateX(-50%)' }}
              >
                <div className="h-full w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
              </div>
            </div>

            {/* Year labels under bar */}
            <div className="relative h-5 mt-1.5">
              {YEAR_MARKERS.map((m) => (
                <div key={m.pct} className="absolute" style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}>
                  <span className={cn(
                    'text-[9px] uppercase tracking-wider whitespace-nowrap font-semibold',
                    phdPct >= m.pct ? 'text-accent' : 'text-on-surface-tertiary opacity-70'
                  )}>
                    {m.label[language]}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-between text-[9px] text-on-surface-tertiary uppercase tracking-wider mt-2">
              <span>{isRTL ? 'يناير ٢٠٢٦' : 'Jan 2026'}</span>
              <span className="text-accent font-bold">{Math.round(phdPct)}% — {isRTL ? `السنة ${currentYear}` : `Year ${currentYear}`}</span>
              <span>{isRTL ? 'يوليو ٢٠٢٩' : 'Jul 2029'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── TABS BAR ────────────────────────────────────────────── */}
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

      {/* ── TAB CONTENT ─────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8">

        {error && (
          <div className="mb-6 rounded-lg border border-warning bg-warning/10 px-4 py-3 text-sm text-warning">
            {isRTL ? 'تعذّر تحميل بعض البيانات.' : 'Could not load some data.'} {error}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* OVERVIEW TAB                                          */}
        {/* ══════════════════════════════════════════════════════ */}
        {tab === 'overview' && (
          <div className="space-y-5">

            {/* 1 ─ GRS2 inline widget */}
            <div className="rounded-xl border border-border bg-surface-secondary p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-semibold text-on-surface">
                    {isRTL ? `GRS2 — ${grs2Current ? monthLabel(grs2Current.month) : ''}` : `GRS2 — ${grs2Current ? monthLabel(grs2Current.month) : ''}`}
                  </h3>
                </div>
                <button onClick={() => setTab('grs2')} className="text-[11px] text-accent hover:underline">
                  {isRTL ? 'إدارة كاملة' : 'Manage'}
                </button>
              </div>
              {grs2Current ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <ProgressBar
                        pct={grs2Current.progress}
                        color={grs2Current.progress === 100 ? 'var(--color-success)' : grs2Current.progress >= 75 ? 'var(--color-info)' : 'var(--color-warning)'}
                        height={8}
                      />
                    </div>
                    <span className="text-sm font-bold text-on-surface w-12 text-end">{grs2Current.progress}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full font-medium',
                      grs2Current.status === 'university_approved' ? 'bg-success/15 text-success' :
                      grs2Current.status === 'supervisor_approved' || grs2Current.status === 'student_confirmed' ? 'bg-info/15 text-info' :
                      grs2Current.status === 'submitted' ? 'bg-warning/15 text-warning' :
                      'bg-surface-tertiary text-on-surface-tertiary'
                    )}>
                      {GRS2_STAGES.find(s => s.key === grs2Current.status)?.[isRTL ? 'ar' : 'en'] ?? grs2Current.status}
                    </span>
                    {grs2Current.status !== 'university_approved' && (
                      <button
                        onClick={() => setTab('grs2')}
                        className="text-xs px-3 py-1 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                      >
                        {grs2Current.status === 'not_started' ? (isRTL ? 'تقديم التقرير' : 'Submit Report') :
                         grs2Current.status === 'submitted' ? (isRTL ? 'موافقة المشرف' : 'Supervisor Approve') :
                         (isRTL ? 'موافقة الجامعة' : 'University Approve')}
                      </button>
                    )}
                  </div>
                  {grs2Reminder && (grs2Reminder.needsGrs2 || grs2Reminder.urgentFollowUp) && (
                    <div className={cn(
                      'rounded-lg border px-3 py-2 flex items-center gap-2 text-xs',
                      grs2Reminder.urgentFollowUp ? 'bg-error/10 border-error/20 text-error' : 'bg-warning/10 border-warning/20 text-warning'
                    )}>
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {isRTL
                        ? `${grs2Reminder.daysUntilMonthEnd} أيام متبقية لنهاية الشهر`
                        : `${grs2Reminder.daysUntilMonthEnd} days left this month`}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-on-surface-tertiary">{isRTL ? 'لا يوجد تقرير للشهر الحالي' : 'No report for current month'}</p>
              )}
            </div>

            {/* 2+3 ─ Previous & Next meeting */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Previous meeting */}
              <div className="rounded-xl border border-border bg-surface-secondary p-4">
                <p className="text-[10px] uppercase tracking-widest text-on-surface-tertiary mb-2">
                  {isRTL ? 'الاجتماع السابق' : 'Previous Meeting'}
                </p>
                {lastMeeting ? (
                  <div>
                    <p className="text-sm font-bold text-on-surface">
                      {isRTL ? `اجتماع #${lastMeetingNo}` : `Meeting #${lastMeetingNo}`}
                      {lastMeeting.record?.date && (
                        <span className="text-xs text-on-surface-tertiary font-normal ms-2">— {lastMeeting.record.date}</span>
                      )}
                    </p>
                    {lastMeeting.record?.Summary && (
                      <p className="text-xs text-on-surface-secondary mt-1 line-clamp-2 leading-relaxed">
                        {lastMeeting.record.Summary.replace(/[#*]/g, '').trim().slice(0, 120)}
                      </p>
                    )}
                    {lastMeeting.record?.action_plan_next?.length ? (
                      <p className="text-[11px] text-warning mt-2">
                        {lastMeeting.record.action_plan_next.length} {isRTL ? 'بنود عمل' : 'action items'}
                      </p>
                    ) : null}
                    <button onClick={() => setTab('meetings')} className="text-[11px] text-accent hover:underline mt-1.5 block">
                      {isRTL ? 'فتح التفاصيل' : 'Open details'}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-tertiary">{isRTL ? 'لا اجتماعات بعد' : 'No meetings yet'}</p>
                )}
              </div>

              {/* Next meeting */}
              <div className={cn(
                'rounded-xl border p-4 flex flex-col justify-between',
                nextMeetingDays !== null && nextMeetingDays <= 3
                  ? 'bg-blue-500/10 border-blue-500/20'
                  : 'bg-surface-secondary border-border'
              )}>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-tertiary mb-2">
                  {isRTL ? 'الاجتماع القادم' : 'Next Meeting'}
                </p>
                {nextMeetingDays !== null ? (
                  <div>
                    <p className="text-2xl font-bold text-on-surface">
                      {nextMeetingDays <= 0 ? (isRTL ? 'اليوم!' : 'Today!')
                        : nextMeetingDays === 1 ? (isRTL ? 'غداً' : 'Tomorrow')
                        : `${nextMeetingDays} ${isRTL ? 'أيام' : 'days'}`}
                    </p>
                    <p className="text-xs text-on-surface-secondary mt-1">{nextMeeting}</p>
                    {nextMeetingDays <= 3 && (
                      <span className="text-[10px] mt-2 inline-block px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-500 font-medium">
                        {isRTL ? 'قريب!' : 'Urgent'}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-tertiary">{isRTL ? 'لا يوجد تاريخ اجتماع قادم' : 'No upcoming meeting date'}</p>
                )}
              </div>
            </div>

            {/* 4 ─ Pending tasks (last 5, tick-to-complete) */}
            <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-warning" />
                  <h3 className="text-sm font-semibold text-on-surface">
                    {isRTL ? 'المهام المعلّقة' : 'Pending Tasks'}
                  </h3>
                </div>
                <button onClick={() => setTab('tasks')} className="text-[11px] text-accent hover:underline">
                  {isRTL ? 'عرض الكل' : 'View all'}
                </button>
              </div>
              {pendingTasks.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-on-surface-tertiary">
                  {isRTL ? 'لا مهام معلّقة 🎉' : 'No pending tasks 🎉'}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {pendingTasks.slice(0, 5).map(t => (
                    <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-tertiary transition-colors">
                      <button
                        onClick={() => toggleTask(t.id)}
                        disabled={togglingTask === t.id}
                        className="h-5 w-5 rounded border-2 border-border shrink-0 flex items-center justify-center hover:border-success hover:bg-success/10 transition-colors disabled:opacity-50"
                      >
                        {togglingTask === t.id && <Loader2 className="h-3 w-3 animate-spin text-on-surface-tertiary" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-on-surface-secondary truncate">{t.title}</p>
                        {t.list && t.list !== 'عام' && (
                          <p className="text-[10px] text-on-surface-tertiary mt-0.5">{t.list}</p>
                        )}
                      </div>
                      {t.dueDate && (
                        <span className="text-[10px] text-on-surface-tertiary shrink-0">
                          {new Date(t.dueDate).toLocaleDateString('en-GB')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 5 ─ Meeting tasks */}
            {meetingTasks.length > 0 && (
              <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-accent" />
                    <h3 className="text-sm font-semibold text-on-surface">
                      {isRTL ? 'مهام الاجتماعات' : 'Meeting Tasks'}
                    </h3>
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {meetingTasks.slice(0, 5).map(t => (
                    <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-tertiary transition-colors">
                      <button
                        onClick={() => toggleTask(t.id)}
                        disabled={togglingTask === t.id}
                        className={cn(
                          'h-5 w-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors disabled:opacity-50',
                          t.completed ? 'border-success bg-success/10' : 'border-border hover:border-success hover:bg-success/10'
                        )}
                      >
                        {t.completed && <CheckCircle2 className="h-3 w-3 text-success" />}
                        {togglingTask === t.id && <Loader2 className="h-3 w-3 animate-spin text-on-surface-tertiary" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm truncate', t.completed ? 'line-through text-on-surface-tertiary' : 'text-on-surface-secondary')}>{t.title}</p>
                        <p className="text-[10px] text-accent mt-0.5">{t.list}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6 ─ Library stats */}
            <div className="rounded-xl border border-border bg-surface-secondary p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-info" />
                  <h3 className="text-sm font-semibold text-on-surface">
                    {isRTL ? 'إحصاءات المكتبة' : 'Library Stats'}
                  </h3>
                </div>
                <button onClick={() => setTab('library-stats')} className="text-[11px] text-accent hover:underline">
                  {isRTL ? 'تفاصيل' : 'Details'}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div className="rounded-lg bg-surface border border-border p-3">
                  <p className="text-2xl font-bold text-on-surface">{litTotal}</p>
                  <p className="text-[10px] text-on-surface-tertiary uppercase tracking-wider mt-1">{isRTL ? 'إجمالي' : 'Total'}</p>
                </div>
                <div className="rounded-lg bg-surface border border-border p-3">
                  <p className="text-2xl font-bold text-success">{readCount}</p>
                  <p className="text-[10px] text-on-surface-tertiary uppercase tracking-wider mt-1">{isRTL ? 'مقروءة' : 'Read'}</p>
                </div>
                <div className="rounded-lg bg-surface border border-border p-3">
                  <p className="text-2xl font-bold text-warning">{statusCounts['To Read'] ?? statusCounts['to-read'] ?? 0}</p>
                  <p className="text-[10px] text-on-surface-tertiary uppercase tracking-wider mt-1">{isRTL ? 'للقراءة' : 'To Read'}</p>
                </div>
                <div className="rounded-lg bg-surface border border-border p-3">
                  <p className="text-2xl font-bold text-info">{statusCounts['Reading'] ?? statusCounts['reading'] ?? 0}</p>
                  <p className="text-[10px] text-on-surface-tertiary uppercase tracking-wider mt-1">{isRTL ? 'يُقرأ الآن' : 'Reading'}</p>
                </div>
              </div>
            </div>

            {/* 7 ─ Al-Khuwy shortcut */}
            <div className="rounded-xl border border-success/20 bg-gradient-to-br from-success/10 via-info/5 to-surface p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-success/15 flex items-center justify-center shrink-0">
                  <Brain className="h-6 w-6 text-success" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-on-surface">{isRTL ? 'الخوي — مساعد البحث' : 'Al-Khuwy — Research Companion'}</p>
                  <p className="text-xs text-on-surface-tertiary mt-0.5">
                    {isRTL ? `${insights.length} رؤية محفوظة` : `${insights.length} memories saved`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setKhuwyOpen(true)}
                  className="text-sm px-4 py-2 rounded-lg bg-success text-white hover:opacity-90 transition-opacity flex items-center gap-2"
                >
                  <MessageCircle className="h-4 w-4" />
                  {isRTL ? 'تحدّث مع الخوي' : 'Talk to Al-Khuwy'}
                </button>
              </div>
            </div>

            {/* 8 ─ Recent Zotero */}
            {recentZotero.length > 0 && (
              <div className="rounded-xl border border-border bg-surface-secondary p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BookPlus className="h-4 w-4 text-accent" />
                    <h3 className="text-sm font-semibold text-on-surface">
                      {isRTL ? `أُضيف حديثاً (${recentZotero.length})` : `Recently Added (${recentZotero.length})`}
                    </h3>
                  </div>
                  <a href="/zotero" className="text-[11px] text-accent hover:underline">{isRTL ? 'عرض الكل' : 'View all'}</a>
                </div>
                <div className="space-y-1.5">
                  {recentZotero.slice(0, 5).map(item => (
                    <div key={item.key} className="flex items-center gap-2 text-xs py-1">
                      <BookOpen className="h-3.5 w-3.5 text-on-surface-tertiary shrink-0" />
                      <span className="flex-1 truncate text-on-surface-secondary">{item.title ?? item.key}</span>
                      {item.dateAdded && (
                        <span className="text-[10px] text-on-surface-tertiary shrink-0 font-mono">
                          {new Date(item.dateAdded).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 9 ─ Usage / Cost / System — collapsed accordion */}
            <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
              <button
                onClick={() => setUsageOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-surface-tertiary transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-on-surface-tertiary" />
                  <span className="text-sm font-medium text-on-surface-secondary">
                    {isRTL ? 'الاستخدام والتكلفة والنظام' : 'Usage / Cost / System'}
                  </span>
                </div>
                {usageOpen ? <ChevronUp className="h-4 w-4 text-on-surface-tertiary" /> : <ChevronDown className="h-4 w-4 text-on-surface-tertiary" />}
              </button>
              {usageOpen && usageSummary && (
                <div className="border-t border-border px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-[10px] text-on-surface-tertiary uppercase tracking-wider mb-1">{isRTL ? 'إجمالي التكلفة' : 'Total Cost'}</p>
                    <p className="font-bold text-on-surface">${usageSummary.totalCost.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-on-surface-tertiary uppercase tracking-wider mb-1">{isRTL ? 'طلبات API' : 'API Calls'}</p>
                    <p className="font-bold text-on-surface">{usageSummary.totalCalls.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-on-surface-tertiary uppercase tracking-wider mb-1">{isRTL ? 'رموز الإدخال' : 'Input Tokens'}</p>
                    <p className="font-bold text-on-surface">{(usageSummary.totalInputTokens / 1000).toFixed(1)}k</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-on-surface-tertiary uppercase tracking-wider mb-1">{isRTL ? 'رموز الإخراج' : 'Output Tokens'}</p>
                    <p className="font-bold text-on-surface">{(usageSummary.totalOutputTokens / 1000).toFixed(1)}k</p>
                  </div>
                </div>
              )}
              {usageOpen && !usageSummary && (
                <div className="border-t border-border px-5 py-4 text-xs text-on-surface-tertiary">
                  {isRTL ? 'لا توجد بيانات استخدام' : 'No usage data available'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* MEETINGS TAB                                          */}
        {/* ══════════════════════════════════════════════════════ */}
        {tab === 'meetings' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatPillar icon={Calendar} value={meetings.length} label={isRTL ? 'إجمالي الاجتماعات' : 'Total Meetings'} color="accent" />
              <StatPillar icon={Star} value={lastActions.length} label={isRTL ? 'بنود عمل حالية' : 'Open Actions'} color="warning" />
              <StatPillar icon={Clock} value={nextMeeting ?? '—'} label={isRTL ? 'الاجتماع القادم' : 'Next Meeting'} color="info" />
            </div>

            <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-on-surface">
                  {isRTL ? 'سجل الاجتماعات' : 'Meeting Log'}
                </h3>
                <p className="text-xs text-on-surface-tertiary mt-0.5">
                  {isRTL ? 'مرتّبة حسب التاريخ — الأقدم أولاً' : 'Sorted by date — oldest first'}
                </p>
              </div>
              {sortedMeetings.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-on-surface-tertiary">
                  {isRTL ? 'لا اجتماعات مسجّلة بعد' : 'No meetings logged yet'}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {sortedMeetings.map((m, idx) => {
                    const meetNo = idx + 1;
                    return (
                      <div key={m.id} className="px-5 py-4 hover:bg-surface-tertiary transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            {/* Meeting number badge */}
                            <div className="h-8 w-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                              #{meetNo}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-on-surface">
                                {isRTL ? `اجتماع #${meetNo}` : `Meeting #${meetNo}`}
                                {m.record?.date && (
                                  <span className="text-xs text-on-surface-tertiary font-normal ms-2">— {m.record.date}</span>
                                )}
                              </p>
                              {m.record?.location && (
                                <p className="text-xs text-on-surface-tertiary mt-0.5">{m.record.location}</p>
                              )}
                              {m.record?.Summary && (
                                <div className="text-xs text-on-surface-secondary leading-relaxed mt-1 prose prose-xs dark:prose-invert max-w-none [&>p]:my-0.5 line-clamp-2">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.record.Summary}</ReactMarkdown>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {m.record?.Next_Meeting && (
                              <span className="text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                                {isRTL ? `التالي: ${m.record.Next_Meeting}` : `Next: ${m.record.Next_Meeting}`}
                              </span>
                            )}
                            <a
                              href={`/meetings?session=${m.id}`}
                              className="text-[11px] text-accent hover:underline"
                            >
                              {isRTL ? 'فتح التفاصيل' : 'Open details'}
                            </a>
                          </div>
                        </div>
                        {m.record?.action_plan_next && m.record.action_plan_next.length > 0 && (
                          <div className="mt-3 ms-11 ps-3 border-s-2 border-warning/40 space-y-1">
                            {m.record.action_plan_next.slice(0, 3).map((a, i) => (
                              <p key={i} className="text-xs text-on-surface-secondary flex items-start gap-1.5">
                                <ArrowRight className="h-3 w-3 text-warning shrink-0 mt-0.5" />
                                {a}
                              </p>
                            ))}
                            {m.record.action_plan_next.length > 3 && (
                              <p className="text-[10px] text-on-surface-tertiary">
                                +{m.record.action_plan_next.length - 3} {isRTL ? 'بنود إضافية' : 'more'}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* GRS2 TAB                                              */}
        {/* ══════════════════════════════════════════════════════ */}
        {tab === 'grs2' && (
          <div className="space-y-5 max-w-2xl">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-accent/10 text-accent flex items-center justify-center shrink-0">
                <ClipboardList size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-on-surface">
                  {isRTL ? 'تقارير GRS2 الشهرية' : 'Monthly GRS2 Reports'}
                </h2>
                <p className="text-xs text-on-surface-tertiary">
                  {isRTL ? 'تتبع تقديم تقرير التقدم الشهري — جامعة برمنغهام' : 'Track monthly progress report submission — University of Birmingham'}
                </p>
              </div>
            </div>

            {/* Overdue warning */}
            {grs2Reminder && (grs2Reminder.needsGrs2 || grs2Reminder.urgentFollowUp) && (
              <div className={cn(
                'rounded-xl border p-4 flex items-start gap-3',
                grs2Reminder.urgentFollowUp ? 'bg-error/10 border-error/20' : 'bg-warning/10 border-warning/20'
              )}>
                <AlertTriangle className={cn('h-5 w-5 shrink-0 mt-0.5', grs2Reminder.urgentFollowUp ? 'text-error' : 'text-warning')} />
                <div>
                  <p className={cn('text-sm font-semibold', grs2Reminder.urgentFollowUp ? 'text-error' : 'text-warning')}>
                    {isRTL
                      ? grs2Reminder.urgentFollowUp
                        ? `متابعة عاجلة — ${grs2Reminder.daysUntilMonthEnd} أيام متبقية`
                        : `تقرير شهر ${grs2Reminder.currentMonth} لم يُقدَّم بعد`
                      : grs2Reminder.urgentFollowUp
                        ? `Urgent follow-up — ${grs2Reminder.daysUntilMonthEnd} days remaining`
                        : `Report for ${grs2Reminder.currentMonth} not submitted yet`}
                  </p>
                  <p className="text-xs text-on-surface-secondary mt-0.5">
                    {isRTL ? 'يُوصى بإتمامه قبل نهاية الشهر' : 'Recommended to complete before month end'}
                  </p>
                </div>
              </div>
            )}

            {/* Current month card */}
            {grs2Current && (() => {
              const stageIdx = GRS2_STAGES.findIndex(s => s.key === grs2Current.status);
              return (
                <div className="rounded-xl border border-border bg-surface-secondary p-5 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-on-surface-tertiary uppercase tracking-wide">
                        {isRTL ? 'الشهر الحالي' : 'Current Month'}
                      </p>
                      <h3 className="text-xl font-semibold text-on-surface">{monthLabel(grs2Current.month)}</h3>
                    </div>
                    <span className={cn(
                      'text-sm font-semibold px-3 py-1 rounded-full border',
                      grs2Current.status === 'university_approved' ? 'text-success border-success/30 bg-success/10' :
                      grs2Current.status === 'supervisor_approved' || grs2Current.status === 'student_confirmed' ? 'text-info border-info/30 bg-info/10' :
                      grs2Current.status === 'submitted' ? 'text-warning border-warning/30 bg-warning/10' :
                      'text-on-surface-tertiary border-border bg-surface-tertiary'
                    )}>
                      {GRS2_STAGES.find(s => s.key === grs2Current.status)?.[isRTL ? 'ar' : 'en']}
                    </span>
                  </div>

                  {/* Progress bar + stage steps */}
                  <div className="space-y-3">
                    <ProgressBar
                      pct={grs2Current.progress}
                      color={grs2Current.progress === 100 ? 'var(--color-success)' : grs2Current.progress >= 75 ? 'var(--color-info)' : 'var(--color-warning)'}
                      height={10}
                    />
                    <div className="flex justify-between">
                      {GRS2_STAGES.map((s, i) => (
                        <div key={s.key} className={cn(
                          'flex flex-col items-center gap-1 text-xs',
                          i < stageIdx ? 'text-success' : i === stageIdx ? 'text-on-surface font-medium' : 'text-on-surface-tertiary opacity-50'
                        )}>
                          {i < stageIdx ? <CheckCircle2 className="h-4 w-4 text-success" /> : i === stageIdx ? <Circle className="h-4 w-4 text-accent" /> : <Circle className="h-4 w-4 opacity-30" />}
                          <span className="text-center leading-tight max-w-[60px]">{s.pct}%</span>
                          <span className="text-center leading-tight max-w-[80px]">{s[isRTL ? 'ar' : 'en']}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dates */}
                  {(grs2Current.submittedAt || grs2Current.supervisorApprovedAt || grs2Current.universityApprovedAt) && (
                    <div className="grid grid-cols-3 gap-2 text-xs text-on-surface-tertiary rounded-lg bg-surface border border-border p-3">
                      {grs2Current.submittedAt && <div><p className="font-medium text-on-surface">{isRTL ? 'التقديم' : 'Submitted'}</p><p>{new Date(grs2Current.submittedAt).toLocaleDateString('en-GB')}</p></div>}
                      {grs2Current.supervisorApprovedAt && <div><p className="font-medium text-on-surface">{isRTL ? 'المشرف' : 'Supervisor'}</p><p>{new Date(grs2Current.supervisorApprovedAt).toLocaleDateString('en-GB')}</p></div>}
                      {grs2Current.universityApprovedAt && <div><p className="font-medium text-on-surface">{isRTL ? 'الجامعة' : 'University'}</p><p>{new Date(grs2Current.universityApprovedAt).toLocaleDateString('en-GB')}</p></div>}
                    </div>
                  )}

                  {/* Content */}
                  <div>
                    <label className="text-xs font-semibold text-on-surface-tertiary block mb-1.5">
                      {isRTL ? 'محتوى تقرير GRS2' : 'GRS2 Report Content'}
                    </label>
                    <textarea
                      value={grs2ContentDraft}
                      onChange={e => setGrs2ContentDraft(e.target.value)}
                      rows={5}
                      dir="auto"
                      placeholder={isRTL ? 'اكتب ما أنجزته هذا الشهر…' : 'Describe your progress this month…'}
                      className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-on-surface-tertiary block mb-1.5">
                      {isRTL ? 'ملاحظات المشرف' : 'Supervisor Response'}
                    </label>
                    <textarea
                      value={grs2SupervisorDraft}
                      onChange={e => setGrs2SupervisorDraft(e.target.value)}
                      rows={3}
                      dir="auto"
                      placeholder={isRTL ? 'ملاحظات د. ريتشارد…' : "Dr Richard's comments…"}
                      className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={grs2SaveContent}
                      disabled={grs2Saving}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-tertiary disabled:opacity-50 transition-colors"
                    >
                      {grs2Saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {isRTL ? 'حفظ المحتوى' : 'Save Content'}
                    </button>
                  </div>

                  {/* Action buttons */}
                  <div className="border-t border-border pt-4 flex flex-wrap gap-2">
                    {grs2Current.status === 'not_started' && (
                      <button
                        onClick={() => grs2DoAction('submit', { content: grs2ContentDraft })}
                        disabled={grs2Saving || !grs2ContentDraft.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-warning text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        {grs2Saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {isRTL ? 'تقديم GRS2 ← 25%' : 'Submit GRS2 → 25%'}
                      </button>
                    )}
                    {grs2Current.status === 'submitted' && (
                      <button
                        onClick={() => grs2DoAction('supervisor-approve', { supervisorResponse: grs2SupervisorDraft })}
                        disabled={grs2Saving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-info text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        {grs2Saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {isRTL ? 'موافقة المشرف ← 75%' : 'Supervisor Approved → 75%'}
                      </button>
                    )}
                    {(grs2Current.status === 'supervisor_approved' || grs2Current.status === 'student_confirmed') && (
                      <button
                        onClick={() => grs2DoAction('university-approve')}
                        disabled={grs2Saving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-success text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        {grs2Saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {isRTL ? 'موافقة الجامعة ← 100%' : 'University Approved → 100%'}
                      </button>
                    )}
                    {grs2Current.status === 'university_approved' && (
                      <div className="inline-flex items-center gap-2 rounded-lg bg-success/10 px-4 py-2 text-sm text-success">
                        <CheckCircle2 className="h-4 w-4" />
                        {isRTL ? 'مكتمل ✓' : 'Completed ✓'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* History */}
            {grs2History.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-on-surface-tertiary uppercase tracking-wide">
                  {isRTL ? 'السجل السابق' : 'History'}
                </h3>
                {grs2History.map(rec => (
                  <div key={rec.id} className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-tertiary transition-colors"
                      onClick={() => setGrs2ExpandedMonth(grs2ExpandedMonth === rec.month ? null : rec.month)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-on-surface">{monthLabel(rec.month)}</span>
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          rec.status === 'university_approved' ? 'bg-success/10 text-success' :
                          rec.status === 'supervisor_approved' ? 'bg-info/10 text-info' :
                          rec.status === 'submitted' ? 'bg-warning/10 text-warning' :
                          'bg-surface-tertiary text-on-surface-tertiary'
                        )}>
                          {GRS2_STAGES.find(s => s.key === rec.status)?.[isRTL ? 'ar' : 'en']}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-20 h-1.5 rounded-full bg-surface-tertiary overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', rec.progress === 100 ? 'bg-success' : rec.progress >= 75 ? 'bg-info' : 'bg-warning')}
                            style={{ width: `${rec.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-on-surface-tertiary">{rec.progress}%</span>
                        {grs2ExpandedMonth === rec.month ? <ChevronUp className="h-4 w-4 text-on-surface-tertiary" /> : <ChevronDown className="h-4 w-4 text-on-surface-tertiary" />}
                      </div>
                    </button>
                    {grs2ExpandedMonth === rec.month && (
                      <div className="border-t border-border px-4 py-3 space-y-3 bg-surface">
                        {rec.content && (
                          <div>
                            <p className="text-xs font-semibold text-on-surface-tertiary mb-1">{isRTL ? 'المحتوى' : 'Content'}</p>
                            <p className="text-sm text-on-surface-secondary whitespace-pre-wrap">{rec.content}</p>
                          </div>
                        )}
                        {rec.supervisorResponse && (
                          <div>
                            <p className="text-xs font-semibold text-on-surface-tertiary mb-1">{isRTL ? 'ملاحظات المشرف' : 'Supervisor Response'}</p>
                            <p className="text-sm text-on-surface-secondary whitespace-pre-wrap">{rec.supervisorResponse}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* TASKS TAB                                             */}
        {/* ══════════════════════════════════════════════════════ */}
        {tab === 'tasks' && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <StatPillar icon={Layers} value={platformTasks.length} label={isRTL ? 'إجمالي' : 'Total'} color="accent" />
              <StatPillar icon={CheckSquare} value={doneTasks.length} label={isRTL ? 'مكتملة' : 'Done'} color="success" />
              <StatPillar icon={ChevronRight} value={pendingTasks.length} label={isRTL ? 'معلقة' : 'Pending'} color="warning" />
            </div>

            {/* Meeting tasks section */}
            {meetingTasks.length > 0 && (
              <div className="rounded-xl border border-accent/20 bg-surface-secondary overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-accent/5">
                  <h3 className="text-sm font-semibold text-accent">{isRTL ? 'مهام الاجتماعات' : 'From Meetings'}</h3>
                </div>
                <div className="divide-y divide-border">
                  {meetingTasks.map(t => (
                    <div key={t.id} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-tertiary transition-colors">
                      <button
                        onClick={() => toggleTask(t.id)}
                        disabled={togglingTask === t.id}
                        className={cn(
                          'h-5 w-5 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors disabled:opacity-50',
                          t.completed ? 'border-success bg-success text-white' : 'border-border hover:border-success'
                        )}
                      >
                        {t.completed && '✓'}
                        {togglingTask === t.id && <Loader2 className="h-3 w-3 animate-spin" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm leading-snug', t.completed ? 'line-through text-on-surface-tertiary' : 'text-on-surface-secondary')}>{t.title}</p>
                        <p className="text-[10px] text-accent mt-0.5">{t.list}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* General tasks */}
            <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-on-surface">
                  {isRTL ? 'المهام العامة' : 'General PhD Tasks'}
                </h3>
                <div className="flex items-center gap-1 text-xs">
                  {(['pending', 'done', 'all'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setTaskFilter(f)}
                      className={cn(
                        'px-3 py-1 rounded-full transition-colors',
                        taskFilter === f ? 'bg-accent text-on-accent' : 'text-on-surface-tertiary hover:bg-surface-tertiary'
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
                  visibleTasks
                    .filter(t => !meetingTasks.some(m => m.id === t.id))
                    .map(t => (
                      <div key={t.id} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-tertiary transition-colors">
                        <button
                          onClick={() => toggleTask(t.id)}
                          disabled={togglingTask === t.id}
                          className={cn(
                            'h-4 w-4 rounded border shrink-0 mt-0.5 flex items-center justify-center text-[10px] transition-colors disabled:opacity-50',
                            t.completed ? 'bg-success border-success text-white' : 'border-border hover:border-success'
                          )}
                        >
                          {t.completed && '✓'}
                          {togglingTask === t.id && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm leading-snug', t.completed ? 'line-through text-on-surface-tertiary' : 'text-on-surface-secondary')}>{t.title}</p>
                          {t.list && t.list !== 'عام' && (
                            <p className="text-[10px] text-on-surface-tertiary mt-0.5">{t.list}</p>
                          )}
                        </div>
                        {t.dueDate && (
                          <span className="text-[10px] text-on-surface-tertiary shrink-0">
                            {new Date(t.dueDate).toLocaleDateString('en-GB')}
                          </span>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* LIBRARY STATS TAB                                     */}
        {/* ══════════════════════════════════════════════════════ */}
        {tab === 'library-stats' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatPillar icon={BookOpen} value={litTotal} label={isRTL ? 'إجمالي المصادر' : 'Total Sources'} color="info" />
              <StatPillar icon={CheckSquare} value={readCount} label={isRTL ? 'مقروءة' : 'Read'} color="success" />
              <StatPillar icon={TrendingUp} value={`${Math.round(readPct)}%`} label={isRTL ? 'نسبة القراءة' : 'Read Rate'} color="warning" />
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="rounded-xl border border-border bg-surface-secondary p-5">
                <h3 className="text-sm font-semibold text-on-surface mb-4">{isRTL ? 'حالة القراءة' : 'Reading Status'}</h3>
                <div className="space-y-3">
                  {Object.entries(statusCounts).sort(([,a],[,b]) => b - a).map(([s, c]) => {
                    const p = (c / (litTotal || 1)) * 100;
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
                <h3 className="text-sm font-semibold text-on-surface mb-4">{isRTL ? 'أنواع المصادر' : 'Source Types'}</h3>
                <div className="space-y-2">
                  {Object.entries(typeCounts).sort(([,a],[,b]) => b - a).map(([t, c]) => {
                    const p = (c / (litTotal || 1)) * 100;
                    return (
                      <div key={t} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate text-on-surface-secondary">{t}</span>
                        <span className="text-on-surface-tertiary font-mono w-8 text-end">{c}</span>
                        <div className="w-16"><ProgressBar pct={p} color="var(--color-accent)" height={4} /></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Year distribution */}
            <div className="rounded-xl border border-border bg-surface-secondary p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-on-surface text-sm">{isRTL ? 'توزيع المصادر بالسنوات' : 'Sources by Year'}</h3>
                  <p className="text-[11px] text-on-surface-tertiary mt-0.5">{yearCounts.length} {isRTL ? 'سنوات نشر' : 'publication years'}</p>
                </div>
                <BarChart3 className="h-4 w-4 text-info" />
              </div>
              {yearCounts.length === 0 ? (
                <p className="text-xs text-on-surface-tertiary py-6 text-center">{isRTL ? 'لا يوجد بيانات' : 'No data'}</p>
              ) : (
                <div className="flex items-end gap-1 h-24">
                  {yearCounts.slice(-15).map(({ year, n }) => (
                    <div key={year} className="flex-1 flex flex-col items-center gap-1 group">
                      <span className="text-[9px] font-mono text-on-surface-tertiary opacity-0 group-hover:opacity-100 transition-opacity">{n}</span>
                      <div className="w-full bg-info/40 hover:bg-info rounded-t transition-colors min-h-[2px]" style={{ height: `${(n / maxYearCount) * 100}%` }} />
                      <span className="text-[8px] text-on-surface-tertiary">{String(year).slice(-2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent papers table */}
            <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-on-surface">{isRTL ? 'أحدث المصادر' : 'Recent Sources'}</h3>
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
                    {litNotes.slice(0, 15).map(n => (
                      <tr key={n.path} className="hover:bg-surface-tertiary transition-colors">
                        <td className="px-5 py-2 max-w-xs truncate font-medium text-on-surface">{n.name}</td>
                        <td className="px-3 py-2 text-on-surface-tertiary truncate max-w-[140px]">{n.authors?.split(',')[0]?.trim() ?? '—'}</td>
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
              {litNotes.length > 15 && (
                <p className="text-xs text-on-surface-tertiary px-5 py-3 text-center border-t border-border">
                  +{litNotes.length - 15} {isRTL ? 'مصادر إضافية' : 'more sources'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* ══════════════════════════════════════════════════════ */}
        {/* ══════════════════════════════════════════════════════ */}
        {/* SUPERVISION TAB                                      */}
        {/* ══════════════════════════════════════════════════════ */}
        {tab === 'supervision' && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-surface-secondary p-5">
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="h-5 w-5 text-accent" />
                <h2 className="text-base font-bold text-on-surface">
                  {isRTL ? 'نظرة الإشراف' : 'Supervision Overview'}
                </h2>
              </div>
              <p className="text-sm text-on-surface-secondary mb-4">
                {isRTL
                  ? 'جامعة برمنغهام — دكتوراه BIM في الكويت — المشرف د. ريتشارد'
                  : 'University of Birmingham — BIM in Kuwait PhD — Supervisor: Dr Richard'}
              </p>
              {/* Next meeting countdown */}
              {nextMeetingDays !== null && (
                <div className={cn(
                  'rounded-lg border p-3 flex items-center gap-3 mb-4',
                  nextMeetingDays <= 3 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-surface border-border'
                )}>
                  <Clock className={cn('h-5 w-5', nextMeetingDays <= 3 ? 'text-blue-500' : 'text-on-surface-tertiary')} />
                  <div>
                    <p className="text-sm font-semibold text-on-surface">
                      {isRTL ? 'الاجتماع القادم' : 'Next Meeting'}:
                      {' '}{nextMeetingDays <= 0 ? (isRTL ? 'اليوم!' : 'Today!') : nextMeetingDays === 1 ? (isRTL ? 'غداً' : 'Tomorrow') : `${nextMeetingDays} ${isRTL ? 'أيام' : 'days'}`}
                    </p>
                    {nextMeeting && <p className="text-xs text-on-surface-tertiary">{nextMeeting}</p>}
                  </div>
                </div>
              )}
              {/* Scope points */}
              {scopePoints.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider mb-3">
                    {isRTL ? `نقاط النطاق (${scopePoints.length})` : `Scope Points (${scopePoints.length})`}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {scopePoints.sort((a,b) => a.number - b.number).map(sp => {
                      const statusColor =
                        sp.status === 'completed' ? 'text-success bg-success/10' :
                        sp.status === 'paused' ? 'text-warning bg-warning/10' :
                        sp.status === 'dropped' ? 'text-error/50 bg-error/5' :
                        'text-info bg-info/10';
                      return (
                        <div key={sp.id} className="rounded-lg border border-border bg-surface p-3 flex items-start gap-2">
                          <span className="text-[11px] font-mono text-on-surface-tertiary shrink-0 mt-0.5">S{sp.number}</span>
                          <p className="text-xs text-on-surface-secondary flex-1 leading-snug">{sp.title}</p>
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0', statusColor)}>
                            {sp.status === 'completed' ? (isRTL ? 'مكتمل' : 'Done') :
                             sp.status === 'paused' ? (isRTL ? 'موقوف' : 'Paused') :
                             sp.status === 'dropped' ? (isRTL ? 'ملغى' : 'Dropped') :
                             (isRTL ? 'نشط' : 'Active')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-border">
                <a href="/meetings" className="text-sm text-accent hover:underline">
                  → {isRTL ? 'عرض كل الاجتماعات' : 'View all meetings'}
                </a>
              </div>
            </div>
          </div>
        )}

        {/* CALENDAR TAB                                         */}
        {/* ══════════════════════════════════════════════════════ */}
        {tab === 'calendar' && (() => {
          // Lightweight calendar — no library, pure CSS grid
          const today = new Date();
          const [calYear, setCalYear] = useState(today.getFullYear());
          const [calMonth, setCalMonth] = useState(today.getMonth()); // 0-indexed
          const [calView, setCalView] = useState<'month' | 'week'>('month');

          const firstDay = new Date(calYear, calMonth, 1);
          const lastDay = new Date(calYear, calMonth + 1, 0);
          const startDow = firstDay.getDay(); // 0=Sun
          const daysInMonth = lastDay.getDate();

          const monthLabel = firstDay.toLocaleDateString(isRTL ? 'ar-SA' : 'en-GB', { month: 'long', year: 'numeric' });
          const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const DAY_NAMES_AR = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمس', 'جمع', 'سبت'];
          const dayNames = isRTL ? DAY_NAMES_AR : DAY_NAMES_EN;

          // Build event map: date string → events[]
          type CalEvent = { label: string; color: string; kind: string };
          const eventMap: Record<string, CalEvent[]> = {};

          const addEvent = (dateStr: string | null | undefined, label: string, color: string, kind: string) => {
            if (!dateStr) return;
            const normalized = dateStr.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1').slice(0, 10);
            if (!normalized.match(/^\d{4}-\d{2}-\d{2}$/)) return;
            if (!eventMap[normalized]) eventMap[normalized] = [];
            eventMap[normalized].push({ label, color, kind });
          };

          // Meeting dates
          sortedMeetings.forEach((m, idx) => {
            addEvent(m.record?.date, `Meeting #${idx + 1}`, 'bg-info/80 text-white', 'meeting');
          });
          // Next meeting
          if (nextMeeting) addEvent(nextMeeting, isRTL ? 'اجتماع قادم' : 'Upcoming meeting', 'bg-blue-600 text-white', 'meeting');
          // Task due dates
          platformTasks.filter(t => t.dueDate && !t.completed).forEach(t => {
            addEvent(t.dueDate, t.title.slice(0, 25), 'bg-warning/80 text-white', 'task');
          });
          // GRS2 month-end
          if (grs2Current && grs2Current.status !== 'university_approved') {
            const [gy, gm] = grs2Current.month.split('-');
            const lastDayOfGrs2 = new Date(Number(gy), Number(gm), 0);
            addEvent(lastDayOfGrs2.toISOString().slice(0, 10), 'GRS2 Deadline', 'bg-accent/80 text-white', 'grs2');
          }

          // Build cells array (padded with null for empty days)
          const cells: (number | null)[] = Array(startDow).fill(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(d);
          while (cells.length % 7 !== 0) cells.push(null);

          const todayStr = today.toISOString().slice(0, 10);

          return (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => {
                    const d = new Date(calYear, calMonth - 1, 1);
                    setCalYear(d.getFullYear()); setCalMonth(d.getMonth());
                  }} className="p-1.5 rounded-lg hover:bg-surface-secondary border border-border">
                    <ChevronLeft className={cn('h-4 w-4', isRTL && 'rotate-180')} />
                  </button>
                  <h3 className="text-base font-bold text-on-surface px-2">{monthLabel}</h3>
                  <button onClick={() => {
                    const d = new Date(calYear, calMonth + 1, 1);
                    setCalYear(d.getFullYear()); setCalMonth(d.getMonth());
                  }} className="p-1.5 rounded-lg hover:bg-surface-secondary border border-border">
                    <ChevronRight className={cn('h-4 w-4', isRTL && 'rotate-180')} />
                  </button>
                  <button onClick={() => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth()); }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-surface-secondary ms-2">
                    {isRTL ? 'اليوم' : 'Today'}
                  </button>
                </div>
                <div className="flex gap-1">
                  {(['month', 'week'] as const).map(v => (
                    <button key={v} onClick={() => setCalView(v)}
                      className={cn('px-3 py-1.5 text-xs rounded-lg border transition-colors',
                        calView === v ? 'bg-accent text-on-accent border-accent' : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
                      )}>
                      {v === 'month' ? (isRTL ? 'شهر' : 'Month') : (isRTL ? 'أسبوع' : 'Week')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="flex gap-3 flex-wrap text-xs">
                {[
                  { color: 'bg-info/80', label: isRTL ? 'اجتماع' : 'Meeting' },
                  { color: 'bg-warning/80', label: isRTL ? 'مهمة' : 'Task due' },
                  { color: 'bg-accent/80', label: 'GRS2' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className={cn('h-2.5 w-2.5 rounded-sm', l.color)} />
                    <span className="text-on-surface-tertiary">{l.label}</span>
                  </div>
                ))}
              </div>

              {/* Month grid */}
              {calView === 'month' && (
                <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
                  {/* Day name header */}
                  <div className="grid grid-cols-7 border-b border-border">
                    {dayNames.map(d => (
                      <div key={d} className="py-2 text-center text-[11px] font-semibold text-on-surface-tertiary uppercase tracking-wider">
                        {d}
                      </div>
                    ))}
                  </div>
                  {/* Day cells */}
                  <div className="grid grid-cols-7">
                    {cells.map((day, i) => {
                      if (day === null) return <div key={i} className="min-h-[80px] border-r border-b border-border bg-surface-tertiary/30 last:border-r-0" />;
                      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const isToday = dateStr === todayStr;
                      const events = eventMap[dateStr] ?? [];
                      return (
                        <div key={i} className={cn(
                          'min-h-[80px] border-r border-b border-border p-1.5 last:border-r-0 relative',
                          isToday && 'bg-accent/5'
                        )}>
                          <span className={cn(
                            'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                            isToday ? 'bg-accent text-on-accent' : 'text-on-surface-secondary'
                          )}>
                            {day}
                          </span>
                          <div className="mt-1 space-y-0.5">
                            {events.slice(0, 3).map((ev, ei) => (
                              <div key={ei} className={cn('text-[10px] px-1.5 py-0.5 rounded truncate leading-tight', ev.color)}>
                                {ev.label}
                              </div>
                            ))}
                            {events.length > 3 && (
                              <p className="text-[9px] text-on-surface-tertiary ps-1">+{events.length - 3}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Week view */}
              {calView === 'week' && (() => {
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - today.getDay());
                const weekDays = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(startOfWeek);
                  d.setDate(startOfWeek.getDate() + i);
                  return d;
                });
                return (
                  <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
                    <div className="grid grid-cols-7 border-b border-border">
                      {weekDays.map((d, i) => {
                        const ds = d.toISOString().slice(0, 10);
                        const isToday = ds === todayStr;
                        return (
                          <div key={i} className={cn('py-3 text-center border-r border-border last:border-r-0', isToday && 'bg-accent/5')}>
                            <p className="text-[10px] text-on-surface-tertiary uppercase">{dayNames[d.getDay()]}</p>
                            <p className={cn('text-sm font-bold mt-0.5', isToday ? 'text-accent' : 'text-on-surface')}>{d.getDate()}</p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-7 min-h-[200px]">
                      {weekDays.map((d, i) => {
                        const ds = d.toISOString().slice(0, 10);
                        const events = eventMap[ds] ?? [];
                        return (
                          <div key={i} className="border-r border-border last:border-r-0 p-2 space-y-1">
                            {events.map((ev, ei) => (
                              <div key={ei} className={cn('text-[10px] px-1.5 py-0.5 rounded truncate', ev.color)}>
                                {ev.label}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* INSIGHTS TAB                                          */}
        {/* ══════════════════════════════════════════════════════ */}
        {tab === 'insights' && (() => {
          const CAT_INFO: Record<InsightCategory, { ar: string; en: string; color: string; bg: string; icon: React.ElementType }> = {
            insight:  { ar: 'رؤى', en: 'Insights',   color: 'text-info',    bg: 'bg-info/10',    icon: Brain },
            idea:     { ar: 'أفكار', en: 'Ideas',    color: 'text-warning', bg: 'bg-warning/10', icon: Lightbulb },
            decision: { ar: 'قرارات', en: 'Decisions',color: 'text-accent',  bg: 'bg-accent/10',  icon: Target },
            concern:  { ar: 'مخاوف', en: 'Concerns', color: 'text-error',   bg: 'bg-error/10',   icon: AlertTriangle },
            goal:     { ar: 'أهداف', en: 'Goals',    color: 'text-success', bg: 'bg-success/10', icon: GraduationCap },
            progress: { ar: 'تقدم', en: 'Progress',  color: 'text-success', bg: 'bg-success/10', icon: TrendingUp },
            note:     { ar: 'ملاحظات', en: 'Notes',  color: 'text-on-surface-secondary', bg: 'bg-surface-tertiary', icon: BookOpen },
          };
          const grouped: Partial<Record<InsightCategory, MemoryEntry[]>> = {};
          for (const e of insights) (grouped[e.category] ??= []).push(e);
          const order: InsightCategory[] = ['decision', 'insight', 'idea', 'goal', 'progress', 'concern', 'note'];

          return (
            <div className="space-y-5">
              {/* Header */}
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
                      ? 'كل ما حفظه الخوي من نقاشاتك: قرارات منهجية، رؤى، أفكار، مخاوف، أهداف، تقدّم.'
                      : "Everything Al-Khuwy saved: methodology decisions, insights, ideas, concerns, goals, progress."}
                  </p>
                </div>
                <button
                  onClick={() => setKhuwyOpen(true)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-success/15 text-success hover:bg-success/25 flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {isRTL ? 'تحدّث مع الخوي' : 'Talk to Al-Khuwy'}
                </button>
              </div>

              {insights.length === 0 ? (
                <div className="rounded-xl border border-border bg-surface-secondary p-12 text-center">
                  <Brain className="h-10 w-10 text-on-surface-tertiary mx-auto mb-3 opacity-40" />
                  <p className="text-sm text-on-surface-tertiary max-w-md mx-auto">
                    {isRTL
                      ? 'لا توجد رؤى بعد. تحدّث مع الخوي عن أفكارك وقراراتك.'
                      : 'No insights yet. Talk to Al-Khuwy about your ideas and decisions.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                    {order.map(cat => {
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

                  {order.filter(cat => (grouped[cat]?.length ?? 0) > 0).map(cat => {
                    const cfg = CAT_INFO[cat];
                    const Icon = cfg.icon;
                    const entries = grouped[cat] ?? [];
                    return (
                      <div key={cat} className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
                        <div className={cn('px-4 py-2.5 border-b border-border flex items-center gap-2', cfg.bg)}>
                          <Icon className={cn('h-4 w-4', cfg.color)} />
                          <h3 className={cn('text-sm font-semibold', cfg.color)}>{cfg[language]} ({entries.length})</h3>
                        </div>
                        <div className="divide-y divide-border">
                          {entries
                            .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
                            .map(e => (
                              <div key={e.id} className="px-4 py-3 hover:bg-surface-tertiary transition-colors">
                                <p className="text-sm text-on-surface-secondary leading-snug">{e.content}</p>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  <span className="text-[10px] text-on-surface-tertiary">{e.date}</span>
                                  {(e.tags ?? []).map(t => (
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
