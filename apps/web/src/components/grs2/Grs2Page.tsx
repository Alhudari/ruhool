'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2, ChevronDown, ChevronUp, ClipboardList, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/app';

interface Grs2Reminder {
  needsGrs2: boolean;
  urgentFollowUp: boolean;
  currentMonth: string;
  daysUntilMonthEnd: number;
}

interface Grs2Record {
  id: string;
  month: string;
  status: 'not_started' | 'submitted' | 'supervisor_approved' | 'student_confirmed' | 'university_approved';
  progress: number;
  content?: string;
  supervisorResponse?: string;
  submittedAt?: string;
  supervisorApprovedAt?: string;
  studentConfirmedAt?: string;
  universityApprovedAt?: string;
}

const STAGES: Array<{
  key: Grs2Record['status'];
  pct: number;
  labelEn: string;
  labelAr: string;
}> = [
  { key: 'not_started',        pct: 0,   labelEn: 'Not Started',        labelAr: 'لم يبدأ' },
  { key: 'submitted',          pct: 25,  labelEn: 'Submitted',          labelAr: 'مُقدَّم' },
  { key: 'supervisor_approved',pct: 75,  labelEn: 'Supervisor Approved',labelAr: 'موافقة المشرف' },
  { key: 'university_approved',pct: 100, labelEn: 'University Approved',labelAr: 'موافقة الجامعة' },
];

function monthLabel(month: string): string {
  try {
    const [y, m] = month.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  } catch { return month; }
}

