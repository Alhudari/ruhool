import { AppShell } from '@/components/layout/app-shell';
import { PhDDashboard } from '@/components/phd/PhDDashboard';

export default function PhDDashboardRoute() {
  return (
    <AppShell>
      <PhDDashboard />
    </AppShell>
  );
}
