'use client';

import { AppShell } from '@/components/layout/app-shell';
import { MemoryGraphView } from '@/components/memory/memory-graph-view';

export default function MemoryPage() {
  return (
    <AppShell>
      <MemoryGraphView />
    </AppShell>
  );
}