function statusColor(status: Grs2Record['status']): string {
  switch (status) {
    case 'not_started': return 'text-muted-foreground';
    case 'submitted': return 'text-amber-600 dark:text-amber-400';
    case 'supervisor_approved':
    case 'student_confirmed': return 'text-blue-600 dark:text-blue-400';
    case 'university_approved': return 'text-emerald-600 dark:text-emerald-400';
    default: return '';
  }
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={cn(
          'h-full rounded-full transition-all duration-500',
          progress === 100 ? 'bg-emerald-500' : progress >= 75 ? 'bg-blue-500' : progress >= 25 ? 'bg-amber-500' : 'bg-muted-foreground/30',
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function StageStep({ label, pct, current, done }: { label: string; pct: number; current: boolean; done: boolean }) {
  return (
    <div className={cn('flex flex-col items-center gap-1 text-xs', done ? 'text-primary' : current ? 'text-foreground font-medium' : 'text-muted-foreground')}>
      {done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : current ? <Circle className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 opacity-30" />}
      <span className="text-center leading-tight max-w-[60px]">{pct}%</span>
      <span className="text-center leading-tight max-w-[80px]">{label}</span>
    </div>
  );
}

export function Grs2Page() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [current, setCurrent] = useState<Grs2Record | null>(null);
  const [history, setHistory] = useState<Grs2Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contentDraft, setContentDraft] = useState('');
  const [supervisorDraft, setSupervisorDraft] = useState('');
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [reminder, setReminder] = useState<Grs2Reminder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cur, all, rem] = await Promise.all([
        apiFetch<Grs2Record>('/api/grs2/current'),
        apiFetch<Grs2Record[]>('/api/grs2'),
        apiFetch<Grs2Reminder>('/api/grs2/reminders').catch(() => null),
      ]);
      setCurrent(cur);
      setContentDraft(cur.content ?? '');
      setSupervisorDraft(cur.supervisorResponse ?? '');
      setHistory(
        all
          .filter(r => r.month !== cur.month)
          .sort((a, b) => b.month.localeCompare(a.month))
      );
      setReminder(rem);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveContent = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const updated = await apiFetch<Grs2Record>(`/api/grs2/${current.month}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contentDraft, supervisorResponse: supervisorDraft }),
      });
      setCurrent(updated);
    } finally { setSaving(false); }
  };

  const doAction = async (endpoint: string, body?: object) => {
    if (!current) return;
    setSaving(true);
    try {
      const updated = await apiFetch<Grs2Record>(`/api/grs2/${current.month}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      setCurrent(updated);
      if (endpoint === 'submit') setContentDraft(updated.content ?? contentDraft);
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stageIndex = STAGES.findIndex(s => s.key === current?.status) ?? 0;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto w-full" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header — follows page header pattern */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-accent/10 text-accent flex items-center justify-center shrink-0">
          <ClipboardList size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-on-surface">{isRTL ? 'تقارير GRS2 الشهرية' : 'Monthly GRS2 Reports'}</h1>
          <p className="text-xs text-on-surface-tertiary">
            {isRTL ? 'تتبع تقديم تقرير التقدم الشهري — جامعة برمنغهام' : 'Track monthly progress report submission — University of Birmingham'}
          </p>
        </div>
      </div>

      {/* Overdue warning */}
      {reminder && (reminder.needsGrs2 || reminder.urgentFollowUp) && (
        <div className={cn(
          'rounded-xl border p-4 flex items-start gap-3',
          reminder.urgentFollowUp ? 'bg-red-500/10 border-red-500/20' : 'bg-amber-500/10 border-amber-500/20'
        )}>
          <AlertTriangle className={cn('h-5 w-5 shrink-0 mt-0.5', reminder.urgentFollowUp ? 'text-red-500' : 'text-amber-500')} />
          <div>
            <p className={cn('text-sm font-semibold', reminder.urgentFollowUp ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>
              {isRTL
                ? (reminder.urgentFollowUp
                    ? `متابعة عاجلة — ${reminder.daysUntilMonthEnd} أيام متبقية`
                    : `تقرير شهر ${reminder.currentMonth} لم يُقدَّم بعد`)
                : (reminder.urgentFollowUp
                    ? `Urgent follow-up — ${reminder.daysUntilMonthEnd} days remaining`
                    : `Report for ${reminder.currentMonth} not submitted yet`)}
            </p>
            <p className="text-xs text-on-surface-secondary mt-0.5">
              {isRTL ? 'يُوصى بإتمامه قبل نهاية الشهر' : 'Recommended to complete before month end'}
            </p>
          </div>
        </div>
      )}

      {/* Current month card */}
      {current && (
        <div className="rounded-xl border bg-card shadow-sm p-5 space-y-5">
          {/* Month + status */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{isRTL ? 'الشهر الحالي' : 'Current Month'}</p>
              <h2 className="text-xl font-semibold">{monthLabel(current.month)}</h2>
            </div>
            <span className={cn('text-sm font-semibold px-3 py-1 rounded-full border', statusColor(current.status))}>
              {STAGES.find(s => s.key === current.status)?.[isRTL ? 'labelAr' : 'labelEn'] ?? current.status}
            </span>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <ProgressBar progress={current.progress} />
            <div className="flex justify-between">
              {STAGES.map((s, i) => (
                <StageStep
                  key={s.key}
                  label={isRTL ? s.labelAr : s.labelEn}
                  pct={s.pct}
                  current={i === stageIndex}
                  done={i < stageIndex}
                />
              ))}
            </div>
          </div>

          {/* Dates row */}
          {(current.submittedAt || current.supervisorApprovedAt || current.studentConfirmedAt || current.universityApprovedAt) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground border rounded-lg p-3 bg-muted/30">
              {current.submittedAt && (
                <div>
                  <p className="font-medium text-foreground">{isRTL ? 'التقديم' : 'Submitted'}</p>
                  <p>{new Date(current.submittedAt).toLocaleDateString('en-GB')}</p>
                </div>
              )}
              {current.supervisorApprovedAt && (
                <div>
                  <p className="font-medium text-foreground">{isRTL ? 'موافقة المشرف' : 'Supervisor'}</p>
                  <p>{new Date(current.supervisorApprovedAt).toLocaleDateString('en-GB')}</p>
                </div>
              )}
              {current.studentConfirmedAt && (
                <div>
                  <p className="font-medium text-foreground">{isRTL ? 'تأكيد الطالب' : 'Student Confirmed'}</p>
                  <p>{new Date(current.studentConfirmedAt).toLocaleDateString('en-GB')}</p>
                </div>
              )}
              {current.universityApprovedAt && (
                <div>
                  <p className="font-medium text-foreground">{isRTL ? 'موافقة الجامعة' : 'University'}</p>
                  <p>{new Date(current.universityApprovedAt).toLocaleDateString('en-GB')}</p>
                </div>
              )}
            </div>
          )}

          {/* Content textarea */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
              {isRTL ? 'محتوى تقرير GRS2' : 'GRS2 Report Content'}
            </label>
            <textarea
              value={contentDraft}
              onChange={e => setContentDraft(e.target.value)}
              rows={5}
              dir="auto"
              placeholder={isRTL ? 'اكتب ما أنجزته هذا الشهر…' : 'Describe your progress this month…'}
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Supervisor response textarea */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
              {isRTL ? 'ملاحظات المشرف' : 'Supervisor Response'}
            </label>
            <textarea
              value={supervisorDraft}
              onChange={e => setSupervisorDraft(e.target.value)}
              rows={3}
              dir="auto"
              placeholder={isRTL ? 'ملاحظات د. ريتشارد…' : "Dr Richard's comments…"}
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Save content button */}
          <div className="flex justify-end">
            <button
              onClick={saveContent}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {isRTL ? 'حفظ المحتوى' : 'Save Content'}
            </button>
          </div>

          {/* Action buttons */}
          <div className="border-t pt-4 flex flex-wrap gap-2">
            {current.status === 'not_started' && (
              <button
                onClick={() => doAction('submit', { content: contentDraft })}
                disabled={saving || !contentDraft.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isRTL ? 'تقديم GRS2 ← 25%' : 'Submit GRS2 → 25%'}
              </button>
            )}
            {current.status === 'submitted' && (
              <button
                onClick={() => doAction('supervisor-approve', { supervisorResponse: supervisorDraft })}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isRTL ? 'موافقة المشرف ← 75%' : 'Supervisor Approved → 75%'}
              </button>
            )}
            {(current.status === 'supervisor_approved' || current.status === 'student_confirmed') && (
              <button
                onClick={() => doAction('university-approve')}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isRTL ? 'موافقة الجامعة ← 100%' : 'University Approved → 100%'}
              </button>
            )}
            {current.status === 'university_approved' && (
              <div className="inline-flex items-center gap-2 rounded-md bg-emerald-500/10 px-4 py-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                {isRTL ? 'مكتمل ✓' : 'Completed ✓'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {isRTL ? 'السجل السابق' : 'History'}
          </h3>
          {history.map(rec => (
            <div key={rec.id} className="rounded-lg border bg-card overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-accent"
                onClick={() => setExpandedMonth(expandedMonth === rec.month ? null : rec.month)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{monthLabel(rec.month)}</span>
                  <span className={cn('text-xs', statusColor(rec.status))}>
                    {STAGES.find(s => s.key === rec.status)?.[isRTL ? 'labelAr' : 'labelEn']}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', rec.progress === 100 ? 'bg-emerald-500' : rec.progress >= 75 ? 'bg-blue-500' : 'bg-amber-500')}
                      style={{ width: `${rec.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{rec.progress}%</span>
                  {expandedMonth === rec.month ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {expandedMonth === rec.month && (
                <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
                  {rec.content && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">{isRTL ? 'المحتوى' : 'Content'}</p>
                      <p className="text-sm whitespace-pre-wrap">{rec.content}</p>
                    </div>
                  )}
                  {rec.supervisorResponse && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">{isRTL ? 'ملاحظات المشرف' : 'Supervisor Response'}</p>
                      <p className="text-sm whitespace-pre-wrap">{rec.supervisorResponse}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    {rec.submittedAt && <div><p className="font-medium text-foreground">{isRTL ? 'التقديم' : 'Submitted'}</p><p>{new Date(rec.submittedAt).toLocaleDateString('en-GB')}</p></div>}
                    {rec.supervisorApprovedAt && <div><p className="font-medium text-foreground">{isRTL ? 'المشرف' : 'Supervisor'}</p><p>{new Date(rec.supervisorApprovedAt).toLocaleDateString('en-GB')}</p></div>}
                    {rec.universityApprovedAt && <div><p className="font-medium text-foreground">{isRTL ? 'الجامعة' : 'University'}</p><p>{new Date(rec.universityApprovedAt).toLocaleDateString('en-GB')}</p></div>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
