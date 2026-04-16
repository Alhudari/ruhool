'use client';

import { AppShell } from '@/components/layout/app-shell';
import { SettingsPage } from '@/components/settings/settings-page';

export default function Settings() {
  return (
    <AppShell>
      <SettingsPage />
    </AppShell>
  );
}
