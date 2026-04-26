'use client';

import { AppShell } from '@/components/layout/app-shell';
import { ReportsInboxPage } from '@/components/reports-inbox/reports-inbox-page';

export default function ReportsInbox() {
  return (
    <AppShell>
      <ReportsInboxPage />
    </AppShell>
  );
}
