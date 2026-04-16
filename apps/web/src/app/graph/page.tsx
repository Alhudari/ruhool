'use client';

import { AppShell } from '@/components/layout/app-shell';
import { KnowledgeGraph } from '@/components/graph/knowledge-graph';

export default function GraphPage() {
  return (
    <AppShell>
      <KnowledgeGraph />
    </AppShell>
  );
}
