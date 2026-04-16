'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AgentDetailPage } from '@/components/agents/agent-detail-page';

export const dynamic = 'force-dynamic';

export default function AgentDetail({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <AgentDetailPage agentId={params.id} />
    </AppShell>
  );
}
