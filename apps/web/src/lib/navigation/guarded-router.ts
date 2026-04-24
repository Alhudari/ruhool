'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useGuardedNav, isGuardedNavEnabled } from './GuardedNavProvider';

/**
 * Drop-in replacement for `useRouter()` that consults the guarded-nav
 * registry before actually routing. If any registered dirty form rejects
 * the leave (user clicked "Stay"), the navigation is swallowed.
 *
 * Usage:
 *   const router = useGuardedRouter();
 *   router.push('/somewhere');
 */
export function useGuardedRouter() {
  const router = useRouter();
  const guard = useGuardedNav();

  const push = useCallback(async (href: string) => {
    if (!isGuardedNavEnabled() || !guard.isAnyDirty()) {
      router.push(href);
      return;
    }
    const ok = await guard.confirmLeave();
    if (ok) router.push(href);
  }, [router, guard]);

  const replace = useCallback(async (href: string) => {
    if (!isGuardedNavEnabled() || !guard.isAnyDirty()) {
      router.replace(href);
      return;
    }
    const ok = await guard.confirmLeave();
    if (ok) router.replace(href);
  }, [router, guard]);

  const back = useCallback(async () => {
    if (!isGuardedNavEnabled() || !guard.isAnyDirty()) {
      router.back();
      return;
    }
    const ok = await guard.confirmLeave();
    if (ok) router.back();
  }, [router, guard]);

  const refresh = useCallback(() => router.refresh(), [router]);
  const prefetch = useCallback((href: string) => router.prefetch(href), [router]);

  return { push, replace, back, refresh, prefetch };
}
