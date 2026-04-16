'use client';

import { useEffect, useState } from 'react';
import { BarChart2, ThumbsUp, ThumbsDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ClippyHelp } from '@/components/help/clippy-help';

const EVAL_HELP = [
  { illustration: '👍👎', title: { ar: 'التقييم الصريح', en: 'Explicit Rating' },
    body: { ar: 'اضغط 👍 أو 👎 على أي رد وكيل في المحادثة. النظام يتعلم من تقييماتك.', en: 'Press 👍 or 👎 on any agent reply. The system learns from your ratings.' } },
  { illustration: '🕵️', title: { ar: 'الإشارات الضمنية', en: 'Implicit Signals' },
    body: { ar: 'لو أعدت صياغة سؤال = إشارة سلبية. لو تابعت محادثتك = إيجابية. كله تلقائي.', en: 'Rephrasing a question = negative. Continuing = positive. All automatic.' } },
  { illustration: '🔁', title: { ar: 'التحسين الذاتي', en: 'Auto-Tuning' },
    body: { ar: 'بعد 50 تقييم لكل وكيل، النظام يقترح تعديلات على الـ prompt ويجربها A/B.', en: 'After 50 ratings per agent, the system proposes prompt tweaks and A/B-tests them.' } },
];

interface Stats { total: number; good: number; bad: number; rephrased: number; abandoned: number; avgLength: number }

export function EvaluatorView() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [byAgent, setByAgent] = useState<Record<string, Stats>>({});

  const load = () => {
    apiFetch<{ byAgent: Record<string, Stats> }>('/api/ratings/summary').then((r) => setByAgent(r.byAgent || {}));
  };
  useEffect(() => { load(); }, []);

  const agents = Object.keys(byAgent).sort();

  return (
    <div className={cn('max-w-5xl mx-auto px-6 py-6 space-y-4', isRTL && 'rtl')} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
          <BarChart2 size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold">{isRTL ? 'المُقيّم' : 'Evaluator'}</h1>
          <p className="text-xs text-on-surface-tertiary">{isRTL ? 'جودة ردود الوكلاء عبر الزمن' : 'Agent response quality over time'}</p>
        </div>
        <button onClick={load} className="ms-auto p-2 rounded hover:bg-surface-secondary"><RefreshCw size={14} /></button>
        <ClippyHelp steps={EVAL_HELP} title={{ ar: 'المُقيّم', en: 'Evaluator' }} />
      </div>

      {agents.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-12 text-center text-xs text-on-surface-tertiary">
          {isRTL ? 'لا تقييمات بعد. اضغط 👍 أو 👎 على أي رد في المحادثات.' : 'No ratings yet. Press 👍 / 👎 on any chat reply.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {agents.map((a) => {
            const s = byAgent[a];
            const rate = s.total > 0 ? (s.good / s.total) * 100 : 0;
            return (
              <div key={a} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold">{a}</div>
                  <div className="text-xs text-on-surface-tertiary">{s.total} {isRTL ? 'تقييم' : 'ratings'}</div>
                </div>
                <div className="h-2 rounded bg-surface-secondary overflow-hidden mb-2">
                  <div className="h-full bg-emerald-500" style={{ width: `${rate}%` }} />
                </div>
                <div className="flex gap-3 text-xs text-on-surface-secondary">
                  <span className="inline-flex items-center gap-1"><ThumbsUp size={12} className="text-emerald-500" /> {s.good}</span>
                  <span className="inline-flex items-center gap-1"><ThumbsDown size={12} className="text-red-500" /> {s.bad}</span>
                  <span className="text-on-surface-tertiary ms-auto">{rate.toFixed(0)}% {isRTL ? 'رضا' : 'satisfaction'}</span>
                </div>
                <div className="text-[10px] text-on-surface-tertiary mt-2">
                  {isRTL ? 'إشارات ضمنية' : 'Implicit signals'}: {s.rephrased} rephrased · {s.abandoned} abandoned · avg {Math.round(s.avgLength)} chars
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
