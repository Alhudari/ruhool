'use client';

import { AppShell } from '@/components/layout/app-shell';
import { KeepNotesPage } from '@/components/notes-keep/keep-notes-page';

export default function NotesKeep() {
  return (
    <AppShell>
      <KeepNotesPage />
    </AppShell>
  );
}
