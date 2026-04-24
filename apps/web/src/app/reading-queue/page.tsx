import { AppShell } from '@/components/layout/app-shell';
import { ReadingQueuePage } from '@/components/reading-queue/ReadingQueuePage';

export default function ReadingQueueRoute() {
  return (
    <AppShell>
      <ReadingQueuePage />
    </AppShell>
  );
}
