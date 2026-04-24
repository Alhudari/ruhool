'use client';

import { AppShell } from '@/components/layout/app-shell';
import { ZoteroPage } from '@/components/zotero/zotero-page';

export default function ZoteroRoute() {
  return (
    <AppShell>
      <ZoteroPage />
    </AppShell>
  );
}
