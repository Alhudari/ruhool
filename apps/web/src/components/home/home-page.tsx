'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Send,
  Paperclip,
  Mic,
  Search,
  BookOpen,
  PenTool,
  Sparkles,
  AudioWaveform,
  Palette,
  Bot,
  Compass,
  Shield,
  X,
  MessageSquare,
  CheckSquare,
  GraduationCap,
  ClipboardList,
  Eye,
  Shuffle,
  PenLine,
  Video,
  Briefcase,
  BarChart3,
  FolderKanban,
  Stethoscope,
} from 'lucide-react';
import { VoiceMode } from '../chat/voice-mode';
import { QuickStart } from './quick-start';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ChatView } from '../chat/chat-view';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  sparkles: Sparkles,
  search: Search,
  'book-open': BookOpen,
  'pen-tool': PenTool,
  palette: Palette,
  compass: Compass,
  crown: Shield,
  bot: Bot,
  'check-square': CheckSquare,
  'graduation-cap': GraduationCap,
  'clipboard-list': ClipboardList,
  eye: Eye,
  shuffle: Shuffle,
  'pen-line': PenLine,
  video: Video,
  briefcase: Briefcase,
  'bar-chart-3': BarChart3,
  'folder-kanban': FolderKanban,
  stethoscope: Stethoscope,
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
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

const FALLBACK_AGENTS = [
  {
    id: 'manager',
    icon: 'sparkles',
    color: 'amber',
    name: { en: "Al-Ra'i", ar: 'الراعي' },
    description: { en: 'PhD workspace CEO — routes to all specialists', ar: 'مدير غرفة الدكتوراه — يوجّه لجميع المتخصصين' },
    builtIn: true,
  },
  {
    id: 'research',
    icon: 'search',
    color: 'purple',
    name: { en: 'Al-Bahith', ar: 'الباحث' },
    description: { en: 'Deep research in academic papers', ar: 'البحث العميق في الأوراق الأكاديمية' },
    builtIn: true,
  },
  {
    id: 'reading-helper',
    icon: 'book-open',
    color: 'blue',
    name: { en: 'Al-Mulakhkhis', ar: 'المُلخِّص' },
    description: { en: 'Guided paper reading + summarization', ar: 'قراءة موجهة للأوراق وتلخيصها' },
    builtIn: true,
  },
  {
    id: 'writing-critic',
    icon: 'pen-tool',
    color: 'green',
    name: { en: 'Al-Naqid', ar: 'الناقد' },
    description: { en: 'Academic writing critic', ar: 'ناقد الكتابة الأكاديمية' },
    builtIn: true,
  },
  {
    id: 'research-companion',
    icon: 'book-open',
    color: 'emerald',
    name: { en: 'Al-Khuwy', ar: 'الخوي' },
    description: { en: 'PhD daily companion', ar: 'الخوي — دليلك اليومي وشريك أفكارك' },
    builtIn: true,
  },
  {
    id: 'mudawwin',
    icon: 'check-square',
    color: 'amber',
    name: { en: 'Al-Mudawwin', ar: 'المُدوّن' },
    description: { en: 'Meeting + supervision tracker', ar: 'متابع الاجتماعات والإشراف' },
    builtIn: true,
  },
  {
    id: 'content-creator',
    icon: 'palette',
    color: 'pink',
    name: { en: 'Al-Sarid', ar: 'السارد' },
    description: { en: 'Arabic educational content', ar: 'المحتوى التعليمي العربي' },
    builtIn: true,
  },
  {
    id: 'tasks-agent',
    icon: 'check-square',
    color: 'emerald',
    name: { en: 'Maham', ar: 'مهام' },
    description: { en: 'Task manager', ar: 'مدير المهام' },
    builtIn: true,
  },
];

interface AgentData {
  id: string;
  icon: string;
  color: string;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  builtIn: boolean;
  featured?: boolean;
}

