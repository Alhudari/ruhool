'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────
export interface ToastOptions {
  message: string;
  type?: 'success' | 'warning' | 'error' | 'info';
  duration?: number;      // ms — default 4000
  undo?: () => void | Promise<void>;
  undoLabel?: string;     // default 'تراجع / Undo'
}

interface ToastItem extends ToastOptions {
  id: string;
  createdAt: number;
}

interface ToastContextValue {
  showToast: (opts: ToastOptions) => void;
}

// ── Context ───────────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

// ── Single Toast ──────────────────────────────────────────────────────
const TYPE_CONFIG = {
  success: { icon: CheckCircle2, bar: 'bg-success', text: 'text-success', iconCls: 'text-success' },
  warning: { icon: AlertTriangle, bar: 'bg-warning', text: 'text-warning', iconCls: 'text-warning' },
  error:   { icon: XCircle,      bar: 'bg-error',   text: 'text-error',   iconCls: 'text-error' },
  info:    { icon: Info,         bar: 'bg-info',    text: 'text-info',    iconCls: 'text-info' },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const type = toast.type ?? 'info';
  const cfg = TYPE_CONFIG[type];
  const Icon = cfg.icon;
  const duration = toast.duration ?? 4000;
  const undoDuration = 5000; // undo window always 5s

  const [undoUsed, setUndoUsed] = useState(false);
  const [progress, setProgress] = useState(100);

  // Progress bar countdown
  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(pct);
      if (pct === 0) clearInterval(tick);
    }, 50);
    return () => clearInterval(tick);
  }, [duration]);

  // Undo expires after undoDuration
  const [undoExpired, setUndoExpired] = useState(false);
  useEffect(() => {
    if (!toast.undo) return;
    const t = setTimeout(() => setUndoExpired(true), undoDuration);
    return () => clearTimeout(t);
  }, [toast.undo]);

  const handleUndo = async () => {
    if (undoUsed || undoExpired) return;
    setUndoUsed(true);
    await toast.undo?.();
    onDismiss(toast.id);
  };

  return (
    <div className={cn(
      'relative flex items-start gap-3 rounded-xl border bg-surface shadow-2xl px-4 py-3.5 min-w-[280px] max-w-[420px]',
      'toast-enter'
    )}>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-surface-tertiary overflow-hidden">
        <div
          className={cn('h-full transition-all ease-linear', cfg.bar)}
          style={{ width: `${progress}%`, transitionDuration: '50ms' }}
        />
      </div>

      <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', cfg.iconCls)} />

      <div className="flex-1 min-w-0">
        <p className="text-sm text-on-surface leading-snug">{toast.message}</p>
        {toast.undo && !undoUsed && !undoExpired && (
          <button
            onClick={handleUndo}
            className={cn('mt-1.5 text-xs font-semibold flex items-center gap-1 hover:underline', cfg.text)}
          >
            <RotateCcw className="h-3 w-3" />
            {toast.undoLabel ?? 'تراجع / Undo'}
          </button>
        )}
        {undoUsed && (
          <p className="mt-1 text-xs text-on-surface-tertiary">↩ تم التراجع</p>
        )}
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        className="p-0.5 rounded text-on-surface-tertiary hover:text-on-surface shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Container ─────────────────────────────────────────────────────────
function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const showToast = useCallback((opts: ToastOptions) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const duration = opts.duration ?? 4000;
    const item: ToastItem = { ...opts, id, createdAt: Date.now() };
    // Keep max 3
    setToasts(prev => [...prev.slice(-2), item]);
    const t = setTimeout(() => dismiss(id), duration + 500);
    timers.current.set(id, t);
  }, [dismiss]);

  // Cleanup on unmount
  useEffect(() => {
    const map = timers.current;
    return () => { map.forEach(t => clearTimeout(t)); };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
