'use client';

import { AppShell } from '@/components/layout/app-shell';
import { ProjectsPageView } from '@/components/projects/projects-page';

export default function ProjectsRoute() {
  return (
    <AppShell>
      <ProjectsPageView />
    </AppShell>
  );
}
