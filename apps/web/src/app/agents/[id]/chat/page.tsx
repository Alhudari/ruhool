'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Bot, Compass, Search, BookOpen, PenTool, Sparkles, Loader2, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { ChatView } from '@/components/chat/chat-view';

interface Agent {
  id: string;
  name: { en: string; ar: string };
  icon: string;
  color: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  compass: Compass,
  search: Search,
  'book-open': BookOpen,
  'pen-tool': PenTool,
  sparkles: Sparkles,
  crown: Shield,
  bot: Bot,
};

const COLOR_MAP: Record<string, string> = {
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  green: 'bg-green-500/10 text-green-600 dark:text-green-400',
  gray: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400',
  pink: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  gold: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
};

export default function AgentChatPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = params.id as string;
  const { language, setActiveConversation } = useAppStore();
  const isRTL = language === 'ar';
  const projectId = searchParams?.get('projectId') || undefined;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Agent[]>('/api/agents')
      .then(async (agents) => {
        const found = agents.find((a) => a.id === agentId);
        if (found) {
          setAgent(found);
        } else {
          // Try fetching as a custom agent by bare UUID
          const bareId = agentId.startsWith('custom-') ? agentId.replace('custom-', '') : agentId;
          try {
            const ca = await apiFetch<{ id: string; name: { en: string; ar: string }; icon: string; color: string }>(`/api/custom-agents/${bareId}`);
            if (ca) {
              setAgent({ id: agentId, name: ca.name, icon: ca.icon, color: ca.color });
            }
          } catch { /* not found */ }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <Loader2 size={24} className="animate-spin text-on-surface-tertiary" />
        </div>
      </AppShell>
    );
  }

  if (!agent) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <p className="text-on-surface-secondary">{isRTL ? 'الوكيل غير موجود' : 'Agent not found'}</p>
          <button onClick={() => router.push('/agents')} className="text-accent text-sm">
            {isRTL ? 'العودة' : 'Go back'}
          </button>
        </div>
      </AppShell>
    );
  }

  const IconComp = ICON_MAP[agent.icon] || Bot;
  const colorClasses = COLOR_MAP[agent.color] || COLOR_MAP.gray;

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {/* Agent header bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface shrink-0">
          <button
            onClick={() => router.push(`/agents/${agentId}`)}
            className="p-2 rounded-[var(--radius)] hover:bg-surface-secondary transition-colors text-on-surface-secondary"
          >
            <ArrowLeft size={18} />
          </button>
          <div className={cn('p-2 rounded-[var(--radius)]', colorClasses)}>
            <IconComp size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-on-surface truncate">
              {agent.name[language]}
            </p>
            <p className="text-[10px] text-on-surface-tertiary">
              {isRTL ? 'محادثة مباشرة' : 'Direct chat'}
            </p>
          </div>
        </div>

        {/* Chat view */}
        <div className="flex-1 overflow-hidden">
          <ChatView
            agentId={agentId}
            conversationId={conversationId}
            projectId={projectId}
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
