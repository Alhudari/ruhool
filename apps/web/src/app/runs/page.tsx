'use client';

import { AppShell } from '@/components/layout/app-shell';
import { RunsView } from '@/components/runs/runs-view';

export default function RunsPage() {
  return (
    <AppShell>
      <RunsView />
    </AppShell>
  );
}
