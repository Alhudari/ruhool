'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, Plus, Send, Eye, Trash2, Edit2, Power, AlertCircle, CheckCircle2, Clock, History, X, Copy, ChevronUp, ChevronDown } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/app';

type ScheduleKind = 'daily' | 'weekly' | 'monthly' | 'once' | 'manual';

interface ReportSchedule {
  type: ScheduleKind;
  hour?: number;
  minute?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  at?: string;
  timezone?: string;
}

interface ReportSection { signedBy: string; title: string; prompt: string }
interface ReportFeedbackEntry { id: string; text: string; source: string; addedBy?: string; createdAt: string; active: boolean }

interface ReportDefinition {
  id: string;
  name: string;
  prompt: string;
  signedBy: string;
  schedule: ReportSchedule;
  recipients: string[];
  enabled: boolean;
  lastSentAt?: string | null;
  lastError?: string | null;
  nextRunAt?: string | null;
  includeContext?: {
    tasks?: boolean;
    dispatches?: boolean;
    changelog?: boolean;
    agentQuotes?: boolean;
  };
  sections?: ReportSection[];
  feedback?: ReportFeedbackEntry[];
  createdAt: string;
  updatedAt: string;
}

interface ResendConfig {
  hasKey: boolean;
  keyMasked: string | null;
  fromEmail: string;
  defaultRecipient: string;
}

interface ReportRunRecord {
  id: string;
  reportId: string;
  triggeredBy: 'schedule' | 'manual' | 'chat';
  status: 'pending' | 'composing' | 'sending' | 'sent' | 'failed';
  error?: string | null;
  subject?: string;
  htmlBytes?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  startedAt: string;
  finishedAt?: string | null;
  recipients: string[];
}

const DEFAULT_DAILY_PROMPT = `اكتب تقريراً يومياً تنفيذياً مختصراً لعبدالله عن نشاط المنصة خلال الـ 24 ساعة الماضية. ركّز على:
- ما أُنجز اليوم (المهام المكتملة، السلاسل النشطة)
- ما يستحق الانتباه (متأخرات، عقبات)
- نبضة الوكلاء (إن وُجد نشاط dispatch)
- توصية واحدة لبكرة

اختم بتوقيع "— المعماري ‖ مهندس المنصة".`;

const AGENT_OPTIONS = [
  { id: 'architect', label: 'المعماري (مهندس المنصة)' },
  { id: 'manager', label: 'الراعي (CEO الدكتوراه)' },
  { id: 'doctor', label: 'الدكتور (CEO الحياة)' },
];

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

interface ReportTemplate {
  id: string;
  label: string;
  description: string;
  name: string;
  prompt: string;
  signedBy: string;
  schedule: ReportSchedule;
  includeContext: { tasks?: boolean; dispatches?: boolean; changelog?: boolean; agentQuotes?: boolean };
  sections?: ReportSection[];
}

const TEMPLATES: ReportTemplate[] = [
  {
    id: 'daily-exec',
    label: '🏛️ تقرير يومي تنفيذي',
    description: 'يلخّص نشاط اليوم، الإنجاز، التحديات، ويقترح توصية لبكرة.',
    name: 'تقرير {{weekday}} {{date}}',
    prompt: DEFAULT_DAILY_PROMPT,
    signedBy: 'architect',
    schedule: { type: 'daily', hour: 22, minute: 0, timezone: 'Asia/Kuwait' },
    includeContext: { tasks: true, dispatches: true, changelog: true, agentQuotes: true },
  },
  {
    id: 'weekly-phd',
    label: '🎓 تقرير أسبوعي للدكتوراة',
    description: 'من الراعي فقط، يركّز على تقدّم البحث والقراءات والكتابة.',
    name: 'ملخّص الدكتوراة أسبوع {{week}}',
    prompt: 'لخّص أسبوع الدكتوراة: ما قرأته، ما كتبته، اجتماعات المشرفين، ما تأخّر، والعقبات. اختم بخطوة واحدة ملموسة للأسبوع القادم. وقّع "— الراعي".',
    signedBy: 'manager',
    schedule: { type: 'weekly', dayOfWeek: 0, hour: 9, minute: 0, timezone: 'Asia/Kuwait' },
    includeContext: { tasks: true, dispatches: true, changelog: false, agentQuotes: false },
  },
  {
    id: 'weekly-life',
    label: '🏡 تقرير أسبوعي للحياة',
    description: 'من الدكتور، يغطّي المهام الشخصية والصحة والتنظيم.',
    name: 'تقرير الحياة · أسبوع {{week}}',
    prompt: 'من زاوية CEO الحياة: لخّص أسبوعك الشخصي — الصحة، التنظيم، المهام خارج الدكتوراة، والعادات. اختم بنصيحة لطيفة. وقّع "— الدكتور".',
    signedBy: 'doctor',
    schedule: { type: 'weekly', dayOfWeek: 4, hour: 21, minute: 0, timezone: 'Asia/Kuwait' },
    includeContext: { tasks: true, dispatches: false, changelog: false, agentQuotes: false },
  },
  {
    id: 'weekly-bundle',
    label: '📚 تقرير أسبوعي مُجمَّع',
    description: 'الراعي + الدكتور يكتبان قسمين، والمعماري يبندلهما.',
    name: 'تقرير الأسبوع {{week}} · {{date}}',
    prompt: 'ابندل مذكّرات الراعي والدكتور في رسالة موحّدة. ابدأ بتحية لعبدالله، قدّم كل قسم بعنوانه، واختم بجملة واحدة منك كمهندس المنصة.',
    signedBy: 'architect',
    schedule: { type: 'weekly', dayOfWeek: 5, hour: 20, minute: 0, timezone: 'Asia/Kuwait' },
    includeContext: { tasks: true, dispatches: true, changelog: true, agentQuotes: true },
    sections: [
      { signedBy: 'manager', title: 'ملاحظات الراعي — الدكتوراة', prompt: 'اكتب فقرة عن تقدّم الدكتوراة هذا الأسبوع — قراءات، كتابة، مشرفون، عقبات. أنت مؤلف قسم، لا تضف تحية ولا توقيعاً.' },
      { signedBy: 'doctor', title: 'ملاحظات الدكتور — الحياة', prompt: 'اكتب فقرة عن الحياة خارج الدكتوراة — الصحة، التنظيم، العادات. أنت مؤلف قسم، لا تضف تحية ولا توقيعاً.' },
    ],
  },
];

