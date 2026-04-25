import { AppShell } from '@/components/layout/app-shell';
import { MeetingsPage } from '@/components/meetings/MeetingsPage';

export default function MeetingsRoute() {
  return (
    <AppShell>
      <MeetingsPage />
    </AppShell>
  );
}
