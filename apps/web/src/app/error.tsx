'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[ruhool] route error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-surface text-on-surface">
      <div className="max-w-md w-full space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-on-surface-secondary" lang="ar" dir="rtl">
          حدث خطأ غير متوقع
        </p>
        {error.message && (
          <pre className="text-xs text-on-surface-tertiary bg-surface-secondary p-3 rounded overflow-auto text-start">
            {error.message}
          </pre>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 rounded bg-accent text-on-accent hover:bg-accent-hover text-sm"
        >
          Try again / إعادة المحاولة
        </button>
      </div>
    </div>
  );
}
