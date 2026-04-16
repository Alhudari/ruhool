'use client';

import { AppShell } from '@/components/layout/app-shell';
import { FilesPage } from '@/components/files/files-page';

export default function Files() {
  return (
    <AppShell>
      <FilesPage />
    </AppShell>
  );
}
