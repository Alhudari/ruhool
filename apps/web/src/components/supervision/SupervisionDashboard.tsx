'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Loader2, Users, Calendar, MapPin, FileText, Target, Award,
  ChevronRight, RefreshCw, Pencil, Layers, X,
  ArrowRight, CheckCircle2, Clock, BookOpen, Microscope, Library,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface GRS2Info {
  input?: string;
  respond?: string;
  confirmed?: boolean;
  stage?: string;
}

interface MeetingSummary {
  path: string;
  name: string;
  title?: string;
  date?: string;
  attendees?: string;
  location?: string;
  summary?: string;
  actionsSection?: string | null;
  taskCount: number;
  openTaskCount: number;
  grs2?: GRS2Info;
}

interface MilestoneSummary {
  path: string;
  name: string;
  title?: string;
  date?: string;
  status?: string;
  preview: string;
}

// Format any date-like value into a readable string. Obsidian dates can be
// strings, Date objects, or weird YAML date types — handle them all.
function formatDate(d: unknown): string {
  if (!d) return '—';
  if (typeof d === 'string') {
    // Already a string — try to reformat if it looks like an ISO date
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return d;
  }
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  // YAML date object
  try {
    const s = String(d);
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return s;
  } catch { return '—'; }
}

// Encode a vault path for URL: encode each segment, keep slashes
function encodeVaultPath(p: string): string {
  return p.split('/').map((seg) => encodeURIComponent(seg)).join('/');
}

interface VaultFileSummary {
  path: string;
  name: string;
  title?: string;
  category?: string;
  status?: string;
  preview: string;
}

interface SupervisionData {
  dashboard: { body: string; sections: { heading: string; level: number; content: string }[] } | null;
  meetings: MeetingSummary[];
  milestones: MilestoneSummary[];
  detailedWork: VaultFileSummary[];
  scopePoints: VaultFileSummary[];
  materials: VaultFileSummary[];
}

interface FullSupervisionDoc {
  path: string;
  name: string;
  title?: string;
  body: string;
  sections: { heading: string; level: number; content: string }[];
  frontmatter: Record<string, unknown>;
  tasks: { text: string; done: boolean; line: number }[];
}

const VAULT_NAME = 'PhD';

const PROSE_CLASSES =
  'text-sm text-on-surface leading-relaxed break-words prose prose-sm max-w-none ' +
  'prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 ' +
  'prose-pre:my-2 prose-code:text-accent prose-code:bg-surface-tertiary prose-code:px-1 ' +
  'prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-surface-tertiary ' +
  'prose-pre:rounded-lg prose-pre:p-3 prose-strong:text-on-surface prose-headings:text-on-surface ' +
  'prose-blockquote:border-accent prose-blockquote:text-on-surface-secondary';

