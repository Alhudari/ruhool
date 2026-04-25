'use client';

import { useState, useEffect } from 'react';
import { X, Clock, DollarSign, Activity, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface AgentEvent {
  id: string; runId: string; type: string; at: number;
  agentId?: string; durationMs?: number;
  tokens?: { in?: number; out?: number; costUsd?: number };
  payload?: Record<string, unknown>;
}

interface TranscriptMessage {
  role: string; agentId?: string; content: string; createdAt: string;
}

interface TranscriptData {
  runId: string; status: string;
  transcript: string;
  events: AgentEvent[];
  messages: TranscriptMessage[];
  summary: { totalCostUsd: number; totalTokensIn: number; totalTokensOut: number; stepCount: number; errorCount: number; durationMs: number } | null;
}

const EVENT_COLORS: Record<string, string> = {
  'run.started':          'text-blue-500',
  'run.completed':        'text-green-500',
  'run.failed':           'text-red-500',
  'step.completed':       'text-emerald-500',
  'step.failed':          'text-red-400',
  'delegation.started':   'text-purple-500',
  'delegation.completed': 'text-purple-400',
  'model.call.started':   'text-amber-500',
  'model.call.completed': 'text-amber-400',
  'budget.warning':       'text-orange-500',
  'budget.exceeded':      'text-red-600',
};

export function TranscriptDrawer({ runId, onClose }: { runId: string; onClose: () => void }) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [data, setData] = useState<TranscriptData | null>(null);
  const [tab, setTab] = useState<'events' | 'messages'>('events');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<TranscriptData>(`/api/runs/${runId}/transcript`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [runId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative z-10 w-full max-w-lg h-full bg-surface border-s border-border shadow-xl flex flex-col',
          isRTL && 'border-s-0 border-e'
        )}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-on-surface">
              {isRTL ? 'سجل التشغيل' : 'Run Transcript'}
            </h2>
            <p className="text-[10px] text-on-surface-tertiary font-mono mt-0.5">{runId.slice(0, 12)}…</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-on-surface-tertiary hover:text-on-surface">
            <X size={16} />
          </button>
        </div>

        {/* Summary bar */}
        {data?.summary && (
          <div className="flex items-center gap-4 px-4 py-2 bg-surface-secondary border-b border-border text-[10px] text-on-surface-secondary shrink-0">
            <span className="flex items-center gap-1">
              <Clock size={10} /> {(data.summary.durationMs / 1000).toFixed(1)}s
            </span>
            <span className="flex items-center gap-1">
              <Activity size={10} /> {data.summary.stepCount} steps
            </span>
            <span className="flex items-center gap-1">
              <DollarSign size={10} /> ${data.summary.totalCostUsd.toFixed(4)}
            </span>
            {data.summary.errorCount > 0 && (
              <span className="text-red-500">{data.summary.errorCount} errors</span>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(['events', 'messages'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 text-xs py-2 px-3 transition-colors',
                tab === t ? 'text-accent border-b-2 border-accent' : 'text-on-surface-secondary hover:text-on-surface'
              )}
            >
              {t === 'events'
                ? (isRTL ? `أحداث (${data?.events.length ?? 0})` : `Events (${data?.events.length ?? 0})`)
                : (isRTL ? `رسائل (${data?.messages.length ?? 0})` : `Messages (${data?.messages.length ?? 0})`)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <p className="text-xs text-on-surface-tertiary text-center py-8 animate-pulse">
              {isRTL ? 'جاري التحميل…' : 'Loading…'}
            </p>
          )}

          {!loading && tab === 'events' && (
            <div className="space-y-1">
              {(data?.events ?? []).length === 0 && (
                <p className="text-xs text-on-surface-tertiary italic text-center py-8">
                  {isRTL ? 'لا أحداث مسجّلة' : 'No events recorded yet'}
                </p>
              )}
              {(data?.events ?? []).map(e => (
                <div key={e.id} className="flex items-start gap-2 py-1">
                  <span className="text-[10px] text-on-surface-tertiary font-mono shrink-0 mt-0.5 w-16">
                    {new Date(e.at).toISOString().slice(11, 19)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={cn('text-[11px] font-medium', EVENT_COLORS[e.type] ?? 'text-on-surface-secondary')}>
                      {e.type}
                    </span>
                    {e.agentId && (
                      <span className="text-[10px] text-on-surface-tertiary ms-1.5">[{e.agentId}]</span>
                    )}
                    {e.durationMs && (
                      <span className="text-[10px] text-on-surface-tertiary ms-1.5">{e.durationMs}ms</span>
                    )}
                    {e.tokens?.costUsd && (
                      <span className="text-[10px] text-amber-500 ms-1.5">${e.tokens.costUsd.toFixed(4)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'messages' && (
            <div className="space-y-3">
              {(data?.messages ?? []).map((m, i) => (
                <div key={i} className={cn('flex flex-col gap-0.5', m.role === 'user' ? 'items-end' : 'items-start')}>
                  <p className="text-[10px] text-on-surface-tertiary px-1">
                    {m.role === 'user' ? (isRTL ? 'أنت' : 'You') : (m.agentId ?? 'agent')}
                  </p>
                  <div className={cn(
                    'max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed',
                    m.role === 'user' ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-on-surface'
                  )}>
                    {m.content.slice(0, 500)}{m.content.length > 500 ? '…' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
