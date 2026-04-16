'use client';

import { AppShell } from '@/components/layout/app-shell';
import { NotificationsPage } from '@/components/notifications/notifications-page';

export default function NotificationsRoute() {
  return (
    <AppShell>
      <NotificationsPage />
    </AppShell>
  );
}
