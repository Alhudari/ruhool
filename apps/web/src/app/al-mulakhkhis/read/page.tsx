import { AppShell } from '@/components/layout/app-shell';
import { ReadingPage } from '@/components/reading/ReadingPage';

interface ReadPageProps {
  searchParams: { session?: string };
}

export default function ShwashaReadPage({ searchParams }: ReadPageProps) {
  return (
    <AppShell>
      <ReadingPage sessionId={searchParams.session ?? null} />
    </AppShell>
  );
}
