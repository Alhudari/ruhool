'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/app';

interface DirtyEntry {
  id: string;
  dirty: boolean;
  message?: string;
}

interface GuardedNavContextValue {
  register: (id: string, dirty: boolean, message?: string) => void;
  unregister: (id: string) => void;
  isAnyDirty: () => boolean;
  confirmLeave: () => Promise<boolean>;
}

const GuardedNavContext = createContext<GuardedNavContextValue | null>(null);

// Feature-flag via NEXT_PUBLIC_GUARDED_NAV. Default on in dev, off elsewhere
// unless the variable is explicitly "true".
export function isGuardedNavEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_GUARDED_NAV;
  if (v === 'false') return false;
  if (v === 'true') return true;
  return process.env.NODE_ENV === 'development';
}

export function GuardedNavProvider({ children }: { children: React.ReactNode }) {
  const entriesRef = useRef(new Map<string, DirtyEntry>());
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [pendingPrompt, setPendingPrompt] = useState<{ message: string; resolve: (ok: boolean) => void } | null>(null);

  const register = useCallback((id: string, dirty: boolean, message?: string) => {
    if (dirty) entriesRef.current.set(id, { id, dirty, message });
    else entriesRef.current.delete(id);
  }, []);

  const unregister = useCallback((id: string) => {
    entriesRef.current.delete(id);
  }, []);

  const isAnyDirty = useCallback(() => {
    for (const e of entriesRef.current.values()) if (e.dirty) return true;
    return false;
  }, []);

  const confirmLeave = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      if (!isAnyDirty()) { resolve(true); return; }
      const firstMessage = [...entriesRef.current.values()].find((e) => e.dirty)?.message;
      const message = firstMessage ?? (isRTL
        ? 'لديك تغييرات غير محفوظة. هل تريد المغادرة؟'
        : 'You have unsaved changes. Leave anyway?');
      setPendingPrompt({ message, resolve });
    });
  }, [isAnyDirty, isRTL]);

  const value = useMemo<GuardedNavContextValue>(
    () => ({ register, unregister, isAnyDirty, confirmLeave }),
    [register, unregister, isAnyDirty, confirmLeave],
  );

  // Escape key = cancel leave when a prompt is visible.
  useEffect(() => {
    if (!pendingPrompt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pendingPrompt.resolve(false);
        setPendingPrompt(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingPrompt]);

  return (
    <GuardedNavContext.Provider value={value}>
      {children}
      {pendingPrompt && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guarded-nav-title"
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          <div className="max-w-md w-full rounded-2xl border border-border bg-surface shadow-2xl p-5">
            <h2 id="guarded-nav-title" className="text-base font-semibold text-on-surface mb-2">
              {isRTL ? 'تغييرات غير محفوظة' : 'Unsaved changes'}
            </h2>
            <p className="text-sm text-on-surface-secondary mb-5">{pendingPrompt.message}</p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { pendingPrompt.resolve(false); setPendingPrompt(null); }}
                className="px-4 py-1.5 rounded-[var(--radius)] text-sm border border-border text-on-surface-secondary hover:bg-surface-secondary"
                autoFocus
              >
                {isRTL ? 'ابقَ' : 'Stay'}
              </button>
              <button
                onClick={() => { pendingPrompt.resolve(true); setPendingPrompt(null); }}
                className="px-4 py-1.5 rounded-[var(--radius)] text-sm bg-warning text-white hover:opacity-90"
              >
                {isRTL ? 'غادر' : 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </GuardedNavContext.Provider>
  );
}

export function useGuardedNav(): GuardedNavContextValue {
  const ctx = useContext(GuardedNavContext);
  if (!ctx) {
    // Provider not mounted — return no-op behavior so callers degrade gracefully.
    return {
      register: () => {},
      unregister: () => {},
      isAnyDirty: () => false,
      confirmLeave: () => Promise.resolve(true),
    };
  }
  return ctx;
}
