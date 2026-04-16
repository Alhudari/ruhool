'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface UsageSummary {
  totalCost: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export function ApiUsageWidget() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<UsageSummary>('/api/usage/today')
      .then(setUsage)
      .catch(() => {
        // Fallback to overall summary if /today not available
        apiFetch<UsageSummary>('/api/usage/summary')
          .then(setUsage)
          .catch(() => {});
      })
      .finally(() => setLoading(false));
  }, []);

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;
  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  return (
    <div className="border border-border rounded-[var(--radius-lg)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={18} className="text-accent" />
        <h2 className="text-sm font-medium text-on-surface">
          {isRTL ? 'استخدام API اليوم' : 'API Usage Today'}
        </h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-on-surface-tertiary py-4 justify-center">
          <Loader2 size={14} className="animate-spin" />
        </div>
      ) : !usage ? (
        <p className="text-sm text-on-surface-tertiary py-4 text-center">
          {isRTL ? 'غير متاح' : 'Not available'}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-on-surface-tertiary mb-1">
              {isRTL ? 'التكلفة' : 'Cost'}
            </p>
            <p className="text-lg font-semibold text-on-surface">
              {formatCost(usage.totalCost)}
            </p>
          </div>
          <div>
            <p className="text-xs text-on-surface-tertiary mb-1">
              {isRTL ? 'الاستدعاءات' : 'Calls'}
            </p>
            <p className="text-lg font-semibold text-on-surface">
              {usage.totalCalls}
            </p>
          </div>
          <div>
            <p className="text-xs text-on-surface-tertiary mb-1">
              {isRTL ? 'رموز الإدخال' : 'Input Tokens'}
            </p>
            <p className="text-sm font-medium text-on-surface-secondary">
              {formatTokens(usage.totalInputTokens)}
            </p>
          </div>
          <div>
            <p className="text-xs text-on-surface-tertiary mb-1">
              {isRTL ? 'رموز الإخراج' : 'Output Tokens'}
            </p>
            <p className="text-sm font-medium text-on-surface-secondary">
              {formatTokens(usage.totalOutputTokens)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
