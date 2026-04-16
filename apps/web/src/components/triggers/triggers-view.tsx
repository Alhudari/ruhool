'use client';

import { useEffect, useState } from 'react';
import { Zap, Plus, Copy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ClippyHelp } from '@/components/help/clippy-help';

const TRIG_HELP = [
  { illustration: '⚡', title: { ar: 'محفّز Webhook', en: 'Webhook Trigger' },
    body: { ar: 'عنوان URL ينادي وكيلاً لما تستلم طلب POST. مثال: Zapier → Ruhool.', en: 'A URL that fires an agent on POST. E.g., Zapier → Ruhool.' } },
  { illustration: '📋', title: { ar: 'كيف أستخدمه؟', en: 'How to use?' },
    body: { ar: 'أنشئ محفّزاً، انسخ رابطه، الصقه في أي خدمة خارجية. لما تستلم حدثاً، الوكيل المختار يبدأ حلقة تشغيل.', en: 'Create a trigger, copy its URL, paste it into any external service. On event, the chosen agent starts a run loop.' } },
  { illustration: '🧠', title: { ar: 'مثال حقيقي', en: 'Real example' },
    body: { ar: 'Gmail → Zapier → محفّز الفطين. يصل إيميل → يلخصه → يضيف مهمة.', en: 'Gmail → Zapier → Fatin trigger. Email arrives → summarized → task added.' } },
];

interface Trigger {
  id: string;
  name: string;
  kind: 'webhook' | 'email' | 'schedule';
  enabled: boolean;
  endpoint?: string;
  targetAgent: string;
  instructions?: string;
  createdAt: string;
  lastFiredAt?: string;
  fireCount?: number;
}

export function TriggersView() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [targetAgent, setTargetAgent] = useState('manager');
  const [instructions, setInstructions] = useState('');

  const load = () => apiFetch<{ triggers: Trigger[] }>('/api/triggers').then((r) => setTriggers(r.triggers || []));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    await apiFetch('/api/triggers', { method: 'POST', body: JSON.stringify({ name: name.trim(), kind: 'webhook', targetAgent, instructions }) });
    setName(''); setInstructions(''); setShowNew(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm(isRTL ? 'حذف هذا المحفّز؟' : 'Delete this trigger?')) return;
    await apiFetch(`/api/triggers/${id}`, { method: 'DELETE' });
    load();
  };

  const webhookUrl = (t: Trigger) => `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'}/api/triggers/webhook/${t.id}`;

  return (
    <div className={cn('max-w-5xl mx-auto px-6 py-6 space-y-4', isRTL && 'rtl')} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-amber-500/10 text-amber-500 flex items-center justify-center">
          <Zap size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold">{isRTL ? 'المحفّزات' : 'Workflow Triggers'}</h1>
          <p className="text-xs text-on-surface-tertiary">{isRTL ? 'أحداث خارجية تشغّل وكيلاً تلقائياً' : 'External events that fire an agent automatically'}</p>
        </div>
        <div className="ms-auto flex items-center gap-1">
          <ClippyHelp steps={TRIG_HELP} title={{ ar: 'المحفّزات', en: 'Triggers' }} />
          <button onClick={() => setShowNew(!showNew)} className="px-3 py-1.5 rounded bg-accent text-on-accent text-xs font-semibold inline-flex items-center gap-1"><Plus size={12} /> {isRTL ? 'جديد' : 'New'}</button>
        </div>
      </div>

      {showNew && (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isRTL ? 'اسم المحفّز' : 'Trigger name'} className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm" />
          <div className="flex items-center gap-2 text-xs">
            <label>{isRTL ? 'الوكيل الهدف:' : 'Target agent:'}</label>
            <select value={targetAgent} onChange={(e) => setTargetAgent(e.target.value)} className="bg-input border border-border rounded px-2 py-1">
              <option value="manager">manager</option>
              <option value="analyst">analyst</option>
              <option value="research">research</option>
              <option value="fatin">fatin</option>
              <option value="tasks-agent">tasks-agent</option>
            </select>
          </div>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={isRTL ? 'تعليمات اختيارية يستلمها الوكيل مع كل حدث' : 'Optional instructions prepended on each event'} rows={2} className="w-full px-3 py-2 bg-input border border-border rounded text-sm" />
          <div className="flex gap-2">
            <button onClick={create} className="px-3 py-1.5 rounded bg-accent text-on-accent text-xs font-semibold">{isRTL ? 'أنشئ' : 'Create'}</button>
            <button onClick={() => setShowNew(false)} className="px-3 py-1.5 rounded bg-surface border border-border text-xs">{isRTL ? 'إلغاء' : 'Cancel'}</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {triggers.length === 0 && <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-8 text-center text-xs text-on-surface-tertiary">{isRTL ? 'لا محفّزات بعد' : 'No triggers yet'}</div>}
        {triggers.map((t) => (
          <div key={t.id} className="rounded-[var(--radius-lg)] border border-border bg-surface p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('w-2 h-2 rounded-full', t.enabled ? 'bg-emerald-500' : 'bg-gray-400')} />
              <span className="text-sm font-semibold">{t.name}</span>
              <span className="text-[10px] text-on-surface-tertiary">{t.kind} → @{t.targetAgent}</span>
              <span className="ms-auto text-[10px] text-on-surface-tertiary">{t.fireCount || 0} fires</span>
              <button onClick={() => remove(t.id)} className="text-red-500 p-1 hover:bg-red-500/10 rounded"><Trash2 size={12} /></button>
            </div>
            {t.kind === 'webhook' && (
              <div className="flex items-center gap-2 mt-2 text-[10px] font-mono bg-surface-secondary rounded px-2 py-1">
                <span className="truncate flex-1">{webhookUrl(t)}</span>
                <button onClick={() => navigator.clipboard.writeText(webhookUrl(t))} className="p-1 hover:bg-surface rounded"><Copy size={10} /></button>
              </div>
            )}
            {t.instructions && <div className="text-xs text-on-surface-secondary mt-2 italic">{t.instructions}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
