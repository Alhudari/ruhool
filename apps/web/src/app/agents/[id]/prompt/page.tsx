'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AgentDetailPage } from '@/components/agents/agent-detail-page';

export const dynamic = 'force-dynamic';

// Convenience route — `/agents/{id}/prompt` opens the agent detail page with
// the prompt section in focus. Same component as `/agents/{id}` so editing the
// prompt works end-to-end.
export default function AgentPromptPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <AgentDetailPage agentId={params.id} initialTab="prompt" />
    </AppShell>
  );
}
