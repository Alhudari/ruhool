'use client';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { ReadingPage } from '@/components/reading/ReadingPage';
import { SessionsList } from '@/components/reading/SessionsList';
import { SourceSelector } from '@/components/reading/SourceSelector';

export default function ShwashaRoute() {
  const params = useSearchParams();
  const sessionId = params.get('session');
  return (
    <AppShell>
      {sessionId
        ? <ReadingPage sessionId={sessionId} />
        : <><SessionsList /><SourceSelector /></>}
    </AppShell>
  );
}
