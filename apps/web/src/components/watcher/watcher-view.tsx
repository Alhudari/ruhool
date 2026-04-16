'use client';

import { useEffect, useState } from 'react';
import { Eye, AlertTriangle, Check, RefreshCw, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ClippyHelp } from '@/components/help/clippy-help';

const WATCH_HELP = [
  { illustration: '👁️', title: { ar: 'ما هو الحارس؟', en: 'What is the Watcher?' },
    body: { ar: 'وكيل خلفي يفحص حالة النظام كل 10 دقائق. يكتشف: سلاسل متوقفة، مهام متأخرة، اشتراكات على حافة الحد.', en: 'A background agent scanning system state every 10 min. Detects: stuck chains, overdue tasks, subscription limits.' } },
  { illustration: '🔔', title: { ar: 'التنبيهات', en: 'Alerts' },
    body: { ar: 'كل اكتشاف يظهر هنا. تقدر تحلها يدوياً أو تترك النظام يحلها تلقائياً.', en: 'Each finding shows here. Resolve manually, or let the system auto-resolve.' } },
  { illustration: '🤝', title: { ar: 'يشتغل مع المُمرر', en: 'Works with PlayMaker' },
    body: { ar: 'لما يكتشف الحارس مشكلة، المُمرر يقرر: هل الفطين يعالجها؟ أم الراعي؟', en: 'When Watcher finds an issue, PlayMaker decides: Fatin handles it? Or the Manager?' } },
];

interface Alert {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  createdAt: string;
  resolvedAt?: string;
  conversationId?: string;
  taskId?: string;
}

const SEV_COLOR: Record<string, string> = {
  info: 'text-blue-500 bg-blue-500/10',
  warning: 'text-amber-500 bg-amber-500/10',
  critical: 'text-red-500 bg-red-500/10',
};

export function WatcherView() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [scanning, setScanning] = useState(false);

  const load = () => {
    apiFetch<{ alerts: Alert[] }>(`/api/watcher/alerts?all=${showResolved}`).then((r) => setAlerts(r.alerts || []));
  };
  useEffect(() => { load(); }, [showResolved]);

  const scan = async () => {
    setScanning(true);
    try {
      await apiFetch('/api/watcher/scan', { method: 'POST' });
      load();
    } finally { setScanning(false); }
  };

  const resolve = async (id: string) => {
    await apiFetch(`/api/watcher/alerts/${id}/resolve`, { method: 'POST' });
    load();
  };

  return (
    <div className={cn('max-w-4xl mx-auto px-6 py-6 space-y-4', isRTL && 'rtl')} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-violet-500/10 text-violet-500 flex items-center justify-center">
          <Eye size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold">{isRTL ? 'الحارس' : 'Watcher'}</h1>
          <p className="text-xs text-on-surface-tertiary">{isRTL ? 'وكيل يفحص حالة النظام كل 10 دقائق' : 'Agent that scans system state every 10 min'}</p>
        </div>
        <div className="ms-auto flex items-center gap-1">
          <ClippyHelp steps={WATCH_HELP} title={{ ar: 'الحارس', en: 'Watcher' }} />
          <button onClick={scan} disabled={scanning} className="px-3 py-1.5 rounded bg-accent text-on-accent text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40">
            <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} /> {isRTL ? 'افحص الآن' : 'Scan now'}
          </button>
        </div>
      </div>

      <div className="flex gap-2 text-xs">
        <button onClick={() => setShowResolved(false)} className={cn('px-2.5 py-1 rounded', !showResolved ? 'bg-accent text-on-accent font-semibold' : 'bg-surface border border-border')}>
          {isRTL ? 'نشطة' : 'Active'}
        </button>
        <button onClick={() => setShowResolved(true)} className={cn('px-2.5 py-1 rounded', showResolved ? 'bg-accent text-on-accent font-semibold' : 'bg-surface border border-border')}>
          {isRTL ? 'الكل' : 'All'}
        </button>
      </div>

      <div className="space-y-2">
        {alerts.length === 0 && <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-8 text-center text-xs text-on-surface-tertiary">{isRTL ? 'لا تنبيهات' : 'No alerts'}</div>}
        {alerts.map((a) => {
          const color = SEV_COLOR[a.severity] || SEV_COLOR.info;
          return (
            <div key={a.id} className={cn('rounded-[var(--radius-lg)] border border-border bg-surface p-3 flex items-start gap-3', a.resolvedAt && 'opacity-50')}>
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', color)}>
                <AlertTriangle size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{a.title}</div>
                <div className="text-xs text-on-surface-secondary">{a.description}</div>
                <div className="text-[10px] text-on-surface-tertiary mt-1 flex items-center gap-2">
                  <Clock size={10} /> {new Date(a.createdAt).toLocaleString()}
                  <span className="px-1.5 py-0.5 rounded bg-surface-secondary">{a.kind}</span>
                </div>
              </div>
              {!a.resolvedAt && (
                <button onClick={() => resolve(a.id)} className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded">
                  <Check size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
