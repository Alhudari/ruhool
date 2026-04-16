'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AnalystPageView } from '@/components/analyst/analyst-page';

export default function Analyst() {
  return (
    <AppShell>
      <AnalystPageView />
    </AppShell>
  );
}
