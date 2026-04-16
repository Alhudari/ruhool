'use client';

import { AppShell } from '@/components/layout/app-shell';
import { PromptsLibraryPage } from '@/components/settings/prompts-library-page';

export default function Prompts() {
  return (
    <AppShell>
      <PromptsLibraryPage />
    </AppShell>
  );
}
