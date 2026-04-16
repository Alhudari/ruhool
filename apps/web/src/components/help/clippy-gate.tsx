'use client';

/**
 * UX-07 (AUDIT.md): gate ClippyFloating behind a localStorage flag so it can
 * be opted-out. Defaults to enabled so existing behavior is preserved.
 * Query param `?clippy=0` forces off; `?clippy=1` forces on and persists.
 * The Settings page reads/writes `ruhool.clippy.enabled`.
 */
import { useEffect, useState } from 'react';
import { ClippyFloating } from './clippy-floating';

const STORAGE_KEY = 'ruhool.clippy.enabled';

export function ClippyGate() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const qp = params.get('clippy');
      if (qp === '0') {
        localStorage.setItem(STORAGE_KEY, '0');
        setEnabled(false);
        return;
      }
      if (qp === '1') {
        localStorage.setItem(STORAGE_KEY, '1');
        setEnabled(true);
        return;
      }
      const stored = localStorage.getItem(STORAGE_KEY);
      setEnabled(stored === null ? true : stored === '1');
    } catch {
      setEnabled(true);
    }
  }, []);

  if (!enabled) return null;
  return <ClippyFloating />;
}
