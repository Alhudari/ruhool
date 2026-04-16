'use client';

import { AppShell } from '@/components/layout/app-shell';
import { ConversationsPageView } from '@/components/conversations/conversations-page';

export default function ConversationsRoute() {
  return (
    <AppShell>
      <ConversationsPageView />
    </AppShell>
  );
}
