'use client';

import { AppShell } from '@/components/layout/app-shell';
import { LibraryPageView } from '@/components/library/library-page';

export default function Library() {
  return (
    <AppShell>
      <LibraryPageView />
    </AppShell>
  );
}
