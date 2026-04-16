'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AgentsListPage } from '@/components/agents/agents-list-page';

export default function Agents() {
  return (
    <AppShell>
      <AgentsListPage />
    </AppShell>
  );
}