function describeSchedule(s: ReportSchedule): string {
  if (s.type === 'manual') return 'يدوي فقط';
  if (s.type === 'once') return `مرة واحدة: ${s.at}`;
  const hm = `${String(s.hour ?? 0).padStart(2, '0')}:${String(s.minute ?? 0).padStart(2, '0')}`;
  if (s.type === 'daily') return `يومياً ${hm}`;
  if (s.type === 'weekly') return `${WEEKDAYS[s.dayOfWeek ?? 0]} ${hm}`;
  if (s.type === 'monthly') return `يوم ${s.dayOfMonth ?? 1} من الشهر ${hm}`;
  return '—';
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
}

export function ReportsSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [resend, setResend] = useState<ResendConfig | null>(null);
  const [orphanSigners, setOrphanSigners] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ReportDefinition | null>(null);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string; bodyMarkdown?: string } | null>(null);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [showRuns, setShowRuns] = useState(false);
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const [templateSeed, setTemplateSeed] = useState<ReportTemplate | null>(null);
  // R15-#26 bulk selection state.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [list, cfg, health] = await Promise.all([
        apiFetch<ReportDefinition[]>('/api/reports'),
        apiFetch<ResendConfig>('/api/reports/resend-config'),
        apiFetch<{ orphans: Array<{ id: string; signedBy: string }> }>('/api/reports/signer-health').catch(() => ({ orphans: [] })),
      ]);
      setReports(list);
      setResend(cfg);
      setOrphanSigners(new Set(health.orphans.map((o) => o.id)));
    } catch {
      setBanner({ kind: 'err', msg: isRTL ? 'فشل تحميل التقارير' : 'Failed to load reports' });
    } finally {
      setLoading(false);
    }
  }, [isRTL]);

  useEffect(() => { void load(); }, [load]);

  const seedDefault = async () => {
    const draft: Omit<ReportDefinition, 'id' | 'createdAt' | 'updatedAt' | 'lastSentAt' | 'lastError' | 'nextRunAt'> = {
      name: 'التقرير اليومي التنفيذي',
      prompt: DEFAULT_DAILY_PROMPT,
      signedBy: 'architect',
      schedule: { type: 'daily', hour: 22, minute: 0, timezone: 'Asia/Kuwait' },
      recipients: [],
      enabled: false,
      includeContext: { tasks: true, dispatches: true, changelog: true, agentQuotes: true },
    };
    try {
      await apiFetch<ReportDefinition>('/api/reports', { method: 'POST', body: JSON.stringify(draft) });
      await load();
      setBanner({ kind: 'ok', msg: 'تم إنشاء التقرير الافتراضي — فعّله بعد ضبط Resend والمستلم.' });
    } catch {
      setBanner({ kind: 'err', msg: 'فشل الإنشاء' });
    }
  };

  const toggleEnabled = async (r: ReportDefinition) => {
    try {
      await apiFetch(`/api/reports/${r.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !r.enabled }) });
      await load();
    } catch {/* silent */}
  };

  const deleteReport = async (r: ReportDefinition) => {
    if (!confirm(`حذف "${r.name}"؟`)) return;
    try {
      await apiFetch(`/api/reports/${r.id}`, { method: 'DELETE' });
      await load();
    } catch {/* silent */}
  };

  // R15-#25 — move a report up/down. Sends the new full order to
  // the server so the ordering persists across reloads.
  const moveReport = async (r: ReportDefinition, dir: -1 | 1) => {
    const idx = reports.findIndex((x) => x.id === r.id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= reports.length) return;
    const next = reports.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    setReports(next);
    try {
      await apiFetch('/api/reports/reorder', {
        method: 'PUT',
        body: JSON.stringify({ orderedIds: next.map((x) => x.id) }),
      });
    } catch {
      // Revert on failure.
      await load();
    }
  };

  // R15-#26 — bulk enable/disable.
  const bulkToggle = async (enabled: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await apiFetch('/api/reports/bulk-toggle', { method: 'PUT', body: JSON.stringify({ ids, enabled }) });
      setSelectedIds(new Set());
      await load();
      setBanner({ kind: 'ok', msg: `${enabled ? 'فُعِّل' : 'عُطِّل'} ${ids.length} تقرير` });
    } catch {
      setBanner({ kind: 'err', msg: 'فشل التبديل الجماعي' });
    }
  };
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // R15-#24 — duplicate a report as a disabled draft copy.
  const duplicateReport = async (r: ReportDefinition) => {
    try {
      // Server assigns a new id; we strip server-owned fields + mark
      // the clone disabled so it doesn't fire on the original schedule.
      const body = {
        name: `${r.name} (نسخة)`,
        prompt: r.prompt,
        signedBy: r.signedBy,
        schedule: r.schedule,
        recipients: r.recipients ?? [],
        language: (r as { language?: 'ar' | 'en' }).language,
        enabled: false,
        includeContext: r.includeContext,
        sections: r.sections,
        feedback: r.feedback ?? [],
      };
      await apiFetch<ReportDefinition>('/api/reports', { method: 'POST', body: JSON.stringify(body) });
      await load();
      setBanner({ kind: 'ok', msg: `نُسخ "${r.name}"` });
    } catch (err) {
      setBanner({ kind: 'err', msg: err instanceof Error ? err.message : 'فشل النسخ' });
    }
  };

  const sendNow = async (r: ReportDefinition) => {
    setBanner(null);
    try {
      const res = await apiFetch<{ status: string; error?: string }>(`/api/reports/${r.id}/send`, { method: 'POST' });
      if (res.status === 'sent') setBanner({ kind: 'ok', msg: `أُرسل "${r.name}"` });
      else setBanner({ kind: 'err', msg: res.error ?? 'فشل الإرسال' });
      await load();
    } catch (err) {
      setBanner({ kind: 'err', msg: err instanceof Error ? err.message : 'فشل الإرسال' });
    }
  };

  const previewNow = async (r: ReportDefinition) => {
    setBanner(null);
    try {
      const res = await apiFetch<{ status: string; subject?: string; html?: string; bodyMarkdown?: string; error?: string }>(`/api/reports/${r.id}/preview`, { method: 'POST' });
      if (res.html) setPreview({ subject: res.subject ?? r.name, html: res.html, bodyMarkdown: res.bodyMarkdown });
      else setBanner({ kind: 'err', msg: res.error ?? 'فشل التوليد' });
    } catch (err) {
      setBanner({ kind: 'err', msg: err instanceof Error ? err.message : 'فشل التوليد' });
    }
  };

  if (loading) return <div className="text-sm text-on-surface-secondary">{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Mail size={20} className="text-on-surface-secondary" />
        <div>
          <h2 className="text-lg font-semibold text-on-surface">{isRTL ? 'التقارير الدورية' : 'Scheduled Reports'}</h2>
          <p className="text-sm text-on-surface-secondary">{isRTL ? 'تقارير يومية/أسبوعية يكتبها الوكلاء ويُرسلونها عبر البريد.' : 'Periodic reports composed by agents and delivered via email.'}</p>
        </div>
      </header>

      {banner && (
        <div className={`flex items-center gap-2 p-3 rounded-[var(--radius)] text-sm ${banner.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {banner.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{banner.msg}</span>
        </div>
      )}

      <ResendSection resend={resend} onSaved={load} />

      {/* R15-#26 — bulk action toolbar (only when ≥1 selected). */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-[var(--radius)] bg-surface-secondary border border-border">
          <span className="text-sm text-on-surface">حُدِّد {selectedIds.size} تقرير</span>
          <div className="flex gap-2">
            <button onClick={() => bulkToggle(true)} className="text-xs px-3 py-1 rounded-[var(--radius)] bg-emerald-600 text-white hover:opacity-90">فعّل الكل</button>
            <button onClick={() => bulkToggle(false)} className="text-xs px-3 py-1 rounded-[var(--radius)] bg-surface text-on-surface border border-border hover:bg-surface-tertiary">عطّل الكل</button>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs px-3 py-1 rounded-[var(--radius)] text-on-surface-secondary hover:bg-surface-tertiary">إلغاء التحديد</button>
          </div>
        </div>
      )}

      <section className="bg-surface rounded-[var(--radius)] border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-on-surface">{isRTL ? 'قائمة التقارير' : 'Reports List'}</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowRuns(true)} className="text-xs px-3 py-1.5 rounded-[var(--radius)] bg-surface-secondary hover:bg-surface-tertiary text-on-surface flex items-center gap-1" title={isRTL ? 'سجل التشغيل' : 'Run history'}>
              <History size={14} /> {isRTL ? 'السجل' : 'History'}
            </button>
            {reports.length === 0 && (
              <button onClick={seedDefault} className="text-xs px-3 py-1.5 rounded-[var(--radius)] bg-surface-secondary hover:bg-surface-tertiary text-on-surface">
                {isRTL ? 'أنشئ التقرير الافتراضي' : 'Create default daily report'}
              </button>
            )}
            <button onClick={() => setPickingTemplate(true)} className="text-xs px-3 py-1.5 rounded-[var(--radius)] bg-surface-secondary hover:bg-surface-tertiary text-on-surface flex items-center gap-1">
              📋 {isRTL ? 'من قالب' : 'From template'}
            </button>
            <button onClick={() => { setTemplateSeed(null); setCreating(true); }} className="text-xs px-3 py-1.5 rounded-[var(--radius)] bg-on-surface text-surface hover:opacity-90 flex items-center gap-1">
              <Plus size={14} /> {isRTL ? 'تقرير جديد' : 'New report'}
            </button>
          </div>
        </div>

        {reports.length === 0 ? (
          <div className="p-8 text-center text-sm text-on-surface-secondary">
            {isRTL ? 'لا توجد تقارير بعد. أنشئ أول تقرير.' : 'No reports yet.'}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {reports.map((r) => (
              <li key={r.id} className="p-4 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(r.id)}
                  onChange={() => toggleSelection(r.id)}
                  aria-label={`تحديد ${r.name}`}
                  className="mt-1 shrink-0"
                />
                <button
                  onClick={() => toggleEnabled(r)}
                  title={r.enabled ? 'مفعّل' : 'معطّل'}
                  className={`mt-1 shrink-0 ${r.enabled ? 'text-emerald-600' : 'text-on-surface-muted'}`}
                >
                  <Power size={16} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-on-surface">{r.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-secondary text-on-surface-secondary">
                      {AGENT_OPTIONS.find((a) => a.id === r.signedBy)?.label ?? r.signedBy}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-secondary text-on-surface-secondary flex items-center gap-1">
                      <Clock size={11} /> {describeSchedule(r.schedule)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-on-surface-secondary">
                    {r.recipients.length > 0 ? r.recipients.join(', ') : (isRTL ? 'سيستخدم المستلم الافتراضي' : 'Uses default recipient')}
                  </div>
                  <div className="mt-1 text-xs text-on-surface-muted flex gap-4 flex-wrap">
                    <span>{isRTL ? 'آخر إرسال:' : 'Last sent:'} {formatDate(r.lastSentAt)}</span>
                    <span>{isRTL ? 'التالي:' : 'Next:'} {formatDate(r.nextRunAt)}</span>
                  </div>
                  {r.lastError && (
                    <div className="mt-1 text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle size={11} /> {r.lastError}
                    </div>
                  )}
                  {orphanSigners.has(r.id) && (
                    <div className="mt-1 text-xs text-amber-700 flex items-center gap-1" title="سيفشل عند التشغيل">
                      <AlertCircle size={11} /> الوكيل الموقّع "{r.signedBy}" غير موجود — غيّره من التحرير
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <IconBtn title="إلى أعلى" onClick={() => moveReport(r, -1)}><ChevronUp size={15} /></IconBtn>
                  <IconBtn title="إلى أسفل" onClick={() => moveReport(r, 1)}><ChevronDown size={15} /></IconBtn>
                  <IconBtn title="معاينة" onClick={() => previewNow(r)}><Eye size={15} /></IconBtn>
                  <IconBtn title="أرسل الآن" onClick={() => sendNow(r)}><Send size={15} /></IconBtn>
                  <IconBtn title="تحرير" onClick={() => setEditing(r)}><Edit2 size={15} /></IconBtn>
                  <IconBtn title="نسخ كقالب" onClick={() => duplicateReport(r)}><Copy size={15} /></IconBtn>
                  <IconBtn title="حذف" onClick={() => deleteReport(r)} danger><Trash2 size={15} /></IconBtn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(editing || creating) && (
        <ReportEditor
          initial={editing ?? undefined}
          seed={templateSeed ?? undefined}
          onClose={() => { setEditing(null); setCreating(false); setTemplateSeed(null); }}
          onSaved={() => { setEditing(null); setCreating(false); setTemplateSeed(null); void load(); }}
        />
      )}

      {pickingTemplate && (
        <TemplatePicker
          onClose={() => setPickingTemplate(false)}
          onPick={(t) => { setTemplateSeed(t); setPickingTemplate(false); setCreating(true); }}
        />
      )}

      {preview && (
        <PreviewModal subject={preview.subject} html={preview.html} bodyMarkdown={preview.bodyMarkdown} onClose={() => setPreview(null)} />
      )}
      {showRuns && (
        <RunHistoryModal reports={reports} onClose={() => setShowRuns(false)} />
      )}
    </div>
  );
}

function RunHistoryModal({ reports, onClose }: { reports: ReportDefinition[]; onClose: () => void }) {
  const [runs, setRuns] = useState<ReportRunRecord[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsOffset, setRunsOffset] = useState(0);
  const runsLimit = 50;
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);
  const [rerunNote, setRerunNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const nameById = Object.fromEntries(reports.map((r) => [r.id, r.name]));

  const loadRuns = () => {
    setLoading(true);
    return apiFetch<{ runs: ReportRunRecord[]; total: number; offset: number; limit: number }>(`/api/reports/runs?offset=${runsOffset}&limit=${runsLimit}`)
      .then((r) => { setRuns(r.runs); setRunsTotal(r.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { void loadRuns(); }, [runsOffset]);

  const resend = async (r: ReportRunRecord) => {
    setResending(r.id);
    setRerunNote(null);
    try {
      const res = await apiFetch<{ status: string; error?: string }>(`/api/reports/${r.reportId}/send`, { method: 'POST' });
      setRerunNote(res.status === 'sent'
        ? { ok: true, msg: `أُرسل "${nameById[r.reportId] ?? r.reportId}"` }
        : { ok: false, msg: res.error ?? 'فشل' });
      await loadRuns();
    } catch (err) {
      setRerunNote({ ok: false, msg: err instanceof Error ? err.message : 'فشل' });
    } finally { setResending(null); }
  };

  const statusClass = (s: ReportRunRecord['status']) => {
    if (s === 'sent') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (s === 'failed') return 'text-red-700 bg-red-50 border-red-200';
    return 'text-on-surface-secondary bg-surface-secondary border-border';
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-[var(--radius)] border border-border max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-on-surface flex items-center gap-2">
            <History size={16} /> سجلّ تشغيل التقارير
          </h3>
          <button onClick={onClose} className="p-1 text-on-surface-secondary hover:bg-surface-secondary rounded">
            <X size={16} />
          </button>
        </div>
        {rerunNote && (
          <div className={`text-sm px-4 py-2 border-b ${rerunNote.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
            {rerunNote.ok ? '✅ ' : '⚠️ '}{rerunNote.msg}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-on-surface-secondary">جاري التحميل...</div>
          ) : runs.length === 0 ? (
            <div className="p-8 text-center text-sm text-on-surface-secondary">لا يوجد تشغيل بعد.</div>
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((r) => (
                <li key={r.id} className="p-4 flex items-start gap-3 text-sm">
                  <div className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${statusClass(r.status)}`}>
                    {r.status === 'sent' ? 'أُرسل' : r.status === 'failed' ? 'فشل' : r.status}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-on-surface">{nameById[r.reportId] ?? r.reportId}</span>
                      <span className="text-xs text-on-surface-secondary">· {r.triggeredBy}</span>
                    </div>
                    {r.subject && <div className="mt-0.5 text-xs text-on-surface-secondary truncate">{r.subject}</div>}
                    {r.error && <div className="mt-0.5 text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} /> {r.error}</div>}
                    <div className="mt-1 text-xs text-on-surface-muted flex gap-3 flex-wrap">
                      <span>{formatDate(r.startedAt)}</span>
                      {r.recipients.length > 0 && <span>→ {r.recipients.join(', ')}</span>}
                      {typeof r.costUsd === 'number' && r.costUsd > 0 && <span>${r.costUsd.toFixed(4)}</span>}
                      {typeof r.tokensIn === 'number' && <span>tok {r.tokensIn}→{r.tokensOut}</span>}
                    </div>
                  </div>
                  {nameById[r.reportId] && (
                    <button
                      onClick={() => resend(r)}
                      disabled={resending === r.id}
                      title="إعادة إرسال"
                      className="p-1.5 rounded-[var(--radius)] text-on-surface-secondary hover:bg-surface-secondary disabled:opacity-50"
                    >
                      <Send size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {runsTotal > runsLimit && (
          <div className="p-3 border-t border-border flex items-center justify-between text-xs text-on-surface-secondary">
            <span>{runsOffset + 1}–{Math.min(runsOffset + runsLimit, runsTotal)} من {runsTotal}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setRunsOffset((o) => Math.max(0, o - runsLimit))}
                disabled={runsOffset === 0}
                className="px-3 py-1 rounded-[var(--radius)] bg-surface-secondary hover:bg-surface-tertiary disabled:opacity-30"
              >الأحدث</button>
              <button
                onClick={() => setRunsOffset((o) => o + runsLimit)}
                disabled={runsOffset + runsLimit >= runsTotal}
                className="px-3 py-1 rounded-[var(--radius)] bg-surface-secondary hover:bg-surface-tertiary disabled:opacity-30"
              >الأقدم</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded-[var(--radius)] transition-colors ${danger ? 'hover:bg-red-50 text-red-600' : 'hover:bg-surface-secondary text-on-surface-secondary'}`}
    >
      {children}
    </button>
  );
}

function ResendSection({ resend, onSaved }: { resend: ResendConfig | null; onSaved: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState(resend?.fromEmail ?? '');
  const [defaultRecipient, setDefaultRecipient] = useState(resend?.defaultRecipient ?? '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const testSend = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await apiFetch<{ ok: boolean; sentTo?: string; error?: string; messageId?: string }>(
        '/api/reports/resend-config/test',
        { method: 'POST' },
      );
      setTestResult(r.ok
        ? { ok: true, msg: `أُرسل إيميل تجربة إلى ${r.sentTo} (${r.messageId})` }
        : { ok: false, msg: r.error ?? 'فشل الاختبار' });
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : 'فشل الاختبار' });
    } finally { setTesting(false); }
  };

  const canTest = (resend?.hasKey || !!apiKey) && (fromEmail || resend?.fromEmail) && (defaultRecipient || resend?.defaultRecipient);

  useEffect(() => {
    setFromEmail(resend?.fromEmail ?? '');
    setDefaultRecipient(resend?.defaultRecipient ?? '');
  }, [resend]);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = { fromEmail, defaultRecipient };
      if (apiKey) body.apiKey = apiKey;
      await apiFetch('/api/reports/resend-config', { method: 'PUT', body: JSON.stringify(body) });
      setApiKey('');
      setDirty(false);
      onSaved();
    } catch { /* silent */ } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-surface rounded-[var(--radius)] border border-border p-4 space-y-3">
      <h3 className="text-sm font-semibold text-on-surface">إعدادات البريد (Resend)</h3>
      <p className="text-xs text-on-surface-secondary leading-relaxed">
        سجّل في <a href="https://resend.com" className="underline" target="_blank" rel="noreferrer">resend.com</a> (مجاني حتى ٣٠٠٠ بريد شهرياً)، أنشئ API key، وثبّت نطاقاً للإرسال.
      </p>
      <div className="grid gap-3">
        <label className="text-xs text-on-surface-secondary space-y-1 block">
          <span>API Key {resend?.hasKey && <span className="text-on-surface-muted">(محفوظ: {resend.keyMasked})</span>}</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setDirty(true); }}
            placeholder="re_..."
            className="w-full text-sm px-3 py-2 rounded-[var(--radius)] border border-border bg-surface"
          />
        </label>
        <label className="text-xs text-on-surface-secondary space-y-1 block">
          <span>From (مثال: Ruhool Reports &lt;reports@yourdomain.com&gt;)</span>
          <input
            type="text"
            value={fromEmail}
            onChange={(e) => { setFromEmail(e.target.value); setDirty(true); }}
            placeholder="Ruhool <reports@example.com>"
            className="w-full text-sm px-3 py-2 rounded-[var(--radius)] border border-border bg-surface"
          />
        </label>
        <label className="text-xs text-on-surface-secondary space-y-1 block">
          <span>المستلم الافتراضي</span>
          <input
            type="email"
            value={defaultRecipient}
            onChange={(e) => { setDefaultRecipient(e.target.value); setDirty(true); }}
            placeholder="you@example.com"
            className="w-full text-sm px-3 py-2 rounded-[var(--radius)] border border-border bg-surface"
          />
        </label>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {dirty && (
          <button onClick={save} disabled={saving} className="text-xs px-3 py-1.5 rounded-[var(--radius)] bg-on-surface text-surface hover:opacity-90 disabled:opacity-50">
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        )}
        {!dirty && canTest && (
          <button onClick={testSend} disabled={testing} className="text-xs px-3 py-1.5 rounded-[var(--radius)] bg-surface-secondary hover:bg-surface-tertiary text-on-surface disabled:opacity-50">
            {testing ? 'جاري الإرسال...' : 'أرسل إيميل اختبار'}
          </button>
        )}
      </div>
      {testResult && (
        <div className={`text-xs p-2 rounded-[var(--radius)] border ${testResult.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {testResult.ok ? '✅ ' : '⚠️ '}{testResult.msg}
        </div>
      )}
    </section>
  );
}

function ReportEditor({ initial, seed, onClose, onSaved }: { initial?: ReportDefinition; seed?: ReportTemplate; onClose: () => void; onSaved: () => void }) {
  const src = initial ?? seed;
  const [name, setName] = useState(src?.name ?? 'تقرير جديد');
  const [prompt, setPrompt] = useState(src?.prompt ?? DEFAULT_DAILY_PROMPT);
  const [signedBy, setSignedBy] = useState(src?.signedBy ?? 'architect');
  const [language, setLanguage] = useState<'ar' | 'en'>((src as { language?: 'ar' | 'en' })?.language ?? 'ar');
  const [schedule, setSchedule] = useState<ReportSchedule>(src?.schedule ?? { type: 'daily', hour: 22, minute: 0, timezone: 'Asia/Kuwait' });
  const [recipientsText, setRecipientsText] = useState((initial?.recipients ?? []).join(', '));
  const [includeTasks, setIncludeTasks] = useState(src?.includeContext?.tasks !== false);
  const [includeDispatches, setIncludeDispatches] = useState(src?.includeContext?.dispatches !== false);
  const [includeChangelog, setIncludeChangelog] = useState(src?.includeContext?.changelog ?? true);
  const [includeQuotes, setIncludeQuotes] = useState(src?.includeContext?.agentQuotes ?? true);
  const [includeZotero, setIncludeZotero] = useState(Boolean((src?.includeContext as { zotero?: boolean } | undefined)?.zotero));
  const [includeVault, setIncludeVault] = useState(Boolean((src?.includeContext as { vault?: boolean } | undefined)?.vault));
  const [includeMeetings, setIncludeMeetings] = useState(Boolean((src?.includeContext as { meetings?: boolean } | undefined)?.meetings));
  const [includeBudget, setIncludeBudget] = useState(Boolean((src?.includeContext as { budget?: boolean } | undefined)?.budget));
  const [sections, setSections] = useState<ReportSection[]>(src?.sections ?? []);
  const [feedback, setFeedback] = useState<ReportFeedbackEntry[]>(initial?.feedback ?? []);
  const [newFeedback, setNewFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFeedback = () => {
    const text = newFeedback.trim();
    if (!text) return;
    setFeedback((arr) => [...arr, {
      id: crypto.randomUUID(), text, source: 'settings', addedBy: 'user',
      createdAt: new Date().toISOString(), active: true,
    }]);
    setNewFeedback('');
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const recipients = recipientsText.split(/[,،\s]+/).map((s) => s.trim()).filter(Boolean);
    const body: Record<string, unknown> = {
      name,
      prompt,
      signedBy,
      schedule,
      recipients,
      language,
      enabled: initial?.enabled ?? true,
      includeContext: {
        tasks: includeTasks,
        dispatches: includeDispatches,
        changelog: includeChangelog,
        agentQuotes: includeQuotes,
        zotero: includeZotero,
        vault: includeVault,
        meetings: includeMeetings,
        budget: includeBudget,
      },
    };
    if (sections.length > 0) body.sections = sections;
    body.feedback = feedback;  // always send — includes disabled ones
    try {
      if (initial) await apiFetch(`/api/reports/${initial.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await apiFetch('/api/reports', { method: 'POST', body: JSON.stringify(body) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحفظ');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-[var(--radius)] border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-on-surface">{initial ? 'تحرير التقرير' : 'تقرير جديد'}</h3>

        <label className="block text-xs text-on-surface-secondary space-y-1">
          <span>الاسم (يدعم متغيّرات: <code className="bg-surface-secondary px-1 rounded">{'{{date}}'}</code> · <code className="bg-surface-secondary px-1 rounded">{'{{weekday}}'}</code> · <code className="bg-surface-secondary px-1 rounded">{'{{taskCount}}'}</code> · <code className="bg-surface-secondary px-1 rounded">{'{{completedToday}}'}</code> · <code className="bg-surface-secondary px-1 rounded">{'{{week}}'}</code>)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full text-sm px-3 py-2 rounded-[var(--radius)] border border-border bg-surface" />
        </label>

        <label className="block text-xs text-on-surface-secondary space-y-1">
          <span>من يوقّعه</span>
          <select value={signedBy} onChange={(e) => setSignedBy(e.target.value)} className="w-full text-sm px-3 py-2 rounded-[var(--radius)] border border-border bg-surface">
            {AGENT_OPTIONS.map((a) => (<option key={a.id} value={a.id}>{a.label}</option>))}
          </select>
        </label>

        <label className="block text-xs text-on-surface-secondary space-y-1">
          <span>لغة التقرير</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setLanguage('ar')} className={`text-xs px-3 py-1.5 rounded-full ${language === 'ar' ? 'bg-on-surface text-surface' : 'bg-surface-secondary text-on-surface-secondary'}`}>العربية</button>
            <button type="button" onClick={() => setLanguage('en')} className={`text-xs px-3 py-1.5 rounded-full ${language === 'en' ? 'bg-on-surface text-surface' : 'bg-surface-secondary text-on-surface-secondary'}`}>English</button>
          </div>
        </label>

        <div className="block text-xs text-on-surface-secondary space-y-2">
          <span>الجدولة</span>
          <div className="flex gap-2">
            {(['daily', 'weekly', 'monthly', 'manual'] as ScheduleKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setSchedule((s) => ({ ...s, type: k, timezone: s.timezone ?? 'Asia/Kuwait' }))}
                className={`text-xs px-3 py-1.5 rounded-full ${schedule.type === k ? 'bg-on-surface text-surface' : 'bg-surface-secondary text-on-surface-secondary'}`}
              >
                {k === 'daily' ? 'يومي' : k === 'weekly' ? 'أسبوعي' : k === 'monthly' ? 'شهري' : 'يدوي'}
              </button>
            ))}
          </div>
          {schedule.type !== 'manual' && (
            <div className="flex gap-2 items-center flex-wrap pt-2">
              {schedule.type === 'weekly' && (
                <select value={schedule.dayOfWeek ?? 0} onChange={(e) => setSchedule((s) => ({ ...s, dayOfWeek: Number(e.target.value) }))} className="text-sm px-2 py-1.5 rounded-[var(--radius)] border border-border bg-surface">
                  {WEEKDAYS.map((d, i) => (<option key={i} value={i}>{d}</option>))}
                </select>
              )}
              {schedule.type === 'monthly' && (
                <input type="number" min={1} max={28} value={schedule.dayOfMonth ?? 1} onChange={(e) => setSchedule((s) => ({ ...s, dayOfMonth: Number(e.target.value) }))} className="w-16 text-sm px-2 py-1.5 rounded-[var(--radius)] border border-border bg-surface" />
              )}
              <input type="number" min={0} max={23} value={schedule.hour ?? 0} onChange={(e) => setSchedule((s) => ({ ...s, hour: Number(e.target.value) }))} className="w-16 text-sm px-2 py-1.5 rounded-[var(--radius)] border border-border bg-surface" />
              <span className="text-on-surface-muted">:</span>
              <input type="number" min={0} max={59} value={schedule.minute ?? 0} onChange={(e) => setSchedule((s) => ({ ...s, minute: Number(e.target.value) }))} className="w-16 text-sm px-2 py-1.5 rounded-[var(--radius)] border border-border bg-surface" />
              <span className="text-xs text-on-surface-muted">({schedule.timezone})</span>
            </div>
          )}
        </div>

        <label className="block text-xs text-on-surface-secondary space-y-1">
          <span>المستلمون (مفصولون بفاصلة)</span>
          <input value={recipientsText} onChange={(e) => setRecipientsText(e.target.value)} placeholder="you@example.com" className="w-full text-sm px-3 py-2 rounded-[var(--radius)] border border-border bg-surface" />
        </label>

        <label className="block text-xs text-on-surface-secondary space-y-1">
          <span>التعليمات (برومبت الوكيل الموقّع — المحرر لو فيه أقسام)</span>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} className="w-full text-sm px-3 py-2 rounded-[var(--radius)] border border-border bg-surface font-mono" />
        </label>

        <div className="block text-xs text-on-surface-secondary space-y-2">
          <div className="flex items-center justify-between">
            <span>الأقسام (اختياري — كل قسم يكتبه وكيل مختلف، والموقّع يحرّر)</span>
            <button
              type="button"
              onClick={() => setSections((s) => [...s, { signedBy: 'manager', title: `قسم ${s.length + 1}`, prompt: '' }])}
              className="text-xs px-2 py-1 rounded-[var(--radius)] bg-surface-secondary hover:bg-surface-tertiary"
            >+ قسم</button>
          </div>
          {sections.length === 0 ? (
            <p className="text-xs text-on-surface-muted">بدون أقسام، الموقّع يكتب التقرير كاملاً.</p>
          ) : (
            <div className="space-y-2">
              {sections.map((sec, i) => (
                <div key={i} className="border border-border rounded-[var(--radius)] p-2 space-y-2 bg-surface-secondary/40">
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={sec.title}
                      onChange={(e) => setSections((arr) => arr.map((s, j) => j === i ? { ...s, title: e.target.value } : s))}
                      placeholder="عنوان القسم"
                      className="flex-1 text-sm px-2 py-1.5 rounded-[var(--radius)] border border-border bg-surface"
                    />
                    <select
                      value={sec.signedBy}
                      onChange={(e) => setSections((arr) => arr.map((s, j) => j === i ? { ...s, signedBy: e.target.value } : s))}
                      className="text-sm px-2 py-1.5 rounded-[var(--radius)] border border-border bg-surface"
                    >
                      {AGENT_OPTIONS.map((a) => (<option key={a.id} value={a.id}>{a.label}</option>))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setSections((arr) => arr.filter((_, j) => j !== i))}
                      className="p-1.5 rounded-[var(--radius)] text-red-600 hover:bg-red-50"
                      title="حذف القسم"
                    >×</button>
                  </div>
                  <textarea
                    value={sec.prompt}
                    onChange={(e) => setSections((arr) => arr.map((s, j) => j === i ? { ...s, prompt: e.target.value } : s))}
                    placeholder="تعليمات هذا القسم للوكيل"
                    rows={3}
                    className="w-full text-sm px-2 py-1.5 rounded-[var(--radius)] border border-border bg-surface font-mono"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-xs text-on-surface-secondary space-y-2">
          <span>السياق المُضمَّن</span>
          <div className="flex gap-3 flex-wrap">
            <Toggle label="مهام" value={includeTasks} onChange={setIncludeTasks} />
            <Toggle label="نشاط الوكلاء" value={includeDispatches} onChange={setIncludeDispatches} />
            <Toggle label="تحديثات المنصة" value={includeChangelog} onChange={setIncludeChangelog} />
            <Toggle label="اقتباسات" value={includeQuotes} onChange={setIncludeQuotes} />
            <Toggle label="Zotero / أوراق" value={includeZotero} onChange={setIncludeZotero} />
            <Toggle label="الفولت (ملاحظات)" value={includeVault} onChange={setIncludeVault} />
            <Toggle label="اجتماعات" value={includeMeetings} onChange={setIncludeMeetings} />
            <Toggle label="ميزانية وتكاليف" value={includeBudget} onChange={setIncludeBudget} />
          </div>
        </div>

        <div className="text-xs text-on-surface-secondary space-y-2">
          <span>التعليمات الدائمة للوكيل (ذاكرة التقرير)</span>
          <p className="text-xs text-on-surface-muted">سيرى الوكيل هذه الملاحظات في كل تشغيل، وسيتجنّب تكرار محتوى آخر 3 تقارير أُرسلت.</p>
          <div className="flex gap-2">
            <input
              value={newFeedback}
              onChange={(e) => setNewFeedback(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFeedback(); } }}
              placeholder="مثل: اجعلها أقصر، لا تذكر الميزانية، أضف دائماً توصية لبكرة"
              className="flex-1 text-sm px-3 py-2 rounded-[var(--radius)] border border-border bg-surface"
            />
            <button type="button" onClick={addFeedback} className="text-xs px-3 py-2 rounded-[var(--radius)] bg-on-surface text-surface hover:opacity-90">أضف</button>
          </div>
          {feedback.length > 0 && (
            <ul className="space-y-1">
              {feedback.map((f) => (
                <li key={f.id} className={`flex items-start gap-2 p-2 rounded-[var(--radius)] ${f.active ? 'bg-surface-secondary/60' : 'bg-surface-secondary/20 opacity-60 line-through'}`}>
                  <span className="flex-1 text-sm text-on-surface">{f.text}</span>
                  <span className="text-[10px] text-on-surface-muted whitespace-nowrap">{f.source} · {f.createdAt.slice(0, 10)}</span>
                  <button
                    type="button"
                    onClick={() => setFeedback((arr) => arr.map((x) => x.id === f.id ? { ...x, active: !x.active } : x))}
                    className="text-xs px-1 text-on-surface-secondary hover:bg-surface-secondary rounded"
                    title={f.active ? 'تعطيل' : 'تفعيل'}
                  >{f.active ? '◉' : '○'}</button>
                  <button
                    type="button"
                    onClick={() => setFeedback((arr) => arr.filter((x) => x.id !== f.id))}
                    className="text-xs px-1 text-red-600 hover:bg-red-50 rounded"
                    title="حذف"
                  >×</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <div className="text-xs text-red-600">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-[var(--radius)] bg-surface-secondary text-on-surface hover:bg-surface-tertiary">إلغاء</button>
          <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-[var(--radius)] bg-on-surface text-surface hover:opacity-90 disabled:opacity-50">
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function PreviewModal({ subject, html, bodyMarkdown, onClose }: { subject: string; html: string; bodyMarkdown?: string; onClose: () => void }) {
  // R15-#23 — keyboard shortcuts: Esc closes, Ctrl/Cmd+P prints.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        // Delegate to the PDF button logic by re-opening a print window.
        const w = window.open('', '_blank', 'noopener,noreferrer');
        if (!w) return;
        w.document.open(); w.document.write(html); w.document.close();
        w.onload = () => { try { w.focus(); w.print(); } catch { /* noop */ } };
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [html, onClose]);

  const safeStem = () => `${subject.replace(/[^\p{L}\p{N} _-]+/gu, '').slice(0, 80) || 'report'}-${new Date().toISOString().slice(0, 10)}`;
  const download = (content: string, mime: string, ext: string) => {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeStem()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const downloadHtml = () => download(html, 'text/html', 'html');
  const downloadTxt = () => download(
    // Prefer raw markdown when the server provided it (R14-#15); else
    // fall back to a stripped-HTML approximation so the button still
    // works on older previews.
    bodyMarkdown ?? html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                       .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                       .replace(/<[^>]+>/g, '')
                       .replace(/\n{3,}/g, '\n\n')
                       .trim(),
    'text/plain',
    'md',
  );

  // PDF via the browser's print dialog — opens the HTML in a fresh
  // window and triggers window.print() once loaded. User picks "Save
  // as PDF" in the dialog. No jspdf/puppeteer dependency needed.
  //
  // R15-#21 fallback: if `window.open` returns null (popup blocker,
  // strict CSP) or `print()` throws, we download the HTML as a blob
  // instead so the user still has a tangible file to print from the
  // OS viewer.
  const printPdf = () => {
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
      // Blocked — fall back to blob download.
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.onload = () => {
      try { w.focus(); w.print(); } catch {
        // print() forbidden (rare: some sandboxed CSPs) — the user
        // still has the HTML in the new window; they can Ctrl+P manually.
      }
    };
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-[var(--radius)] border border-border max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between gap-2">
          <h3 className="font-semibold text-on-surface truncate">{subject}</h3>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={printPdf} title="طباعة كـ PDF" className="text-sm px-3 py-1 rounded-[var(--radius)] bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary">PDF</button>
            <button onClick={downloadHtml} title="تنزيل HTML للأرشفة" className="text-sm px-3 py-1 rounded-[var(--radius)] bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary">HTML</button>
            <button onClick={downloadTxt} title="تنزيل نص/Markdown للأرشفة" className="text-sm px-3 py-1 rounded-[var(--radius)] bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary">TXT</button>
            <button onClick={onClose} className="text-sm px-3 py-1 rounded-[var(--radius)] bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary">إغلاق</button>
          </div>
        </div>
        <iframe srcDoc={html} title="preview" className="flex-1 w-full bg-white" />
      </div>
    </div>
  );
}

function TemplatePicker({ onClose, onPick }: { onClose: () => void; onPick: (t: ReportTemplate) => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-[var(--radius)] border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-on-surface">اختر قالب تقرير</h3>
        <p className="text-xs text-on-surface-secondary">يملأ لك الأعدادات جاهزة — تقدر تعدّلها بعدين.</p>
        <div className="grid gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => onPick(t)}
              className="text-start p-3 rounded-[var(--radius)] border border-border hover:border-on-surface bg-surface hover:bg-surface-secondary transition-colors"
            >
              <div className="font-medium text-on-surface">{t.label}</div>
              <div className="mt-1 text-xs text-on-surface-secondary leading-relaxed">{t.description}</div>
              <div className="mt-1 text-[11px] text-on-surface-muted">
                {t.schedule.type === 'daily' ? `يومي ${String(t.schedule.hour).padStart(2, '0')}:${String(t.schedule.minute).padStart(2, '0')}`
                  : t.schedule.type === 'weekly' ? `${WEEKDAYS[t.schedule.dayOfWeek ?? 0]} ${String(t.schedule.hour).padStart(2, '0')}:${String(t.schedule.minute).padStart(2, '0')}`
                  : t.schedule.type}
                {t.sections && ` · ${t.sections.length} قسم`}
                {` · ${AGENT_OPTIONS.find((a) => a.id === t.signedBy)?.label ?? t.signedBy}`}
              </div>
            </button>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-[var(--radius)] bg-surface-secondary text-on-surface">إلغاء</button>
        </div>
      </div>
    </div>
  );
}
