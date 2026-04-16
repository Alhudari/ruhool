'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AgentBuilderPage } from '@/components/agents/agent-builder-page';

export default function NewAgent() {
  return (
    <AppShell>
      <AgentBuilderPage />
    </AppShell>
  );
}
