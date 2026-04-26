'use client';

import { useCallback, useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { Loader2, Send, Network, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CostPill } from '@/components/chat/CostPill';
import { RoutingChainIndicator, type ChainEntry } from '@/components/chat/RoutingChainIndicator';
import { DispatchDetailDrawer, type DispatchDetailStep } from '@/components/chat/DispatchDetailDrawer';

interface DispatchResult {
  dispatchId: string;
  finalText: string;
  language: 'ar' | 'en';
  chain: DispatchDetailStep[];
  totalTokens: { input: number; output: number };
  totalCostUsd: number;
  budgetCapped: boolean;
  errors: Array<{ step: string; agentId?: string; message: string }>;
  durationMs: number;
}

interface DispatchConfig {
  enabled: boolean;
  budgetUsd: number;
  maxFanout: number;
}

export default function DispatchPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [config, setConfig] = useState<DispatchConfig | null>(null);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadConfig = useCallback(() => {
    apiFetch<DispatchConfig>('/api/dispatch/config').then(setConfig).catch(() => setConfig({ enabled: false, budgetUsd: 0.5, maxFanout: 3 }));
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => { loadConfig(); return null; });

  const send = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await apiFetch<DispatchResult>('/api/dispatch/chat', {
        method: 'POST',
        body: JSON.stringify({ message: message.trim(), language }),
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'dispatch failed');
    }
    setLoading(false);
  };

  const chainEntries: ChainEntry[] = (result?.chain ?? []).map((s) => ({
    agentId: s.agentId,
    role: s.role,
    status: s.status,
    displayName: s.displayName,
  }));

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-6 py-8" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="flex items-start gap-3 mb-6">
          <Network size={22} className="text-accent mt-0.5" />
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-on-surface">
              {isRTL ? 'الإسناد الهرمي' : 'Hierarchical Dispatch'}
            </h1>
            <p className="text-xs text-on-surface-tertiary mt-1">
              {isRTL
                ? 'راسل الراعي مباشرةً وراقب كيف توجَّه الرسالة عبر مدير القسم إلى العمال، ثم تُدمج في ردٍّ واحد.'
                : "Message Al-Ra'i directly and watch the dispatch route through the department manager to workers, then synthesize into one reply."}
            </p>
          </div>
        </div>

        {/* Config readout */}
        {config && !config.enabled && (
          <div className="rounded-[var(--radius-lg)] border border-warning/30 bg-warning/10 p-3 mb-4 flex items-start gap-2 text-xs">
            <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-warning font-medium">
                {isRTL ? 'الإسناد الهرمي غير مفعّل' : 'Hierarchical dispatch is disabled'}
              </p>
              <p className="text-on-surface-tertiary mt-1">
                {isRTL
                  ? 'اضبط ENABLE_HIERARCHICAL_DISPATCH=true في ملف .env ثم أعد تشغيل الخادم.'
                  : 'Set ENABLE_HIERARCHICAL_DISPATCH=true in .env and restart the server.'}
              </p>
            </div>
          </div>
        )}

        {config && config.enabled && (
          <div className="text-[11px] text-on-surface-tertiary mb-4">
            {isRTL
              ? `الحد الأقصى للتكلفة: $${config.budgetUsd.toFixed(2)} · عدد العمال المتوازي: ${config.maxFanout}`
              : `Budget cap: $${config.budgetUsd.toFixed(2)} · Max parallel workers: ${config.maxFanout}`}
          </div>
        )}

        {/* Input */}
        <div className="space-y-2">
          <label htmlFor="dispatch-message" className="block text-xs font-semibold text-on-surface-secondary">
            {isRTL ? 'رسالتك للراعي' : "Your message to Al-Ra'i"}
          </label>
          <textarea
            id="dispatch-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            dir="auto"
            placeholder={isRTL
              ? 'مثال: ساعدني أراجع فقرة في مسودتي الأخيرة.'
              : 'Example: help me review the tone of my latest draft.'}
            className="w-full px-3 py-2 bg-surface-secondary border border-border rounded-[var(--radius)] text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-on-surface-tertiary">
              {isRTL ? 'اللغة: ' : 'Language: '}{language.toUpperCase()}
            </span>
            <button
              onClick={send}
              disabled={!message.trim() || loading || !config?.enabled}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:opacity-90 disabled:opacity-40"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {isRTL ? 'أرسل' : 'Send'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-[var(--radius)] border border-error/30 bg-error/10 text-error text-xs px-3 py-2">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-3">
            <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
              <div className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{result.finalText}</div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <CostPill
                  inputTokens={result.totalTokens.input}
                  outputTokens={result.totalTokens.output}
                  usd={result.totalCostUsd}
                />
                <RoutingChainIndicator chain={chainEntries} onOpenDetail={() => setDrawerOpen(true)} />
                {result.budgetCapped && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning inline-flex items-center gap-1">
                    <AlertTriangle size={10} />
                    {isRTL ? 'حد التكلفة' : 'budget cap'}
                  </span>
                )}
              </div>
              {result.errors.length > 0 && (
                <details className="mt-3 text-[11px] text-on-surface-tertiary">
                  <summary className="cursor-pointer hover:text-on-surface-secondary">
                    {isRTL ? `أخطاء (${result.errors.length})` : `errors (${result.errors.length})`}
                  </summary>
                  <ul className="mt-2 ps-4 space-y-1">
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        <bdi className="font-mono">{e.step}</bdi>
                        {e.agentId ? <> · <bdi className="font-mono">{e.agentId}</bdi></> : null}
                        : {e.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        )}
      </div>

      {result && (
        <DispatchDetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          dispatchId={result.dispatchId}
          chain={result.chain}
          totalTokens={result.totalTokens}
          totalCostUsd={result.totalCostUsd}
          budgetCapped={result.budgetCapped}
          durationMs={result.durationMs}
        />
      )}
    </AppShell>
  );
}

void cn;