// ── Read modal for meetings/milestones ────────────────────────────────
function DocModal({
  path, onClose, isRTL,
}: { path: string; onClose: () => void; isRTL: boolean }) {
  const [doc, setDoc] = useState<FullSupervisionDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<FullSupervisionDoc>(`/api/vault/supervision/file?path=${encodeURIComponent(path)}`)
      .then(setDoc)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const openInObsidian = () => {
    const url = `obsidian://open?vault=${VAULT_NAME}&file=${encodeURIComponent(path.replace(/\.md$/, ''))}`;
    window.open(url, '_blank');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeInUp_0.2s_ease-out]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-accent shrink-0" />
            <h2 className="text-base font-semibold text-on-surface truncate">{doc?.name ?? path.split('/').pop()}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openInObsidian}
              title={isRTL ? 'تعديل في Obsidian' : 'Edit in Obsidian'}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
            >
              <Pencil className="h-3 w-3" />
              {isRTL ? 'تعديل' : 'Edit'}
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-secondary text-on-surface-tertiary">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-on-surface-tertiary" />
            </div>
          ) : !doc ? (
            <p className="text-sm text-on-surface-tertiary text-center py-10">
              {isRTL ? 'تعذّر تحميل المستند' : 'Could not load document'}
            </p>
          ) : (
            <div dir={/[\u0600-\u06FF]/.test(doc.body) ? 'rtl' : 'ltr'}>
              {/* Frontmatter pills */}
              {Object.keys(doc.frontmatter).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-border">
                  {Object.entries(doc.frontmatter)
                    .filter(([, v]) => v != null && v !== '' && (typeof v !== 'object' || (Array.isArray(v) && v.length > 0)))
                    .slice(0, 8)
                    .map(([k, v]) => (
                      <div key={k} className="text-[11px] px-2.5 py-1 rounded-full bg-surface-secondary border border-border">
                        <span className="text-on-surface-tertiary">{k}:</span>{' '}
                        <span className="text-on-surface-secondary">
                          {typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : String(v)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
              <div className={PROSE_CLASSES}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.body}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────
type Tab = 'overview' | 'meetings' | 'milestones' | 'detailed-work' | 'scope-points' | 'materials' | 'dashboard';
const TABS: { id: Tab; icon: React.ElementType; label: { en: string; ar: string } }[] = [
  { id: 'overview',      icon: Layers,     label: { en: 'Overview',         ar: 'نظرة عامة' } },
  { id: 'meetings',      icon: Users,      label: { en: 'Meetings',         ar: 'الاجتماعات' } },
  { id: 'milestones',    icon: Award,      label: { en: 'Milestones',       ar: 'المحطات المهمة' } },
  { id: 'detailed-work', icon: Microscope, label: { en: 'Detailed Work',    ar: 'العمل التفصيلي' } },
  { id: 'scope-points',  icon: BookOpen,   label: { en: 'Scope Points',     ar: 'نقاط النطاق' } },
  { id: 'materials',     icon: Library,    label: { en: 'Materials',        ar: 'المواد' } },
  { id: 'dashboard',     icon: FileText,   label: { en: 'Visual Dashboard', ar: 'اللوحة البصرية' } },
];

// ──────────────────────────────────────────────────────────────────────
export function SupervisionDashboard() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [data, setData] = useState<SupervisionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  const load = () => {
    setLoading(true); setError(null);
    apiFetch<SupervisionData>('/api/vault/supervision')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const totalOpenActions = useMemo(() =>
    data?.meetings.reduce((sum, m) => sum + m.openTaskCount, 0) ?? 0,
    [data]
  );

  const lastMeeting = data?.meetings[0];

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-surface">
      <Loader2 className="h-8 w-8 animate-spin text-on-surface-tertiary" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* Hero */}
      <div className="border-b border-border bg-gradient-to-br from-accent/10 via-info/5 to-surface px-6 md:px-10 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-5 w-5 text-accent" />
                <h1 className="text-xl md:text-2xl font-bold text-on-surface">
                  {isRTL ? 'لوحة الإشراف' : 'Supervision Dashboard'}
                </h1>
              </div>
              <p className="text-sm text-on-surface-tertiary">
                {isRTL
                  ? 'كل ما يخص الاجتماعات مع المشرف، المعالم، وخطط العمل'
                  : 'All supervisor meetings, milestones, and action plans'}
              </p>
            </div>
            <button
              onClick={load}
              className="flex items-center gap-1.5 text-xs text-on-surface-tertiary hover:text-on-surface px-3 py-1.5 rounded-lg border border-border hover:border-border-hover bg-surface-secondary"
            >
              <RefreshCw className="h-3 w-3" />
              {isRTL ? 'تحديث' : 'Refresh'}
            </button>
          </div>

          {/* Stat pills */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatPillar icon={Calendar}   value={data?.meetings.length ?? 0}       label={isRTL ? 'اجتماعات' : 'Meetings'}         color="accent" />
            <StatPillar icon={Award}      value={data?.milestones.length ?? 0}     label={isRTL ? 'محطات مهمة' : 'Milestones'}      color="info" />
            <StatPillar icon={Target}     value={totalOpenActions}                 label={isRTL ? 'بنود عمل مفتوحة' : 'Open Actions'} color="warning" />
            <StatPillar icon={BookOpen}   value={(data?.scopePoints.length ?? 0)}  label={isRTL ? 'نقاط نطاق' : 'Scope Points'}    color="success" />
          </div>
        </div>
      </div>

      {/* Tabs */}
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

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8">
        {error && (
          <div className="mb-6 rounded-lg border border-warning bg-warning/10 px-4 py-3 text-sm text-warning">
            {isRTL ? 'تعذّر تحميل البيانات' : 'Could not load supervision data'} — {error}
          </div>
        )}

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Last meeting */}
            <div className="lg:col-span-2 rounded-xl border border-border bg-surface-secondary p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold text-on-surface">{isRTL ? 'آخر اجتماع' : 'Last Meeting'}</h3>
              </div>
              {!lastMeeting ? (
                <p className="text-sm text-on-surface-tertiary py-6 text-center">
                  {isRTL ? 'لا اجتماعات مسجّلة بعد' : 'No meetings logged yet'}
                </p>
              ) : (
                <button
                  onClick={() => setOpenDoc(lastMeeting.path)}
                  className="w-full text-start space-y-3 group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-bold text-on-surface group-hover:text-accent transition-colors">
                        {lastMeeting.title || lastMeeting.name}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-on-surface-tertiary mt-1">
                        {lastMeeting.date && (
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(lastMeeting.date)}</span>
                        )}
                        {lastMeeting.location && (
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{lastMeeting.location}</span>
                        )}
                        {lastMeeting.attendees && (
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{lastMeeting.attendees}</span>
                        )}
                      </div>
                    </div>
                    {lastMeeting.openTaskCount > 0 && (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-warning/15 text-warning shrink-0">
                        {lastMeeting.openTaskCount} {isRTL ? 'مهام مفتوحة' : 'open'}
                      </span>
                    )}
                  </div>
                  {lastMeeting.summary && (
                    <p className="text-sm text-on-surface-secondary leading-relaxed">{lastMeeting.summary}</p>
                  )}
                  {lastMeeting.actionsSection && (
                    <div className="mt-3 ps-3 border-s-2 border-warning/40">
                      <p className="text-[11px] uppercase tracking-wider text-on-surface-tertiary mb-1">
                        {isRTL ? 'بنود العمل' : 'Action items'}
                      </p>
                      <div className={cn(PROSE_CLASSES, 'text-xs')}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {lastMeeting.actionsSection}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </button>
              )}
            </div>

            {/* Recent meetings */}
            <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-on-surface">
                  {isRTL ? 'سجل سريع' : 'Recent Log'}
                </h3>
              </div>
              {data?.meetings.length === 0 ? (
                <p className="text-xs text-on-surface-tertiary p-5 text-center">
                  {isRTL ? 'فارغ' : 'Empty'}
                </p>
              ) : (
                <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                  {data?.meetings.slice(0, 8).map((m) => (
                    <button
                      key={m.path}
                      onClick={() => setOpenDoc(m.path)}
                      className="w-full text-start px-4 py-3 hover:bg-surface-tertiary transition-colors"
                    >
                      <p className="text-sm font-medium text-on-surface">{m.title || m.name}</p>
                      <p className="text-[11px] text-on-surface-tertiary mt-0.5">
                        {formatDate(m.date)} {m.openTaskCount > 0 && `· ${m.openTaskCount} open`}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Milestones */}
            <div className="lg:col-span-3 rounded-xl border border-border bg-surface-secondary p-6">
              <div className="flex items-center gap-2 mb-4">
                <Award className="h-4 w-4 text-info" />
                <h3 className="text-sm font-semibold text-on-surface">{isRTL ? 'المحطات المهمة' : 'Key Stations'}</h3>
              </div>
              {data?.milestones.length === 0 ? (
                <p className="text-sm text-on-surface-tertiary py-6 text-center">
                  {isRTL ? 'لا توجد معالم مسجّلة' : 'No milestones logged'}
                </p>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data?.milestones.map((m) => (
                    <button
                      key={m.path}
                      onClick={() => setOpenDoc(m.path)}
                      className="text-start rounded-lg border border-border bg-surface p-4 hover:border-accent hover:bg-surface-tertiary transition-all"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="text-sm font-semibold text-on-surface">{m.title || m.name}</h4>
                        {m.status && (
                          <span className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full shrink-0',
                            m.status.toLowerCase().includes('done') || m.status.toLowerCase().includes('complete')
                              ? 'bg-success/15 text-success'
                              : 'bg-warning/15 text-warning'
                          )}>
                            {m.status}
                          </span>
                        )}
                      </div>
                      {m.date && (
                        <p className="text-[11px] text-on-surface-tertiary mb-2">{formatDate(m.date)}</p>
                      )}
                      {m.preview && (
                        <p className="text-xs text-on-surface-secondary line-clamp-2">{m.preview}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MEETINGS */}
        {tab === 'meetings' && (
          <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-on-surface">
                {isRTL ? 'كل الاجتماعات' : 'All Meetings'}
              </h3>
              <span className="text-xs text-on-surface-tertiary">
                {data?.meetings.length} {isRTL ? 'إجمالاً' : 'total'}
              </span>
            </div>
            <div className="divide-y divide-border">
              {data?.meetings.map((m) => (
                <button
                  key={m.path}
                  onClick={() => setOpenDoc(m.path)}
                  className="w-full text-start px-5 py-4 hover:bg-surface-tertiary transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-on-surface group-hover:text-accent transition-colors">
                        {m.title || m.name}
                      </h4>
                      <div className="flex items-center gap-3 text-[11px] text-on-surface-tertiary mt-1 flex-wrap">
                        {m.date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(m.date)}</span>}
                        {m.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{m.location}</span>}
                        {m.attendees && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{m.attendees}</span>}
                      </div>
                      {m.summary && (
                        <p className="text-xs text-on-surface-secondary mt-2 line-clamp-2">{m.summary}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.openTaskCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning">
                          {m.openTaskCount}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-on-surface-tertiary" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MILESTONES — timeline view */}
        {tab === 'milestones' && (
          <div className="space-y-5">
            {/* Timeline strip */}
            <div className="rounded-xl border border-border bg-surface-secondary p-6 overflow-x-auto">
              <h3 className="text-sm font-semibold text-on-surface mb-6 flex items-center gap-2">
                <Award className="h-4 w-4 text-info" />
                {isRTL ? 'خط الزمن للمحطات' : 'Milestone Timeline'}
              </h3>
              <div className="relative" dir="ltr">
                {/* Horizontal connector line */}
                <div className="absolute top-5 left-8 right-8 h-0.5 bg-gradient-to-r from-info/30 via-info/60 to-info/30" />
                <div className="flex justify-between gap-2 min-w-[600px]">
                  {data?.milestones.map((m, idx) => {
                    const isDone = !!(m.status?.toLowerCase().match(/done|complete|pass/));
                    const isInProgress = !!(m.status?.toLowerCase().match(/in.progress|upcoming|pending/));
                    return (
                      <button
                        key={m.path}
                        onClick={() => setOpenDoc(m.path)}
                        className="flex-1 flex flex-col items-center gap-2 group"
                        style={{ animationDelay: `${idx * 70}ms` }}
                      >
                        <div className={cn(
                          'h-10 w-10 rounded-full border-2 flex items-center justify-center transition-all duration-300 group-hover:scale-110 z-10',
                          isDone
                            ? 'bg-success border-success text-white shadow-md shadow-success/30'
                            : isInProgress
                            ? 'bg-warning/20 border-warning text-warning animate-pulse'
                            : 'bg-surface border-border text-on-surface-tertiary group-hover:border-info'
                        )}>
                          {isDone
                            ? <CheckCircle2 className="h-5 w-5" />
                            : <span className="text-xs font-bold">{idx}</span>
                          }
                        </div>
                        <div className="text-center max-w-[90px]">
                          <p className="text-[11px] font-semibold text-on-surface group-hover:text-accent transition-colors line-clamp-2">
                            {m.name.replace(/^MS\d+\s*[-–]\s*/i, '')}
                          </p>
                          {m.date && (
                            <p className="text-[10px] text-on-surface-tertiary mt-0.5">{formatDate(m.date)}</p>
                          )}
                          {m.status && (
                            <span className={cn(
                              'inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded-full',
                              isDone ? 'bg-success/15 text-success'
                                : isInProgress ? 'bg-warning/15 text-warning'
                                : 'bg-surface-tertiary text-on-surface-tertiary'
                            )}>
                              {m.status}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {/* Card grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data?.milestones.map((m) => {
                const isDone = !!(m.status?.toLowerCase().match(/done|complete|pass/));
                return (
                  <button
                    key={m.path}
                    onClick={() => setOpenDoc(m.path)}
                    className="text-start rounded-xl border border-border bg-surface-secondary p-5 hover:border-accent hover:bg-surface-tertiary transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <Award className={cn('h-5 w-5 shrink-0', isDone ? 'text-success' : 'text-info')} />
                      {m.status && (
                        <span className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full',
                          isDone ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
                        )}>
                          {m.status}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-bold text-on-surface mb-1">{m.title || m.name}</h4>
                    {m.date && (
                      <p className="text-[11px] text-on-surface-tertiary mb-2">{formatDate(m.date)}</p>
                    )}
                    {m.preview && (
                      <p className="text-xs text-on-surface-secondary line-clamp-3">{m.preview}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* DETAILED WORK */}
        {tab === 'detailed-work' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                  <Microscope className="h-4 w-4 text-accent" />
                  {isRTL ? 'العمل التفصيلي' : 'Detailed Work'}
                </h3>
                <span className="text-xs text-on-surface-tertiary">
                  {data?.detailedWork.length ?? 0} {isRTL ? 'ملف' : 'files'}
                </span>
              </div>
              {!data?.detailedWork.length ? (
                <p className="text-sm text-on-surface-tertiary text-center py-10">
                  {isRTL ? 'لا توجد ملفات' : 'No files found'}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {data.detailedWork.map((f) => (
                    <button
                      key={f.path}
                      onClick={() => setOpenDoc(f.path)}
                      className="w-full text-start px-5 py-4 hover:bg-surface-tertiary transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-on-surface group-hover:text-accent transition-colors">
                            {f.title || f.name}
                          </h4>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {f.category && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent">{f.category}</span>
                            )}
                            {f.status && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary">{f.status}</span>
                            )}
                          </div>
                          {f.preview && (
                            <p className="text-xs text-on-surface-secondary mt-2 line-clamp-2">{f.preview}</p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-on-surface-tertiary shrink-0 mt-1" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SCOPE POINTS */}
        {tab === 'scope-points' && (
          <div className="space-y-4">
            <p className="text-xs text-on-surface-tertiary">
              {isRTL
                ? 'النقاط التفصيلية لنطاق البحث — مستمدة من التوصيات مع المشرف.'
                : 'Detailed scope points for the research — derived from supervisor recommendations.'}
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {!data?.scopePoints.length ? (
                <p className="text-sm text-on-surface-tertiary py-10 col-span-2 text-center">
                  {isRTL ? 'لا توجد نقاط نطاق' : 'No scope points found'}
                </p>
              ) : (
                data.scopePoints.map((f, idx) => (
                  <button
                    key={f.path}
                    onClick={() => setOpenDoc(f.path)}
                    style={{ animationDelay: `${idx * 40}ms` }}
                    className="text-start rounded-xl border border-border bg-surface-secondary p-4 hover:border-accent hover:bg-surface-tertiary transition-all group animate-[fadeInUp_0.35s_ease-out_both]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0 text-xs font-bold group-hover:scale-110 transition-transform">
                        {f.name.match(/^S(\d+)/)?.[1] ?? (idx + 1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-on-surface group-hover:text-accent transition-colors line-clamp-2">
                          {f.title || f.name}
                        </h4>
                        {f.preview && (
                          <p className="text-xs text-on-surface-secondary mt-1 line-clamp-2">{f.preview}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* MATERIALS */}
        {tab === 'materials' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                  <Library className="h-4 w-4 text-info" />
                  {isRTL ? 'مواد الإشراف' : 'Supervision Materials'}
                </h3>
                <span className="text-xs text-on-surface-tertiary">
                  {data?.materials.length ?? 0} {isRTL ? 'مرجع' : 'references'}
                </span>
              </div>
              {!data?.materials.length ? (
                <p className="text-sm text-on-surface-tertiary text-center py-10">
                  {isRTL ? 'لا توجد مواد' : 'No materials found'}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {data.materials.map((f) => (
                    <button
                      key={f.path}
                      onClick={() => setOpenDoc(f.path)}
                      className="w-full text-start px-5 py-4 hover:bg-surface-tertiary transition-colors group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-lg bg-info/10 text-info flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-on-surface group-hover:text-accent transition-colors">
                            {f.title || f.name}
                          </h4>
                          {f.preview && (
                            <p className="text-xs text-on-surface-secondary mt-1 line-clamp-2">{f.preview}</p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-on-surface-tertiary shrink-0 mt-1" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VISUAL DASHBOARD — custom design with GRS2 timeline + animated year track */}
        {tab === 'dashboard' && (
          <VisualDashboard
            meetings={data?.meetings ?? []}
            milestones={data?.milestones ?? []}
            isRTL={isRTL}
            onOpenDoc={(p) => setOpenDoc(p)}
          />
        )}
      </div>

      {openDoc && (
        <DocModal path={openDoc} onClose={() => setOpenDoc(null)} isRTL={isRTL} />
      )}
    </div>
  );
}

// ── Visual Dashboard ─────────────────────────────────────────────────
// New, animation-forward replacement for the old "Full Dashboard" tab.
// Shows: GRS2 stage tracker, year-track of meetings, action-pipeline.
function VisualDashboard({ meetings, milestones, isRTL, onOpenDoc }: {
  meetings: MeetingSummary[];
  milestones: MilestoneSummary[];
  isRTL: boolean;
  onOpenDoc: (path: string) => void;
}) {
  // ── GRS2 stage roll-up (latest meeting that has any GRS2 field) ──
  const latestGrs2 = useMemo(() => {
    const withGrs2 = meetings.filter((m) => m.grs2 && (m.grs2.input || m.grs2.respond || m.grs2.confirmed || m.grs2.stage));
    return withGrs2[0]?.grs2;
  }, [meetings]);
  const grs2Stage: 'input' | 'respond' | 'confirm' | 'none' =
    latestGrs2?.confirmed ? 'confirm'
      : latestGrs2?.respond ? 'respond'
      : latestGrs2?.input ? 'input'
      : 'none';

  // ── Year-track positions: place each meeting on a horizontal year line ──
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1).getTime();
  const yearEnd = new Date(year, 11, 31).getTime();
  const yearMeetings = useMemo(() => {
    return meetings
      .map((m) => {
        if (!m.date) return null;
        const t = new Date(formatDate(m.date)).getTime();
        if (Number.isNaN(t)) return null;
        const pct = ((t - yearStart) / (yearEnd - yearStart)) * 100;
        return { meeting: m, pct: Math.max(0, Math.min(100, pct)) };
      })
      .filter((x): x is { meeting: MeetingSummary; pct: number } => x !== null);
  }, [meetings, yearStart, yearEnd]);

  const totalOpen = meetings.reduce((s, m) => s + m.openTaskCount, 0);
  const totalDone = meetings.reduce((s, m) => s + (m.taskCount - m.openTaskCount), 0);
  const taskPct = (totalDone + totalOpen) === 0 ? 0 : Math.round((totalDone / (totalDone + totalOpen)) * 100);

  const monthLabels = isRTL
    ? ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
    : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const stageLabels = {
    input:   { ar: 'الإدخال',   en: 'Input' },
    respond: { ar: 'الردّ',     en: 'Respond' },
    confirm: { ar: 'التأكيد',   en: 'Confirm' },
  };

  return (
    <div className="space-y-6 animate-[fadeInUp_0.4s_ease-out]">
      {/* GRS2 STAGE TRACKER */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-info/8 via-surface-secondary to-accent/5 p-6 overflow-hidden relative">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <div>
            <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
              <Award className="h-4 w-4 text-info" />
              {isRTL ? 'متابعة GRS2 السنوية' : 'Annual GRS2 Tracker'}
            </h3>
            <p className="text-xs text-on-surface-tertiary mt-0.5">
              {isRTL
                ? 'مراحل المراجعة السنوية: إدخال → ردّ → تأكيد'
                : 'Stages of annual review: input → respond → confirm'}
            </p>
          </div>
          {latestGrs2?.stage && (
            <span className="text-xs px-3 py-1 rounded-full bg-info/15 text-info font-medium">
              {latestGrs2.stage}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {(['input', 'respond', 'confirm'] as const).map((stage, i) => {
            const reached =
              (stage === 'input'   && (grs2Stage === 'input' || grs2Stage === 'respond' || grs2Stage === 'confirm')) ||
              (stage === 'respond' && (grs2Stage === 'respond' || grs2Stage === 'confirm')) ||
              (stage === 'confirm' && grs2Stage === 'confirm');
            const isCurrent = stage === grs2Stage;
            const detail = stage === 'input' ? latestGrs2?.input
              : stage === 'respond' ? latestGrs2?.respond
              : (latestGrs2?.confirmed ? (isRTL ? 'تأكّد' : 'Confirmed') : undefined);

            return (
              <div key={stage} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center min-w-0 flex-1">
                  <div
                    className={cn(
                      'h-12 w-12 rounded-full flex items-center justify-center transition-all duration-500',
                      reached
                        ? 'bg-info text-white shadow-lg shadow-info/30 scale-110'
                        : 'bg-surface-tertiary text-on-surface-tertiary',
                      isCurrent && 'ring-4 ring-info/30 animate-pulse'
                    )}
                  >
                    {reached ? <CheckCircle2 className="h-6 w-6" /> : <span className="text-sm font-bold">{i + 1}</span>}
                  </div>
                  <p className={cn('text-sm font-semibold mt-2', reached ? 'text-on-surface' : 'text-on-surface-tertiary')}>
                    {isRTL ? stageLabels[stage].ar : stageLabels[stage].en}
                  </p>
                  {detail && (
                    <p className="text-[10px] text-on-surface-tertiary mt-0.5 line-clamp-1 max-w-[120px]" title={detail}>
                      {detail}
                    </p>
                  )}
                </div>
                {i < 2 && (
                  <div className="flex-1 h-0.5 mx-1 bg-surface-tertiary relative overflow-hidden">
                    <div
                      className={cn(
                        'absolute inset-y-0 start-0 bg-info transition-all duration-700',
                        reached && (i === 0 ? grs2Stage !== 'input' : grs2Stage === 'confirm') ? 'w-full' : 'w-0'
                      )}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {grs2Stage === 'none' && (
          <p className="text-xs text-on-surface-tertiary mt-4 text-center">
            {isRTL
              ? '⏳ لم يبدأ نموذج GRS2 بعد — سيُتتبع تلقائياً عند ذكره في أي اجتماع'
              : '⏳ GRS2 has not started yet — will be tracked automatically when mentioned in any meeting'}
          </p>
        )}
      </section>

      {/* YEAR TRACK */}
      <section className="rounded-2xl border border-border bg-surface-secondary p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
            <Calendar className="h-4 w-4 text-accent" />
            {isRTL ? `خط الزمن — ${year}` : `Year Timeline — ${year}`}
          </h3>
          <span className="text-xs text-on-surface-tertiary">
            {yearMeetings.length} {isRTL ? 'اجتماع' : 'meetings'}
          </span>
        </div>

        <div className="relative pt-2 pb-12" dir="ltr">
          <div className="absolute inset-x-0 top-1/2 h-1 bg-gradient-to-r from-accent/20 via-info/30 to-accent/20 rounded-full -translate-y-1/2" />
          {yearMeetings.map(({ meeting, pct }, idx) => (
            <button
              key={meeting.path}
              onClick={() => onOpenDoc(meeting.path)}
              style={{ left: `${pct}%`, animationDelay: `${idx * 60}ms` }}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 group animate-[fadeInUp_0.5s_ease-out_both]"
              title={meeting.title || meeting.name}
            >
              <div
                className={cn(
                  'h-4 w-4 rounded-full border-2 border-surface transition-all duration-300 group-hover:scale-150 group-hover:shadow-lg',
                  meeting.openTaskCount > 0
                    ? 'bg-warning shadow-warning/40'
                    : 'bg-success shadow-success/40'
                )}
              />
              <div className="absolute top-6 start-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-on-surface-tertiary opacity-0 group-hover:opacity-100 transition-opacity bg-surface px-2 py-1 rounded shadow-md border border-border z-10">
                {meeting.title || meeting.name}
                <br />
                <span className="text-[9px]">{formatDate(meeting.date)}</span>
              </div>
            </button>
          ))}
          <div className="absolute inset-x-0 -bottom-1 flex justify-between text-[9px] text-on-surface-tertiary">
            {monthLabels.map((m) => (
              <span key={m} className="flex-1 text-center">{m}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ACTION ITEMS PIPELINE */}
      <section className="grid md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-success/10 to-surface-secondary p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <p className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider">
              {isRTL ? 'مكتمل' : 'Done'}
            </p>
          </div>
          <p className="text-3xl font-bold text-on-surface tabular-nums">{totalDone}</p>
          <p className="text-xs text-on-surface-tertiary mt-1">
            {isRTL ? 'بنود تم إنجازها' : 'tasks completed'}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-gradient-to-br from-warning/10 to-surface-secondary p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-warning" />
            <p className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider">
              {isRTL ? 'مفتوح' : 'Open'}
            </p>
          </div>
          <p className="text-3xl font-bold text-on-surface tabular-nums">{totalOpen}</p>
          <p className="text-xs text-on-surface-tertiary mt-1">
            {isRTL ? 'بنود لم تُنجز بعد' : 'tasks remaining'}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-gradient-to-br from-accent/10 to-surface-secondary p-5">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-accent" />
            <p className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider">
              {isRTL ? 'نسبة الإنجاز' : 'Completion'}
            </p>
          </div>
          <p className="text-3xl font-bold text-on-surface tabular-nums">{taskPct}%</p>
          <div className="mt-2 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-info transition-all duration-1000"
              style={{ width: `${taskPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* RECENT MILESTONES */}
      {milestones.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface-secondary p-6">
          <h3 className="text-base font-bold text-on-surface flex items-center gap-2 mb-4">
            <Award className="h-4 w-4 text-info" />
            {isRTL ? 'المحطات الأخيرة' : 'Recent Milestones'}
          </h3>
          <div className="grid md:grid-cols-2 gap-3">
            {milestones.slice(0, 4).map((m, idx) => (
              <button
                key={m.path}
                onClick={() => onOpenDoc(m.path)}
                style={{ animationDelay: `${idx * 80}ms` }}
                className="text-start rounded-xl border border-border bg-surface p-4 hover:border-accent transition-all animate-[fadeInUp_0.4s_ease-out_both] group"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-info/15 text-info flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Award className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-on-surface group-hover:text-accent transition-colors line-clamp-1">
                      {m.title || m.name}
                    </h4>
                    {m.date && <p className="text-[11px] text-on-surface-tertiary mt-0.5">{formatDate(m.date)}</p>}
                    {m.preview && <p className="text-xs text-on-surface-secondary mt-1 line-clamp-2">{m.preview}</p>}
                  </div>
                  <ArrowRight className={cn('h-4 w-4 text-on-surface-tertiary opacity-0 group-hover:opacity-100 transition-opacity', isRTL && 'rotate-180')} />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Stat pillar ────────────────────────────────────────────────────────
function StatPillar({ icon: Icon, value, label, color = 'accent' }: {
  icon: React.ElementType; value: string | number; label: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    accent: 'text-accent bg-accent/10',
    info: 'text-info bg-info/10',
    success: 'text-success bg-success/10',
    warning: 'text-warning bg-warning/10',
  };
  return (
    <div className="rounded-xl border border-border bg-surface-secondary p-4 flex items-center gap-3">
      <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', colorMap[color] ?? colorMap.accent)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-tight text-on-surface truncate">{value}</p>
        <p className="text-[10px] text-on-surface-tertiary mt-0.5 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}
