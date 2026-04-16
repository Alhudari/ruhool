'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Upload, Trash2, ExternalLink, Link as LinkIcon, Calendar, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch, API_BASE_URL } from '@/lib/api';
import type { SubscriptionRecord, SubCategoryRecord, PaymentCardRecord } from './analyst-page';

interface Props {
  isRTL: boolean;
  categories: SubCategoryRecord[];
  cards: PaymentCardRecord[];
  initial?: SubscriptionRecord | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

const CYCLES: Array<SubscriptionRecord['billingCycle']> = ['monthly', 'yearly', 'quarterly', 'one-time', 'pay-as-you-go'];
const STATUSES: Array<SubscriptionRecord['status']> = ['active', 'paused', 'cancelled'];

const cycleLabel = (c: SubscriptionRecord['billingCycle'], isRTL: boolean) => {
  const map: Record<string, { ar: string; en: string }> = {
    monthly: { ar: 'شهري', en: 'Monthly' },
    yearly: { ar: 'سنوي', en: 'Yearly' },
    quarterly: { ar: 'ربعي', en: 'Quarterly' },
    'one-time': { ar: 'مرة واحدة', en: 'One-time' },
    'pay-as-you-go': { ar: 'حسب الاستخدام', en: 'Pay as you go' },
  };
  return isRTL ? map[c].ar : map[c].en;
};

const statusLabel = (s: SubscriptionRecord['status'], isRTL: boolean) => {
  const map: Record<string, { ar: string; en: string }> = {
    active: { ar: 'نشط', en: 'Active' },
    paused: { ar: 'متوقف', en: 'Paused' },
    cancelled: { ar: 'ملغي', en: 'Cancelled' },
  };
  return isRTL ? map[s].ar : map[s].en;
};

export function SubscriptionForm({ isRTL, categories, cards, initial, onClose, onSaved, onDeleted }: Props) {
  const [tab, setTab] = useState<'details' | 'history' | 'files'>('details');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localAttachments, setLocalAttachments] = useState(initial?.attachments || []);

  const [form, setForm] = useState({
    name: initial?.name || '',
    provider: initial?.provider || '',
    categoryId: initial?.categoryId || '',
    billingCycle: initial?.billingCycle || 'monthly',
    amount: initial?.amount?.toString() || '',
    currency: initial?.currency || 'USD',
    startDate: initial?.startDate?.slice(0, 10) || '',
    nextBillingDate: initial?.nextBillingDate?.slice(0, 10) || '',
    dashboardUrl: initial?.dashboardUrl || '',
    paymentCardId: initial?.paymentCardId || '',
    notes: initial?.notes || '',
    status: initial?.status || 'active',
  });

  const isApiLinked = !!initial?.linkedApiField;
  const isEdit = !!initial;

