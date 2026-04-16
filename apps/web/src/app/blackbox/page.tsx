'use client';

import { AppShell } from '@/components/layout/app-shell';
import { BlackBoxPage } from '@/components/blackbox/blackbox-page';

export default function BlackBox() {
  return (
    <AppShell>
      <BlackBoxPage />
    </AppShell>
  );
}
