'use client';

import { AppShell } from '@/components/layout/app-shell';
import { WorkflowsPage } from '@/components/workflows/workflows-page';

export default function Workflows() {
  return (
    <AppShell>
      <WorkflowsPage />
    </AppShell>
  );
}
