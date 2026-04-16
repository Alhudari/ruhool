'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AgentNotificationsSettingsPage } from '@/components/notifications/agent-notifications-settings-page';

export default function SettingsNotificationsRoute() {
  return (
    <AppShell>
      <AgentNotificationsSettingsPage />
    </AppShell>
  );
}
