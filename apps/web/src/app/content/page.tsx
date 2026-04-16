'use client';

import { AppShell } from '@/components/layout/app-shell';
import { ContentPage } from '@/components/content/content-page';

export default function Content() {
  return (
    <AppShell>
      <ContentPage />
    </AppShell>
  );
}
