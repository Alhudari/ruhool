'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Plus,
  Compass,
  Search,
  BookOpen,
  PenTool,
  Loader2,
  MessageCircle,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ItemMenu, ShowArchivedToggle } from '@/components/ui/item-menu';
import { AgentOrgCard } from './agent-org-card';

interface Agent {
  id: string;
  moduleId: string;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  icon: string;
  color: string;
  builtIn: boolean;
  archived?: boolean;
  model?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  compass: Compass,
  search: Search,
  'book-open': BookOpen,
  'pen-tool': PenTool,
  crown: Shield,
  bot: Bot,
};

const COLOR_MAP: Record<string, string> = {
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  green: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  gray: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  pink: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20',
  cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  gold: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
};

export function AgentsListPage() {
  const { language } = useAppStore();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const isRTL = language === 'ar';

  const load = () => {
    apiFetch<Agent[]>(`/api/agents?archived=${showArchived}`)
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [showArchived]);

  const archiveAgent = async (id: string, archived: boolean) => {
    const rawId = id.replace(/^custom-/, '');
    await apiFetch(`/api/custom-agents/${rawId}/archive`, { method: 'PUT', body: JSON.stringify({ archived }) });
    load();
  };

  const deleteAgent = async (id: string) => {
    const rawId = id.replace(/^custom-/, '');
    await apiFetch(`/api/custom-agents/${rawId}`, { method: 'DELETE' });
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-on-surface-tertiary" />
      </div>
    );
  }

  const builtInAgents = agents.filter((a) => a.builtIn);
  const customAgents = agents.filter((a) => !a.builtIn);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Bot size={24} className="text-on-surface-secondary" />
          <h1 className="text-xl font-semibold text-on-surface">
            {isRTL ? 'الوكلاء' : 'Agents'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <ShowArchivedToggle value={showArchived} onChange={setShowArchived} isRTL={isRTL} />
          <button
            onClick={() => router.push('/agents/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] bg-accent text-on-accent hover:bg-accent-hover transition-colors text-sm"
          >
            <Plus size={16} />
            {isRTL ? 'وكيل جديد' : 'New Agent'}
          </button>
        </div>
      </div>

      {/* Built-in Agents */}
      <div className="mb-8">
        <p className="text-xs text-on-surface-tertiary uppercase tracking-wider mb-3 px-1">
          {isRTL ? 'وكلاء النظام' : 'Built-in Agents'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {builtInAgents.map((agent) => {
            const IconComp = ICON_MAP[agent.icon] || Bot;
            const colorClasses = COLOR_MAP[agent.color] || COLOR_MAP.gray;
            return (
              <div
                key={agent.id}
                className="flex items-start gap-3 p-4 rounded-[var(--radius-lg)] border border-border hover:border-border-hover hover:bg-surface-secondary transition-all text-start cursor-pointer"
                onClick={() => router.push(`/agents/${agent.id}`)}
              >
                <div className={cn('p-2.5 rounded-[var(--radius)]', colorClasses)}>
                  <IconComp size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-on-surface">
                    {agent.name[language]}
                  </p>
                  <p className="text-xs text-on-surface-tertiary mt-1">
                    {agent.description[language]}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary">
                      {isRTL ? 'مدمج' : 'Built-in'}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/agents/${agent.id}/chat`); }}
                      className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                    >
                      <MessageCircle size={10} />
                      {isRTL ? 'محادثة' : 'Chat'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom Agents */}
      <div>
        <p className="text-xs text-on-surface-tertiary uppercase tracking-wider mb-3 px-1">
          {isRTL ? 'وكلاء مخصصون' : 'Custom Agents'}
        </p>
        {customAgents.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-[var(--radius-lg)]">
            <Bot size={32} className="mx-auto text-on-surface-tertiary mb-3" />
            <p className="text-sm text-on-surface-secondary">
              {isRTL ? 'لا يوجد وكلاء مخصصون بعد' : 'No custom agents yet'}
            </p>
            <button
              onClick={() => router.push('/agents/new')}
              className="mt-3 text-sm text-accent hover:text-accent-hover transition-colors"
            >
              {isRTL ? 'أنشئ وكيلك الأول' : 'Create your first agent'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {customAgents.map((agent) => {
              const IconComp = ICON_MAP[agent.icon] || Bot;
              const colorClasses = COLOR_MAP[agent.color] || COLOR_MAP.gray;
              return (
                <div
                  key={agent.id}
                  className={cn('flex items-start gap-3 p-4 rounded-[var(--radius-lg)] border border-border hover:border-border-hover hover:bg-surface-secondary transition-all text-start cursor-pointer', agent.archived && 'opacity-60')}
                  onClick={() => router.push(`/agents/${agent.id}`)}
                >
                  <div className={cn('p-2.5 rounded-[var(--radius)]', colorClasses)}>
                    <IconComp size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-on-surface">
                      {agent.name[language]}
                    </p>
                    <p className="text-xs text-on-surface-tertiary mt-1 line-clamp-2">
                      {agent.description[language]}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      {agent.model && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                          {agent.model}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/agents/${agent.id}/chat`); }}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                      >
                        <MessageCircle size={10} />
                        {isRTL ? 'محادثة' : 'Chat'}
                      </button>
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <ItemMenu
                      isRTL={isRTL}
                      archived={!!agent.archived}
                      onArchive={() => archiveAgent(agent.id, true)}
                      onUnarchive={() => archiveAgent(agent.id, false)}
                      onDelete={() => deleteAgent(agent.id)}
                      deleteConfirmMessage={isRTL ? 'حذف هذا الوكيل نهائيًا؟ سيتم فقد جميع المحادثات المرتبطة به.' : 'Delete this agent permanently? Related conversations will lose their agent reference.'}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agent Organization — Dispatch Hierarchy */}
      <div className="mt-8 border border-border rounded-xl p-4 bg-surface-variant/30">
        <AgentOrgCard />
      </div>
    </div>
  );
}
