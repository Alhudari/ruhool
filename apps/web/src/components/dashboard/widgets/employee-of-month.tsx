'use client';

import { useEffect, useState } from 'react';
import { Trophy, Award, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface Score { agentId: string; score: number; good: number; bad: number; runsCompleted: number; tasksCompleted: number }

const AGENT_LABELS: Record<string, { ar: string; en: string; emoji: string }> = {
  manager: { ar: 'الراعي', en: 'Al-Rai', emoji: '🤠' },
  research: { ar: 'الباحث', en: 'Al-Bahith', emoji: '🔬' },
  'reading-helper': { ar: 'المُلخِّص', en: 'Al-Mulakhkhis', emoji: '📖' },
  'writing-critic': { ar: 'الناقد', en: 'Al-Naqid', emoji: '✍️' },
  comparator: { ar: 'المُقارِن', en: 'Al-Muqarin', emoji: '⚖️' },
  architect: { ar: 'المصمم', en: 'Al-Musammim', emoji: '🏗️' },
  'content-creator': { ar: 'السارد', en: 'Al-Sarid', emoji: '🎨' },
  creative: { ar: 'المبدع', en: "Al-Mubdi'", emoji: '🎬' },
  'tasks-agent': { ar: 'مهام', en: 'Maham', emoji: '✅' },
  analyst: { ar: 'المحلل', en: 'Analyst', emoji: '📊' },
  munazzim: { ar: 'المنظّم', en: 'Munazzim', emoji: '📂' },
  mushakhkhis: { ar: 'المشخّص', en: 'Mushakhkhis', emoji: '🩺' },
  fatin: { ar: 'الفطين', en: 'Al-Fatin', emoji: '👁️' },
  playmaker: { ar: 'المُمرر', en: 'PlayMaker', emoji: '🧭' },
  clippy: { ar: 'Clippy', en: 'Clippy', emoji: '📎' },
};

export function EmployeeOfMonthWidget() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [data, setData] = useState<{ employeeOfDay: Score | null; employeeOfMonth: Score | null; dailyRanking: Score[]; monthlyRanking: Score[] } | null>(null);

  useEffect(() => {
    apiFetch<typeof data>('/api/awards').then(setData).catch(() => {});
  }, []);

  if (!data) return null;
  const eom = data.employeeOfMonth;
  const eod = data.employeeOfDay;
  const labelOf = (id?: string) => id ? (AGENT_LABELS[id] || { ar: id, en: id, emoji: '🤖' }) : null;
  const eomLabel = labelOf(eom?.agentId);
  const eodLabel = labelOf(eod?.agentId);

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={16} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-on-surface">{isRTL ? 'أفضل وكيل' : 'Top Agents'}</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Employee of Month */}
        <div className="rounded-[var(--radius)] bg-amber-500/10 border border-amber-500/30 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400 font-bold mb-1">{isRTL ? 'وكيل الشهر' : 'Month'}</div>
          <div className="text-3xl mb-1">{eomLabel?.emoji || '🏆'}</div>
          <div className="text-sm font-bold text-on-surface">{eomLabel?.[language] || (isRTL ? '—' : '—')}</div>
          {eom && (
            <div className="flex items-center justify-center gap-2 mt-1 text-[10px] text-on-surface-tertiary">
              <span className="inline-flex items-center gap-0.5"><Star size={9} className="text-amber-500" /> {eom.score.toFixed(0)}</span>
              <span>· {eom.runsCompleted}🎯</span>
              <span>· {eom.tasksCompleted}✓</span>
            </div>
          )}
        </div>

        {/* Employee of Day */}
        <div className="rounded-[var(--radius)] bg-emerald-500/10 border border-emerald-500/30 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 font-bold mb-1">{isRTL ? 'وكيل اليوم' : 'Today'}</div>
          <div className="text-3xl mb-1">{eodLabel?.emoji || '⭐'}</div>
          <div className="text-sm font-bold text-on-surface">{eodLabel?.[language] || (isRTL ? '—' : '—')}</div>
          {eod && (
            <div className="flex items-center justify-center gap-2 mt-1 text-[10px] text-on-surface-tertiary">
              <span className="inline-flex items-center gap-0.5"><Star size={9} className="text-emerald-500" /> {eod.score.toFixed(0)}</span>
              <span>· {eod.runsCompleted}🎯</span>
              <span>· {eod.tasksCompleted}✓</span>
            </div>
          )}
        </div>
      </div>

      {data.monthlyRanking.length > 1 && (
        <div className="mt-3 pt-3 border-t border-border space-y-1">
          <div className="text-[10px] uppercase text-on-surface-tertiary mb-1">{isRTL ? 'الترتيب الشهري' : 'Monthly Ranking'}</div>
          {data.monthlyRanking.slice(0, 5).map((s, i) => {
            const lbl = labelOf(s.agentId);
            return (
              <div key={s.agentId} className="flex items-center gap-2 text-xs">
                <span className={cn('w-5 text-end font-mono', i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-600' : 'text-on-surface-tertiary')}>
                  {i + 1}.
                </span>
                <span>{lbl?.emoji}</span>
                <span className="flex-1 truncate">{lbl?.[language]}</span>
                <span className="text-on-surface-tertiary">{s.score.toFixed(0)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
