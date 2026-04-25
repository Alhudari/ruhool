import { AppShell } from '@/components/layout/app-shell';
import { KnowledgeGraph } from '@/components/graph/KnowledgeGraph';

export default function GraphPage() {
  return (
    <AppShell>
      <KnowledgeGraph />
    </AppShell>
  );
}
