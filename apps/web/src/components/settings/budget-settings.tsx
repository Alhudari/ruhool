'use client';

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Bell, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { SaveBar, useSaveBarHeight } from '@/components/settings/save-bar';

interface BudgetData {
  monthlyBudget: number;
  budgetAlertPercent: number;
}

interface UsageSummary {
  totalCost: number;
}

export function BudgetSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [monthlyBudget, setMonthlyBudget] = useState(0);
  const [budgetAlertPercent, setBudgetAlertPercent] = useState(75);
  const [original, setOriginal] = useState<BudgetData | null>(null);
  const [currentSpend, setCurrentSpend] = useState(0);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBudget = useCallback(async () => {
    setLoading(true);
    try {
      const [budget, usage] = await Promise.all([
        apiFetch<BudgetData>('/api/settings/budget'),
        apiFetch<UsageSummary>('/api/usage/summary'),
      ]);
      setMonthlyBudget(budget.monthlyBudget);
      setBudgetAlertPercent(budget.budgetAlertPercent);
      setOriginal({ monthlyBudget: budget.monthlyBudget, budgetAlertPercent: budget.budgetAlertPercent });
      setCurrentSpend(usage.totalCost);
    } catch {
      // Use defaults if endpoint not available yet
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBudget();
  }, [fetchBudget]);

  const dirty =
    original !== null &&
    (monthlyBudget !== original.monthlyBudget || budgetAlertPercent !== original.budgetAlertPercent);
  useUnsavedChanges(dirty);
  const saveBarPad = useSaveBarHeight(dirty || !!successMessage);

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
      await apiFetch('/api/settings/budget', {
        method: 'PUT',
        body: JSON.stringify({ monthlyBudget, budgetAlertPercent }),
      });
      setOriginal({ monthlyBudget, budgetAlertPercent });
      setSuccessMessage(isRTL ? 'حُفظ' : 'Saved');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : (isRTL ? 'فشل الحفظ' : 'Save failed'));
    }
    setSaving(false);
  };

  const discard = () => {
    if (!original) return;
    setMonthlyBudget(original.monthlyBudget);
    setBudgetAlertPercent(original.budgetAlertPercent);
    setErrorMessage(null);
  };

  const budgetUsedPercent =
    monthlyBudget > 0 ? Math.min((currentSpend / monthlyBudget) * 100, 100) : 0;
  const isOverAlert = monthlyBudget > 0 && budgetUsedPercent >= budgetAlertPercent;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-on-surface mb-1">
          {isRTL ? 'ميزانية الاستخدام' : 'Usage Budget'}
        </h2>
        <p className="text-sm text-on-surface-secondary">
          {isRTL
            ? 'حدد ميزانية شهرية وتلقَّ تنبيهات عند الاقتراب منها'
            : 'Set a monthly budget and get alerts when approaching the limit'}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-on-surface-tertiary" />
        </div>
      ) : (
        <>
          {/* Monthly Budget Input */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-on-surface">
              <DollarSign size={16} className="text-on-surface-secondary" />
              {isRTL ? 'الميزانية الشهرية ($)' : 'Monthly Budget ($)'}
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(Number(e.target.value))}
              placeholder={isRTL ? '0 = غير محدود' : '0 = unlimited'}
              className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <p className="text-xs text-on-surface-tertiary">
              {isRTL ? 'اضبط على 0 لإزالة حد الميزانية' : 'Set to 0 for no budget limit'}
            </p>
          </div>

          {/* Alert Threshold Input */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-on-surface">
              <Bell size={16} className="text-on-surface-secondary" />
              {isRTL ? 'حد التنبيه (%)' : 'Alert Threshold (%)'}
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={budgetAlertPercent}
              onChange={(e) => setBudgetAlertPercent(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <p className="text-xs text-on-surface-tertiary">
              {isRTL
                ? 'ستتلقى تنبيهًا عند الوصول لهذه النسبة من الميزانية'
                : 'You will be alerted when spending reaches this percentage of your budget'}
            </p>
          </div>

          {/* Progress Bar — Current Month Spend vs Budget */}
          {monthlyBudget > 0 && (
            <div className="space-y-2 p-4 border border-border rounded-[var(--radius-lg)] bg-surface">
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-secondary">
                  {isRTL ? 'الإنفاق هذا الشهر' : 'Current Month Spend'}
                </span>
                <span
                  className={cn(
                    'font-medium tabular-nums',
                    isOverAlert ? 'text-error' : 'text-on-surface'
                  )}
                >
                  ${currentSpend.toFixed(2)} / ${monthlyBudget.toFixed(2)}
                </span>
              </div>

              <div className="w-full h-3 bg-surface-secondary rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    isOverAlert ? 'bg-error' : 'bg-accent'
                  )}
                  style={{ width: `${budgetUsedPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-on-surface-tertiary">
                <span>{budgetUsedPercent.toFixed(1)}%</span>
                <span>
                  {isRTL ? `التنبيه عند ${budgetAlertPercent}%` : `Alert at ${budgetAlertPercent}%`}
                </span>
              </div>

              {isOverAlert && (
                <p className="text-xs text-error mt-1">
                  {isRTL
                    ? 'تحذير: تجاوزت حد التنبيه للميزانية!'
                    : 'Warning: You have exceeded your budget alert threshold!'}
                </p>
              )}
            </div>
          )}
        </>
      )}

      <div style={{ height: saveBarPad }} aria-hidden="true" />
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={discard}
        successMessage={successMessage}
        errorMessage={errorMessage}
      />
    </div>
  );
}
