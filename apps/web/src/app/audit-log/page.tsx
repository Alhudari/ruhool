import { AppShell } from '@/components/layout/app-shell';
import { AuditLogPage } from '@/components/audit/AuditLogPage';

export default function AuditLogRoute() {
  return (
    <AppShell>
      <AuditLogPage />
    </AppShell>
  );
}
