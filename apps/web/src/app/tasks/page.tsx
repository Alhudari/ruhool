'use client';

import { AppShell } from '@/components/layout/app-shell';
import { TasksPage } from '@/components/tasks/tasks-page';

export default function Tasks() {
  return (
    <AppShell>
      <TasksPage />
    </AppShell>
  );
}
