'use client';

import { GuardedNavProvider } from '@/lib/navigation/GuardedNavProvider';
import { ToastProvider } from './Toast';

export function ClientRoot({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <GuardedNavProvider>
        {children}
      </GuardedNavProvider>
    </ToastProvider>
  );
}
