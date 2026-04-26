'use client';

import { Loader2, Check, RotateCcw, AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';

/**
 * Returns the approximate height to reserve at the bottom of a form when
 * the SaveBar is currently mounted, so the last field is never covered.
 * Returns 0 when nothing would be rendered.
 *
 * Host pattern:
 *   const saveBarPad = useSaveBarHeight(dirty || !!successMessage);
 *   return (<form>{...fields}<div style={{ height: saveBarPad }} aria-hidden />...</form>);
 */
export function useSaveBarHeight(visible: boolean): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!visible) { setH(0); return; }
    const approx = window.innerWidth < 768 ? 96 : 112;
    setH(approx);
  }, [visible]);
  return h;
}

/**
 * Unified save bar for all settings pages. Sticks to the bottom when there
 * are unsaved changes, hides when clean. Provides Save + Discard + Ctrl+S.
 */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  errorMessage,
  successMessage,
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void | Promise<void>;
  onDiscard?: () => void;
  errorMessage?: string | null;
  successMessage?: string | null;
}) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  // Ctrl+S keyboard shortcut to save
  useEffect(() => {
    if (!dirty) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, onSave]);

  if (!dirty && !successMessage) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-4 md:px-8 md:pb-6 pointer-events-none">
      <div className="max-w-3xl mx-auto pointer-events-auto">
        <div className={cn(
          'rounded-xl border shadow-2xl backdrop-blur px-4 py-3 flex items-center gap-3 animate-[fadeInUp_0.2s_ease-out]',
          successMessage && !dirty
            ? 'bg-success/95 border-success text-white'
            : errorMessage
              ? 'bg-error/95 border-error text-white'
              : 'bg-warning/95 border-warning text-white',
        )}>
          {successMessage && !dirty ? (
            <>
              <Check className="h-4 w-4 shrink-0" />
              <p className="text-sm flex-1">{successMessage}</p>
            </>
          ) : errorMessage ? (
            <>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p className="text-sm flex-1">{errorMessage}</p>
              <button
                onClick={onSave}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded bg-white/20 hover:bg-white/30 disabled:opacity-50"
              >
                {isRTL ? 'حاول مجدداً' : 'Retry'}
              </button>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p className="text-sm flex-1">
                {isRTL ? 'لديك تغييرات غير محفوظة' : 'You have unsaved changes'}
              </p>
              {onDiscard && (
                <button
                  onClick={() => {
                    if (confirm(isRTL ? 'تجاهل التغييرات؟' : 'Discard changes?')) onDiscard();
                  }}
                  disabled={saving}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  {isRTL ? 'تجاهل' : 'Discard'}
                </button>
              )}
              <button
                onClick={onSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded bg-white text-warning hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                {isRTL ? 'احفظ (Ctrl+S)' : 'Save (Ctrl+S)'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
