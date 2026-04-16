'use client';

import { useState } from 'react';
import { X, Trash2, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import type { PaymentCardRecord } from './analyst-page';

interface Props {
  isRTL: boolean;
  initial?: PaymentCardRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#0ea5e9'];

export function CardForm({ isRTL, initial, onClose, onSaved }: Props) {
  const [label, setLabel] = useState(initial?.label || '');
  const [last4, setLast4] = useState(initial?.last4 || '');
  const [color, setColor] = useState(initial?.color || COLORS[3]);
  const [notes, setNotes] = useState(initial?.notes || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        label: label.trim(),
        last4: last4.trim() || undefined,
        color,
        notes: notes.trim() || undefined,
      };
      if (initial) {
        await apiFetch(`/api/subscriptions/cards/${initial.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/api/subscriptions/cards', { method: 'POST', body: JSON.stringify(body) });
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
      await apiFetch(`/api/subscriptions/cards/${initial.id}`, { method: 'DELETE' });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-[var(--radius-lg)] w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-on-surface flex items-center gap-2">
            <CreditCard size={18} />
            {initial ? (isRTL ? 'تعديل بطاقة' : 'Edit Card') : (isRTL ? 'بطاقة جديدة' : 'New Card')}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-secondary text-on-surface-tertiary">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {err && <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-[var(--radius)] px-3 py-2">{err}</div>}

          {/* Preview */}
          <div
            className="rounded-[var(--radius-lg)] p-4 text-white shadow-sm"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
          >
            <div className="text-xs opacity-80 mb-4">{isRTL ? 'بطاقة دفع' : 'Payment Card'}</div>
            <div className="text-base font-semibold">{label || (isRTL ? 'اسم البطاقة' : 'Card label')}</div>
            <div className="text-sm font-mono mt-2 opacity-90">•••• •••• •••• {last4 || '••••'}</div>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-on-surface-secondary font-medium">{isRTL ? 'الاسم' : 'Label'}</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder={isRTL ? 'مثل: فيزا العمل' : 'e.g. Work Visa'} />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-on-surface-secondary font-medium">{isRTL ? 'آخر 4 أرقام (اختياري)' : 'Last 4 digits (optional)'}</span>
            <input
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className={inputCls}
              maxLength={4}
              placeholder="1234"
            />
          </label>

          <div className="space-y-1">
            <span className="text-xs text-on-surface-secondary font-medium">{isRTL ? 'اللون' : 'Color'}</span>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-7 h-7 rounded-full border-2 transition-all',
                    color === c ? 'border-on-surface scale-110' : 'border-transparent',
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-on-surface-secondary font-medium">{isRTL ? 'ملاحظات' : 'Notes'}</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(inputCls, 'resize-none h-auto py-2')} />
          </label>
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-border">
          {initial && (
            <button
              onClick={() => (confirmDel ? del() : setConfirmDel(true))}
              disabled={busy}
              className={cn(
                'h-9 px-3 rounded-[var(--radius)] text-sm flex items-center gap-1.5',
                confirmDel ? 'bg-red-500 text-white hover:bg-red-600' : 'text-red-500 hover:bg-red-500/10',
              )}
            >
              <Trash2 size={14} />
              {confirmDel ? (isRTL ? 'تأكيد' : 'Confirm') : (isRTL ? 'حذف' : 'Delete')}
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="h-9 px-4 rounded-[var(--radius)] text-sm text-on-surface-secondary hover:bg-surface-secondary">
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            onClick={save}
            disabled={busy || !label.trim()}
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
