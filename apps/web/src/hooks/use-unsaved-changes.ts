'use client';

import { useEffect, useId } from 'react';
import { useGuardedNav, isGuardedNavEnabled } from '@/lib/navigation/GuardedNavProvider';

/**
 * Warns the user if they try to leave the page (close tab, refresh, navigate
 * away) with unsaved changes. Combine with the SaveBar component for a
 * unified settings UX.
 *
 * Three layers of protection:
 *  1. Registers with `GuardedNavProvider` — `useGuardedRouter().push` will
 *     prompt before actually routing.
 *  2. `beforeunload` — tab close / hard refresh / external navigation.
 *  3. Anchor-click capture — legacy guard for `<a>` tags inside the app
 *     that don't go through useGuardedRouter.
 *
 * Layer 1 is the new, proper guard; layers 2 and 3 remain as defense in
 * depth so legacy callers keep their existing behavior.
 */
export function useUnsavedChanges(dirty: boolean, opts?: { message?: string }) {
  const id = useId();
  const guard = useGuardedNav();
  const message = opts?.message ?? 'You have unsaved changes. Leave anyway?';

  // Layer 1: register with guarded-nav.
  useEffect(() => {
    if (!isGuardedNavEnabled()) return;
    guard.register(id, dirty, opts?.message);
    return () => guard.unregister(id);
  }, [dirty, id, guard, opts?.message]);

  // Layer 2: beforeunload for tab close / refresh / external nav.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, message]);

  // Layer 3: anchor-click capture. Kept as a fallback for any legacy <a>
  // that bypasses useGuardedRouter.
  useEffect(() => {
    if (!dirty) return;
    const onClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const anchor = target?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || anchor.target === '_blank') return;
      if (href.startsWith('http')) return;
      if (!confirm(message)) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty, message]);
}