export function HomePage() {
  const { language, setActiveConversation, activeConversationId } = useAppStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // When the sidebar's "New Chat" button clears the active conversation, reset the
  // home page back to the composer (otherwise it stays stuck in ChatView).
  useEffect(() => {
    if (activeConversationId === null) {
      setIsChatting(false);
      setMessage('');
      setConversationId(null);
    }
  }, [activeConversationId]);
  const [selectedAgentId, _setSelectedAgentId] = useState<string | undefined>(undefined);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState<string | null>(null);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [agents, setAgents] = useState<AgentData[]>(FALLBACK_AGENTS);
  const [showAllAgents, setShowAllAgents] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isRTL = language === 'ar';

  // Read URL params: ?q= pre-fills chat, ?projectId= sets active project, ?agentId= sets agent
  useEffect(() => {
    const q = searchParams?.get('q');
    const projectId = searchParams?.get('projectId');
    const agentId = searchParams?.get('agentId');
    if (q && !isChatting) { setMessage(q); setTimeout(() => inputRef.current?.focus(), 100); }
    if (projectId) {
      setActiveProjectId(projectId);
      // Fetch project name for display
      fetch(`/api/projects/${projectId}`).then(r => r.json()).then(p => { if (p.name) setActiveProjectName(p.name); }).catch(() => {});
    }
    if (agentId && !q) {
      // Pre-select agent — handled via message prefix
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl+K / Cmd+K focuses the chat input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !isChatting) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isChatting]);

  // Fetch agents (built-in + featured custom)
  useEffect(() => {
    apiFetch<AgentData[]>('/api/agents')
      .then((data) => {
        // Show built-in agents + featured custom agents
        const visible = data.filter((a) => a.builtIn || a.featured);
        if (visible.length > 0) setAgents(visible);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = useCallback(() => {
    if (!message.trim()) return;
    setIsChatting(true);
  }, [message]);

  const handleAgentClick = useCallback((agentId: string) => {
    if (agentId === 'manager') {
      inputRef.current?.focus();
      return;
    }
    // Navigate to dedicated agent chat
    router.push(`/agents/${agentId}/chat`);
  }, [router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (isChatting) {
    return (
      <ChatView
        initialMessage={message}
        conversationId={conversationId}
        agentId={selectedAgentId}
        projectId={activeProjectId || undefined}
        onConversationCreated={(id) => {
          setConversationId(id);
          setActiveConversation(id);
          // IMPORTANT: do NOT call router.replace() here — that triggers a Next.js
          // navigation which unmounts this page AND the active ChatView while the
          // SSE stream is still flowing, causing the first assistant response to be
          // dropped in the UI (Bug #1). Instead, update the URL bar in-place via
          // the browser History API so the URL reflects /chat/:id while ChatView
          // stays mounted. The user can still share/bookmark the URL; on a real
          // refresh Next.js will take over and render /chat/[id]/page.tsx.
          if (typeof window !== 'undefined') {
            try { window.history.replaceState(null, '', `/chat/${id}`); } catch { /* ignore */ }
          }
        }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] md:min-h-screen px-4">
      {/* Welcome */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 mx-auto mb-4">
          <img src="/logo.png" alt="Ruhool" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-2xl font-semibold text-on-surface mb-2">
          {isRTL ? 'مرحباً، عبدالله' : 'Hello, Abdullah'}
        </h1>
        <p className="text-on-surface-secondary text-sm">
          {isRTL
            ? 'كيف أقدر أساعدك اليوم؟'
            : 'How can I help you today?'}
        </p>
      </div>

      {/* Active project badge */}
      {activeProjectName && (
        <div className="w-full max-w-2xl mb-2 flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-xs font-medium">
            <FolderKanban size={12} />
            {activeProjectName}
          </div>
          <button
            onClick={() => { setActiveProjectId(null); setActiveProjectName(null); window.history.replaceState(null, '', '/'); }}
            className="text-xs text-on-surface-tertiary hover:text-on-surface transition-colors"
          >
            {isRTL ? '× إلغاء المشروع' : '× Clear project'}
          </button>
        </div>
      )}

      {/* Chat Input */}
      <div className="w-full max-w-2xl mb-8">
        <div className="relative bg-input border border-border rounded-[var(--radius-lg)] shadow-sm focus-within:ring-2 focus-within:ring-ring transition-shadow">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRTL ? 'اكتب رسالتك هنا...' : 'Type your message here...'}
            rows={1}
            dir={isRTL ? 'rtl' : 'ltr'}
            className={cn(
              'w-full resize-none bg-transparent px-4 py-3 pr-24 text-on-surface placeholder:text-on-surface-tertiary focus:outline-none',
              isRTL && 'pl-24 pr-4'
            )}
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          <div className={cn(
            'absolute bottom-2 flex items-center gap-1',
            isRTL ? 'left-2' : 'right-2'
          )}>
            <button className="p-2 rounded-[var(--radius)] text-on-surface-tertiary hover:text-on-surface-secondary hover:bg-surface-secondary transition-colors">
              <Paperclip size={18} />
            </button>
            <button className="p-2 rounded-[var(--radius)] text-on-surface-tertiary hover:text-on-surface-secondary hover:bg-surface-secondary transition-colors">
              <Mic size={18} />
            </button>
            <button
              onClick={handleSubmit}
              disabled={!message.trim()}
              className={cn(
                'p-2 rounded-[var(--radius)] transition-colors',
                message.trim()
                  ? 'bg-accent text-on-accent hover:bg-accent-hover'
                  : 'text-on-surface-tertiary'
              )}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Voice Mode Button */}
      <div className="w-full max-w-2xl mb-6 flex justify-center">
        <button
          onClick={() => setVoiceModeOpen(true)}
          className={cn(
            'flex items-center gap-2.5 px-5 py-2.5 rounded-full',
            'bg-accent/8 border border-accent/15 text-accent',
            'hover:bg-accent/15 hover:border-accent/25 transition-all duration-200',
            'text-sm font-medium',
            'md:px-5 md:py-2.5',
            'sm:px-6 sm:py-3 sm:text-base'
          )}
        >
          <AudioWaveform size={18} />
          {isRTL ? 'وضع الصوت' : 'Voice Mode'}
        </button>
      </div>

      {/* Quick Start Templates */}
      <div className="w-full max-w-2xl mb-6">
        <QuickStart
          language={language as 'ar' | 'en'}
          onSelect={(msg, _agentId) => {
            setMessage(msg);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
        />
      </div>

      {/* Top Agents */}
      <div className="w-full max-w-2xl">
        <p className="text-xs text-on-surface-tertiary uppercase tracking-wider mb-3 px-1">
          {isRTL ? 'الوكلاء' : 'Agents'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {agents.slice(0, 4).map((agent) => {
            const IconComp = ICON_MAP[agent.icon] || Bot;
            const colorClasses = COLOR_MAP[agent.color] || COLOR_MAP.gray;
            return (
              <button
                key={agent.id}
                onClick={() => handleAgentClick(agent.id)}
                className={cn(
                  'flex items-start gap-3 p-4 rounded-[var(--radius-lg)] border border-border text-start transition-all',
                  'hover:border-border-hover hover:bg-surface-secondary cursor-pointer'
                )}
              >
                <div className={cn('p-2 rounded-[var(--radius)]', colorClasses)}>
                  <IconComp size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">
                    {agent.name[language]}
                  </p>
                  <p className="text-xs text-on-surface-tertiary mt-0.5">
                    {agent.description[language]}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* View All Agents button */}
        {agents.length > 4 && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => setShowAllAgents(true)}
              className="text-sm text-accent hover:text-accent-hover font-medium transition-colors px-4 py-2 rounded-[var(--radius)] hover:bg-accent/5"
            >
              {isRTL ? 'عرض كل الوكلاء' : 'View All Agents'}
            </button>
          </div>
        )}
      </div>

      {/* New capabilities row */}
      <div className="w-full max-w-2xl mt-8">
        <p className="text-xs text-on-surface-tertiary uppercase tracking-wider mb-3 px-1">
          {isRTL ? 'المميزات الحديثة' : 'New capabilities'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { href: '/runs', label: { ar: 'حلقات', en: 'Runs' }, emoji: '🎯' },
            { href: '/memory', label: { ar: 'الرسم المعرفي', en: 'Memory' }, emoji: '🧠' },
            { href: '/artifacts', label: { ar: 'المستندات', en: 'Artifacts' }, emoji: '📄' },
            { href: '/watcher', label: { ar: 'الحارس', en: 'Watcher' }, emoji: '👁️' },
            { href: '/evaluator', label: { ar: 'المُقيّم', en: 'Evaluator' }, emoji: '📊' },
            { href: '/triggers', label: { ar: 'المحفّزات', en: 'Triggers' }, emoji: '⚡' },
            { href: '/library', label: { ar: 'المكتبة', en: 'Library' }, emoji: '📚' },
            { href: '/analyst', label: { ar: 'المحلل', en: 'Analyst' }, emoji: '📊' },
          ].map((f) => (
            <a key={f.href} href={f.href} className="flex flex-col items-center gap-1 p-3 rounded-[var(--radius)] border border-border bg-surface hover:border-accent/40 transition-colors">
              <span className="text-2xl">{f.emoji}</span>
              <span className="text-xs font-medium text-on-surface">{f.label[language]}</span>
            </a>
          ))}
        </div>
      </div>

      {/* All Agents Modal */}
      {showAllAgents && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h2 className="text-lg font-semibold text-on-surface">
                {isRTL ? 'جميع الوكلاء' : 'All Agents'}
              </h2>
              <button
                onClick={() => { setShowAllAgents(false); setAgentSearch(''); }}
                className="p-1.5 rounded-[var(--radius)] text-on-surface-tertiary hover:text-on-surface hover:bg-surface-secondary transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-border shrink-0">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-tertiary" />
                <input
                  type="text"
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  placeholder={isRTL ? 'ابحث عن وكيل...' : 'Search agents...'}
                  dir={isRTL ? 'rtl' : 'ltr'}
                  className="w-full pl-10 pr-4 py-2 text-sm bg-input border border-border rounded-[var(--radius)] text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Agent Grid */}
            <div className="flex-1 overflow-auto px-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {agents
                  .filter((agent) => {
                    if (!agentSearch) return true;
                    const q = agentSearch.toLowerCase();
                    return (
                      agent.name.en.toLowerCase().includes(q) ||
                      agent.name.ar.includes(q) ||
                      agent.description.en.toLowerCase().includes(q) ||
                      agent.description.ar.includes(q)
                    );
                  })
                  .map((agent) => {
                    const IconComp = ICON_MAP[agent.icon] || Bot;
                    const colorClasses = COLOR_MAP[agent.color] || COLOR_MAP.gray;
                    return (
                      <div
                        key={agent.id}
                        className="flex items-start gap-3 p-4 rounded-[var(--radius-lg)] border border-border hover:border-border-hover hover:bg-surface-secondary transition-all"
                      >
                        <div className={cn('p-2 rounded-[var(--radius)] shrink-0', colorClasses)}>
                          <IconComp size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-on-surface truncate">
                            {agent.name[language]}
                          </p>
                          <p className="text-xs text-on-surface-tertiary mt-0.5 line-clamp-2">
                            {agent.description[language]}
                          </p>
                          <button
                            onClick={() => {
                              setShowAllAgents(false);
                              setAgentSearch('');
                              handleAgentClick(agent.id);
                            }}
                            className="mt-2 flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover font-medium transition-colors"
                          >
                            <MessageSquare size={12} />
                            {isRTL ? 'محادثة' : 'Chat'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Voice Mode Overlay */}
      {voiceModeOpen && (
        <VoiceMode
          conversationId={conversationId}
          selectedModel="claude-sonnet-4-6"
          onClose={() => setVoiceModeOpen(false)}
          onMessage={(userText, assistantText) => {
            // Transition into chat view with the voice conversation
            setMessage(userText);
            setIsChatting(true);
            setVoiceModeOpen(false);
          }}
          onConversationCreated={(id) => {
            setConversationId(id);
            setActiveConversation(id);
          }}
        />
      )}
    </div>
  );
}