  const update = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: val }));
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        provider: form.provider || undefined,
        categoryId: form.categoryId || undefined,
        billingCycle: form.billingCycle,
        amount: parseFloat(form.amount) || 0,
        currency: form.currency || 'USD',
        startDate: form.startDate || undefined,
        nextBillingDate: form.nextBillingDate || undefined,
        dashboardUrl: form.dashboardUrl || undefined,
        paymentCardId: form.paymentCardId || undefined,
        notes: form.notes || undefined,
        status: form.status,
      };
      if (!isApiLinked) body.name = form.name;

      if (isEdit) {
        await apiFetch(`/api/subscriptions/${initial!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        body.name = form.name;
        await apiFetch('/api/subscriptions', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!initial) return;
    setBusy(true);
    try {
      await apiFetch(`/api/subscriptions/${initial.id}`, { method: 'DELETE' });
      onDeleted?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    if (!initial) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/subscriptions/${initial.id}/attachments`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) throw new Error('Upload failed');
      const updated = await apiFetch<SubscriptionRecord>(`/api/subscriptions/${initial.id}`).catch(() => null);
      if (updated) setLocalAttachments(updated.attachments || []);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setLocalAttachments(initial?.attachments || []);
  }, [initial]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-[var(--radius-lg)] w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-on-surface">
              {isEdit ? (isRTL ? 'تعديل اشتراك' : 'Edit Subscription') : (isRTL ? 'اشتراك جديد' : 'New Subscription')}
            </h2>
            {isApiLinked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-accent/10 text-accent border border-accent/30">
                <LinkIcon size={10} />
                {isRTL ? 'مربوط بـAPI' : 'API linked'}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-secondary text-on-surface-tertiary">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        {isEdit && (
          <div className="flex gap-2 px-5 border-b border-border">
            {[
              { id: 'details', label: isRTL ? 'التفاصيل' : 'Details' },
              { id: 'history', label: isRTL ? 'تاريخ الأسعار' : 'Price History' },
              { id: 'files', label: isRTL ? 'ملفات مرفقة' : 'Attachments' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={cn(
                  'px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
                  tab === t.id ? 'border-accent text-accent font-medium' : 'border-transparent text-on-surface-secondary hover:text-on-surface',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {err && <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-[var(--radius)] px-3 py-2">{err}</div>}

          {tab === 'details' && (
            <>
              <Field label={isRTL ? 'الاسم' : 'Name'}>
                <input
                  value={form.name}
                  disabled={isApiLinked}
                  onChange={(e) => update('name', e.target.value)}
                  className={inputCls}
                  placeholder={isRTL ? 'مثل: Netflix' : 'e.g. Netflix'}
                />
              </Field>

              <Field label={isRTL ? 'المزود' : 'Provider'}>
                <input value={form.provider} onChange={(e) => update('provider', e.target.value)} className={inputCls} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={isRTL ? 'التصنيف' : 'Category'}>
                  <select value={form.categoryId} onChange={(e) => update('categoryId', e.target.value)} className={inputCls}>
                    <option value="">{isRTL ? '— بدون —' : '— none —'}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{isRTL ? c.name.ar : c.name.en}</option>
                    ))}
                  </select>
                </Field>

                <Field label={isRTL ? 'البطاقة' : 'Card'}>
                  <select value={form.paymentCardId} onChange={(e) => update('paymentCardId', e.target.value)} className={inputCls}>
                    <option value="">{isRTL ? '— بدون —' : '— none —'}</option>
                    {cards.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}{c.last4 ? ` ••${c.last4}` : ''}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label={isRTL ? 'دورة الفوترة' : 'Billing Cycle'}>
                <div className="flex gap-1.5 flex-wrap">
                  {CYCLES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => update('billingCycle', c)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs border transition-colors',
                        form.billingCycle === c
                          ? 'bg-accent text-on-accent border-accent'
                          : 'bg-surface text-on-surface-secondary border-border hover:border-accent/40',
                      )}
                    >
                      {cycleLabel(c, isRTL)}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={isRTL ? 'المبلغ' : 'Amount'}>
                  <div className="relative">
                    <DollarSign size={14} className={cn('absolute top-1/2 -translate-y-1/2 text-on-surface-tertiary', isRTL ? 'right-3' : 'left-3')} />
                    <input
                      type="number"
                      step="0.01"
                      value={form.amount}
                      onChange={(e) => update('amount', e.target.value)}
                      className={cn(inputCls, isRTL ? 'pr-9' : 'pl-9')}
                    />
                  </div>
                </Field>
                <Field label={isRTL ? 'العملة' : 'Currency'}>
                  <input value={form.currency} onChange={(e) => update('currency', e.target.value.toUpperCase())} className={inputCls} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={isRTL ? 'تاريخ البداية' : 'Start Date'}>
                  <input type="date" value={form.startDate} onChange={(e) => update('startDate', e.target.value)} className={inputCls} />
                </Field>
                <Field label={isRTL ? 'الفوترة القادمة' : 'Next Billing'}>
                  <input type="date" value={form.nextBillingDate} onChange={(e) => update('nextBillingDate', e.target.value)} className={inputCls} />
                </Field>
              </div>

              <Field label={isRTL ? 'رابط اللوحة' : 'Dashboard URL'}>
                <input value={form.dashboardUrl} onChange={(e) => update('dashboardUrl', e.target.value)} className={inputCls} placeholder="https://..." />
              </Field>

              <Field label={isRTL ? 'الحالة' : 'Status'}>
                <div className="flex gap-1.5">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => update('status', s)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs border transition-colors',
                        form.status === s
                          ? 'bg-accent text-on-accent border-accent'
                          : 'bg-surface text-on-surface-secondary border-border hover:border-accent/40',
                      )}
                    >
                      {statusLabel(s, isRTL)}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label={isRTL ? 'ملاحظات' : 'Notes'}>
                <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={3} className={cn(inputCls, 'resize-none')} />
              </Field>
            </>
          )}

          {tab === 'history' && (
            <div className="space-y-2">
              {!initial?.priceHistory?.length ? (
                <p className="text-sm text-on-surface-tertiary text-center py-8">{isRTL ? 'لا يوجد تاريخ أسعار' : 'No price history yet'}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-on-surface-tertiary uppercase">
                    <tr>
                      <th className="text-start py-2">{isRTL ? 'التاريخ' : 'Date'}</th>
                      <th className="text-start py-2">{isRTL ? 'المبلغ' : 'Amount'}</th>
                      <th className="text-start py-2">{isRTL ? 'السبب' : 'Reason'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {initial.priceHistory.map((p, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-2 text-on-surface-secondary"><Calendar size={12} className="inline me-1" />{new Date(p.date).toLocaleDateString()}</td>
                        <td className="py-2 text-on-surface">{p.amount} {p.currency}</td>
                        <td className="py-2 text-on-surface-tertiary">{p.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'files' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-on-surface-secondary">{isRTL ? 'الملفات المرفقة' : 'Attached files'}</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 px-3 rounded-[var(--radius)] bg-accent text-on-accent text-xs flex items-center gap-1.5 hover:bg-accent-hover"
                >
                  <Upload size={12} />
                  {isRTL ? 'رفع' : 'Upload'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f);
                    e.target.value = '';
                  }}
                />
              </div>
              {!localAttachments.length ? (
                <p className="text-sm text-on-surface-tertiary text-center py-8">{isRTL ? 'لا توجد ملفات' : 'No attachments'}</p>
              ) : (
                <ul className="space-y-1.5">
                  {localAttachments.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-sm">
                      <span className="flex-1 text-on-surface truncate">{a.filename}</span>
                      <span className="text-xs text-on-surface-tertiary">{new Date(a.uploadedAt).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-border">
          {isEdit && (
            <button
              onClick={() => (confirmDel ? del() : setConfirmDel(true))}
              disabled={busy}
              className={cn(
                'h-9 px-3 rounded-[var(--radius)] text-sm flex items-center gap-1.5 transition-colors',
                confirmDel ? 'bg-red-500 text-white hover:bg-red-600' : 'text-red-500 hover:bg-red-500/10',
              )}
            >
              <Trash2 size={14} />
              {confirmDel ? (isRTL ? 'تأكيد الحذف' : 'Confirm delete') : (isRTL ? 'حذف' : 'Delete')}
            </button>
          )}
          {isEdit && initial?.dashboardUrl && (
            <button
              onClick={() => window.open(initial.dashboardUrl, '_blank')}
              className="h-9 px-3 rounded-[var(--radius)] text-sm flex items-center gap-1.5 text-on-surface-secondary hover:bg-surface-secondary"
            >
              <ExternalLink size={14} />
              {isRTL ? 'فتح اللوحة' : 'Open dashboard'}
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="h-9 px-4 rounded-[var(--radius)] text-sm text-on-surface-secondary hover:bg-surface-secondary">
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            onClick={save}
            disabled={busy || !form.name.trim()}
            className="h-9 px-4 rounded-[var(--radius)] bg-accent text-on-accent text-sm hover:bg-accent-hover disabled:opacity-50"
          >
            {isRTL ? 'حفظ' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full h-9 rounded-[var(--radius)] bg-surface border border-border text-sm text-on-surface px-3 focus:border-accent outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-on-surface-secondary font-medium">{label}</span>
      {children}
    </label>
  );
}
