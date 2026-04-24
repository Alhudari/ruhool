import { AppShell } from '@/components/layout/app-shell';
import { SessionsList } from '@/components/reading/SessionsList';
import { SourceSelector } from '@/components/reading/SourceSelector';

export default function ShwashaPage() {
  return (
    <AppShell>
      <SessionsList />
      <SourceSelector />
    </AppShell>
  );
}
