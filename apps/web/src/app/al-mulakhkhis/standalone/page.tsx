import { AppShell } from '@/components/layout/app-shell';
import { StandaloneNotesPage } from '@/components/reading/standalone/StandaloneNotesPage';

export default function StandaloneRoute({ searchParams }: { searchParams: { session?: string } }) {
  return (
    <AppShell>
      <StandaloneNotesPage initialSessionId={searchParams.session ?? null} />
    </AppShell>
  );
}
