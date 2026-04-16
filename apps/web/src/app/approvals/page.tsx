'use client';

import { AppShell } from '@/components/layout/app-shell';
import { ApprovalsPage } from '@/components/approvals/approvals-page';

export default function Approvals() {
  return (
    <AppShell>
      <ApprovalsPage />
    </AppShell>
  );
}
