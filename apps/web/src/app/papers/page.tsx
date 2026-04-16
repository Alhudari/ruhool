'use client';

import { AppShell } from '@/components/layout/app-shell';
import { PapersPage } from '@/components/papers/papers-page';

export default function Papers() {
  return (
    <AppShell>
      <PapersPage />
    </AppShell>
  );
}
