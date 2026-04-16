'use client';

import { useState, useEffect } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface HealthResponse {
  status: string;
  name: string;
  version: string;
}

export function SystemStatusWidget() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    const start = Date.now();
    apiFetch<HealthResponse>('/api/health')
      .then((data) => {
        setHealth(data);
        setLatency(Date.now() - start);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const isHealthy = health?.status === 'ok';

  return (
    <div className="border border-border rounded-[var(--radius-lg)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={18} className="text-accent" />
        <h2 className="text-sm font-medium text-on-surface">
          {isRTL ? 'حالة النظام' : 'System Status'}
        </h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-on-surface-tertiary py-4 justify-center">
          <Loader2 size={14} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-error" />
            <span className="text-sm font-medium text-error">
              {isRTL ? 'غير متصل' : 'Offline'}
            </span>
          </div>
          <p className="text-xs text-on-surface-tertiary">
            {isRTL
              ? 'تعذر الاتصال بخادم API'
              : 'Could not connect to API server'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-3 h-3 rounded-full',
              isHealthy ? 'bg-success' : 'bg-error'
            )} />
            <span className={cn(
              'text-sm font-medium',
              isHealthy ? 'text-success' : 'text-error'
            )}>
              {isHealthy
                ? (isRTL ? 'متصل' : 'Online')
                : (isRTL ? 'خطأ' : 'Error')}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-on-surface-tertiary">{isRTL ? 'الإصدار' : 'Version'}</span>
              <span className="text-on-surface-secondary">{health?.version}</span>
            </div>
            {latency !== null && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-on-surface-tertiary">{isRTL ? 'زمن الاستجابة' : 'Latency'}</span>
                <span className="text-on-surface-secondary">{latency}ms</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-on-surface-tertiary">API</span>
              <span className="text-on-surface-secondary">{health?.name}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
