'use client';

import { AppShell } from '@/components/layout/app-shell';
import { NotesPage } from '@/components/notes/notes-page';

export default function Notes() {
  return (
    <AppShell>
      <NotesPage />
    </AppShell>
  );
}
