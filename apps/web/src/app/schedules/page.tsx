'use client';

import { AppShell } from '@/components/layout/app-shell';
import { SchedulesPage } from '@/components/schedules/schedules-page';

export default function Schedules() {
  return (
    <AppShell>
      <SchedulesPage />
    </AppShell>
  );
}
