import { AppShell } from '@/components/layout/app-shell';
import { SupervisionDashboard } from '@/components/supervision/SupervisionDashboard';

export default function SupervisionRoute() {
  return (
    <AppShell>
      <SupervisionDashboard />
    </AppShell>
  );
}
