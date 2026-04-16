'use client';

import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { ChatView } from '@/components/chat/chat-view';

export default function ChatPage() {
  const params = useParams();
  const conversationId = params.id as string;

  return (
    <AppShell>
      <ChatView conversationId={conversationId} />
    </AppShell>
  );
}
