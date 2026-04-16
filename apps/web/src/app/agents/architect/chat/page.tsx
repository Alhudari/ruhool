'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { AppShell } from '@/components/layout/app-shell';
import { ChatView } from '@/components/chat/chat-view';

export default function ArchitectChatPage() {
  const router = useRouter();
  const { language, setActiveConversation } = useAppStore();
  const isRTL = language === 'ar';
  const [conversationId, setConversationId] = useState<string | null>(null);

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {/* Special architect header */}
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 border-b border-border shrink-0',
          'bg-gradient-to-r from-yellow-500/5 to-amber-500/5'
        )}>
          <button
            onClick={() => router.push('/agents/architect')}
            className="p-2 rounded-[var(--radius)] hover:bg-surface-secondary transition-colors text-on-surface-secondary"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="p-2 rounded-[var(--radius)] bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
            <Shield size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-on-surface truncate">
              {isRTL ? 'الراعي' : 'Al-Ra\'i (الراعي)'}
            </p>
            <p className="text-[10px] text-on-surface-tertiary">
              {isRTL ? 'مدير الوكلاء — ناقش التعديلات والإنشاء هنا' : 'Agent Manager — discuss modifications and creation here'}
            </p>
          </div>
        </div>

        {/* Chat view */}
        <div className="flex-1 overflow-hidden">
          <ChatView
            agentId="architect"
            conversationId={conversationId}
            onConversationCreated={(id) => {
              setConversationId(id);
              setActiveConversation(id);
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
