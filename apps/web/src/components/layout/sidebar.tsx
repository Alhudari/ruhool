'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Home,
  MessageSquare,
  Bot,
  Workflow,
  FolderOpen,
  Settings,
  LayoutDashboard,
  BarChart3,
  Wrench,
  BookOpen,
  StickyNote,
  NotebookPen,
  Network,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Languages,
  Sun,
  Moon,
  Palette,
  Bell,
  Box,
  Video,
  Clock,
  CheckSquare,
  FlaskConical,
  Library,
  Captions,
  PlayCircle,
  FileText,
  Eye,
  BarChart2,
  Zap,
  Network as NetworkIcon,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ItemMenu } from '@/components/ui/item-menu';
import { SidebarClock } from './sidebar-clock';

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  language: string;
  agentId?: string;
  archived?: boolean;
}

const AGENT_SHORT_NAMES: Record<string, { en: string; ar: string }> = {
  manager: { en: "Al-Ra'i", ar: 'الراعي' },
  research: { en: 'Abdan', ar: 'عبدان' },
  'reading-helper': { en: 'Shwasha', ar: 'شواشة' },
  'writing-critic': { en: 'Al-Safra', ar: 'الصفرا' },
  comparator: { en: 'Rammana', ar: 'رمّانة' },
  architect: { en: 'Al-Musammim', ar: 'المصمم' },
  'content-creator': { en: 'Al-Dabsa', ar: 'الدبسا' },
  creative: { en: 'The Creative', ar: 'الكرييتف' },
  'tasks-agent': { en: 'Maham', ar: 'مهام' },
};

interface NavItem {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  label: { en: string; ar: string };
  href: string;
}

const NAV_ITEMS_MAP: Record<string, NavItem> = {
  home: { id: 'home', icon: Home, label: { en: 'Home', ar: 'الرئيسية' }, href: '/' },
  dashboard: { id: 'dashboard', icon: LayoutDashboard, label: { en: 'Dashboard', ar: 'لوحة التحكم' }, href: '/dashboard' },
  agents: { id: 'agents', icon: Bot, label: { en: 'Agents', ar: 'الوكلاء' }, href: '/agents' },
  approvals: { id: 'approvals', icon: Bell, label: { en: 'Approvals', ar: 'الموافقات' }, href: '/approvals' },
  workflows: { id: 'workflows', icon: Workflow, label: { en: 'Workflows', ar: 'سير العمل' }, href: '/workflows' },
  'workflow-runs': { id: 'workflow-runs', icon: Workflow, label: { en: 'Workflow Runs', ar: 'مسارات العمل' }, href: '/workflow-runs' },
  schedules: { id: 'schedules', icon: Clock, label: { en: 'Schedules', ar: 'الجدولة' }, href: '/schedules' },
  tools: { id: 'tools', icon: Wrench, label: { en: 'Tools', ar: 'الأدوات' }, href: '/tools' },
  papers: { id: 'papers', icon: BookOpen, label: { en: 'Papers', ar: 'الأوراق' }, href: '/papers' },
  notes: { id: 'notes', icon: NotebookPen, label: { en: 'Atomic Notes', ar: 'الملاحظات الذرية' }, href: '/notes' },
  'notes-keep': { id: 'notes-keep', icon: StickyNote, label: { en: 'Quick Notes', ar: 'ملاحظات سريعة' }, href: '/notes-keep' },
  knowledge: { id: 'knowledge', icon: Network, label: { en: 'Knowledge', ar: 'المعرفة' }, href: '/graph' },
  content: { id: 'content', icon: Palette, label: { en: 'Content', ar: 'المحتوى' }, href: '/content' },
  studio: { id: 'studio', icon: Video, label: { en: 'Studio', ar: 'الاستوديو' }, href: '/studio' },
  captions: { id: 'captions', icon: Captions, label: { en: 'Captions', ar: 'كابشنز' }, href: '/captions' },
  lab: { id: 'lab', icon: FlaskConical, label: { en: 'Lab', ar: 'المعمل' }, href: '/lab' },
  library: { id: 'library', icon: Library, label: { en: 'Library', ar: 'المكتبة' }, href: '/library' },
  usage: { id: 'usage', icon: BarChart3, label: { en: 'Usage', ar: 'الاستخدام' }, href: '/usage' },
  analyst: { id: 'analyst', icon: BarChart3, label: { en: 'Analyst', ar: 'المحلل' }, href: '/analyst' },
  conversations: { id: 'conversations', icon: MessageSquare, label: { en: 'Conversations', ar: 'المحادثات' }, href: '/conversations' },
  files: { id: 'files', icon: FolderOpen, label: { en: 'Files', ar: 'الملفات' }, href: '/files' },
  blackbox: { id: 'blackbox', icon: Box, label: { en: 'Black Box', ar: 'الصندوق الأسود' }, href: '/blackbox' },
  tasks: { id: 'tasks', icon: CheckSquare, label: { en: 'Tasks', ar: 'المهام' }, href: '/tasks' },
  notifications: { id: 'notifications', icon: Bell, label: { en: 'Notifications', ar: 'التنبيهات' }, href: '/notifications' },
  settings: { id: 'settings', icon: Settings, label: { en: 'Settings', ar: 'الإعدادات' }, href: '/settings' },
  control: { id: 'control', icon: Activity, label: { en: 'Mission Control', ar: 'غرفة التحكم' }, href: '/control' },
  runs: { id: 'runs', icon: PlayCircle, label: { en: 'Agent Runs', ar: 'حلقات الوكلاء' }, href: '/runs' },
  memory: { id: 'memory', icon: NetworkIcon, label: { en: 'Memory Graph', ar: 'الرسم المعرفي' }, href: '/memory' },
  artifacts: { id: 'artifacts', icon: FileText, label: { en: 'Artifacts', ar: 'المستندات' }, href: '/artifacts' },
  watcher: { id: 'watcher', icon: Eye, label: { en: 'Watcher', ar: 'الحارس' }, href: '/watcher' },
  evaluator: { id: 'evaluator', icon: BarChart2, label: { en: 'Evaluator', ar: 'المُقيّم' }, href: '/evaluator' },
  triggers: { id: 'triggers', icon: Zap, label: { en: 'Triggers', ar: 'المحفّزات' }, href: '/triggers' },
};

interface SidebarGroup {
  id: string;
  label: { en: string; ar: string };
  items: string[];
  defaultOpen: boolean;
}

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: 'herd',
    label: { en: 'Herd', ar: 'الذود' },
    items: ['agents', 'approvals', 'notifications'],
    defaultOpen: true,
  },
  {
    id: 'organize',
    label: { en: 'Organize', ar: 'التنظيم' },
    items: ['tasks', 'notes-keep'],
    defaultOpen: true,
  },
  {
    id: 'work',
    label: { en: 'Work', ar: 'العمل' },
    items: ['workflows', 'workflow-runs', 'schedules', 'tools'],
    defaultOpen: false,
  },
  {
    id: 'research',
    label: { en: 'Research & Knowledge', ar: 'البحث والمعرفة' },
    items: ['papers', 'notes', 'knowledge'],
    defaultOpen: false,
  },
  {
    id: 'lab',
    label: { en: 'Lab', ar: 'المعمل' },
    items: ['lab', 'library', 'studio', 'captions', 'content'],
    defaultOpen: true,
  },
  {
    id: 'intelligence',
    label: { en: 'Intelligence', ar: 'الذكاء' },
    items: ['control', 'runs', 'memory', 'artifacts', 'evaluator', 'watcher', 'triggers'],
    defaultOpen: true,
  },
  {
    id: 'system',
    label: { en: 'System', ar: 'النظام' },
    items: ['analyst', 'conversations', 'files', 'blackbox', 'settings'],
    defaultOpen: false,
  },
];

const ALWAYS_VISIBLE = ['home', 'dashboard'];

function loadCollapsedState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem('ruhool-sidebar-collapsed');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  // Set defaults
  const defaults: Record<string, boolean> = {};
  for (const group of SIDEBAR_GROUPS) {
    defaults[group.id] = !group.defaultOpen;
  }
  return defaults;
}

function saveCollapsedState(state: Record<string, boolean>) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('ruhool-sidebar-collapsed', JSON.stringify(state));
  }
}

function groupConversations(conversations: Conversation[], isRTL: boolean) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; conversations: Conversation[] }[] = [
    { label: isRTL ? 'اليوم' : 'Today', conversations: [] },
    { label: isRTL ? 'أمس' : 'Yesterday', conversations: [] },
    { label: isRTL ? 'هذا الأسبوع' : 'This Week', conversations: [] },
    { label: isRTL ? 'أقدم' : 'Older', conversations: [] },
  ];

  for (const conv of conversations) {
    const d = new Date(conv.updatedAt);
    if (d >= today) {
      groups[0].conversations.push(conv);
    } else if (d >= yesterday) {
      groups[1].conversations.push(conv);
    } else if (d >= weekAgo) {
      groups[2].conversations.push(conv);
    } else {
      groups[3].conversations.push(conv);
    }
  }

  return groups.filter((g) => g.conversations.length > 0);
}

const THEMES = [
  { id: 'claude-clean', label: { en: 'Claude Clean', ar: 'كلود النظيف' } },
  { id: 'desert-caravan', label: { en: 'Desert Caravan', ar: 'قافلة الصحراء' } },
  { id: 'academic', label: { en: 'Academic', ar: 'أكاديمي' } },
];

function NavItemButton({
  item,
  activePage,
  sidebarOpen,
  isRTL,
  language,
  pendingApprovals,
  unreadNotifications,
  onNavigate,
}: {
  item: NavItem;
  activePage: string;
  sidebarOpen: boolean;
  isRTL: boolean;
  language: 'en' | 'ar';
  pendingApprovals: number;
  unreadNotifications: number;
  onNavigate: (id: string, href: string) => void;
}) {
  const badge = item.id === 'approvals' ? pendingApprovals : item.id === 'notifications' ? unreadNotifications : 0;
  return (
    <a
      href={item.href}
      onClick={(e) => {
        e.preventDefault();
        onNavigate(item.id, item.href);
      }}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] text-sm transition-colors',
        activePage === item.id
          ? 'bg-sidebar-active text-on-surface'
          : 'text-on-sidebar hover:bg-sidebar-hover',
        !sidebarOpen && 'justify-center px-0'
      )}
    >
      <span className="relative shrink-0">
        <item.icon size={18} />
        {badge > 0 && !sidebarOpen && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      {sidebarOpen && (
        <>
          <span className="flex-1">{item.label[language]}</span>
          {badge > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
              {pendingApprovals}
            </span>
          )}
        </>
      )}
    </a>
  );
}

export function Sidebar({ onMobileNavigate }: { onMobileNavigate?: () => void } = {}) {
  const {
    sidebarOpen,
    toggleSidebar,
    language,
    setLanguage,
    theme,
    setTheme,
    themeVariant,
    setThemeVariant,
    setActiveConversation,
  } = useAppStore();

  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activePage, setActivePage] = useState('home');
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [_pendingApprovals, setPendingApprovals] = useState(0);
  const pendingApprovals = _pendingApprovals;
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [customAgentNames, setCustomAgentNames] = useState<Record<string, { en: string; ar: string }>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsedState);

  useEffect(() => {
    apiFetch<Conversation[]>('/api/conversations')
      .then(setConversations)
      .catch(() => {});
    apiFetch<unknown[]>('/api/approvals/pending')
      .then((data) => setPendingApprovals(data.length))
      .catch(() => {});
    const fetchUnread = () => apiFetch<{ count: number }>('/api/notifications/unread-count')
      .then((d) => setUnreadNotifications(d.count))
      .catch(() => {});
    fetchUnread();
    const notifInterval = setInterval(fetchUnread, 30_000);
    apiFetch<Array<{ id: string; name: { en: string; ar: string } }>>('/api/custom-agents')
      .then((agents) => {
        const map: Record<string, { en: string; ar: string }> = {};
        for (const a of agents) { map[a.id] = a.name; map['custom-' + a.id] = a.name; }
        setCustomAgentNames(map);
      })
      .catch(() => {});
    return () => clearInterval(notifInterval);
  }, []);

  useEffect(() => {
    setCollapsed(loadCollapsedState());
  }, []);

  const toggleGroup = (groupId: string) => {
    const updated = { ...collapsed, [groupId]: !collapsed[groupId] };
    setCollapsed(updated);
    saveCollapsedState(updated);
  };

  const allCollapsed = SIDEBAR_GROUPS.every((g) => collapsed[g.id]);
  const toggleAll = () => {
    const newState: Record<string, boolean> = {};
    const target = !allCollapsed;
    for (const g of SIDEBAR_GROUPS) newState[g.id] = target;
    setCollapsed(newState);
    saveCollapsedState(newState);
  };

  const handleNavigate = (id: string, href: string) => {
    setActivePage(id);
    router.push(href);
    onMobileNavigate?.();
  };

  const isRTL = language === 'ar';

  const conversationGroups = groupConversations(conversations, isRTL);

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-sidebar border-border transition-all duration-200',
        isRTL ? 'border-l' : 'border-r',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
        <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0">
          <img src="/logo.png" alt="Ruhool" className="w-full h-full object-contain" />
        </div>
        {sidebarOpen && (
          <span className="font-semibold text-on-surface truncate">
            {isRTL ? 'رحول' : 'Ruhool'}
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className={cn(
            'p-1 rounded hover:bg-sidebar-hover text-on-surface-tertiary',
            sidebarOpen ? (isRTL ? 'mr-auto' : 'ml-auto') : 'mx-auto'
          )}
        >
          {sidebarOpen ? (
            isRTL ? <ChevronRight size={16} /> : <ChevronLeft size={16} />
          ) : (
            isRTL ? <ChevronLeft size={16} /> : <ChevronRight size={16} />
          )}
        </button>
      </div>

      {/* New Chat */}
      <div className="px-3 py-2">
        <button
          onClick={() => {
            setActiveConversation(null);
            setActivePage('home');
            router.push('/');
            onMobileNavigate?.();
          }}
          className={cn(
            'flex items-center gap-2 w-full px-3 py-2 rounded-[var(--radius)] text-sm',
            'bg-accent text-on-accent hover:bg-accent-hover transition-colors',
            !sidebarOpen && 'justify-center px-0'
          )}
        >
          <Plus size={16} />
          {sidebarOpen && (isRTL ? 'محادثة جديدة' : 'New Chat')}
        </button>
      </div>

      {/* Navigation */}
      <nav className="px-3 space-y-0.5 overflow-auto flex-1">
        {/* Always visible items */}
        {ALWAYS_VISIBLE.map((itemId) => {
          const item = NAV_ITEMS_MAP[itemId];
          if (!item) return null;
          return (
            <NavItemButton
              key={item.id}
              item={item}
              activePage={activePage}
              sidebarOpen={sidebarOpen}
              isRTL={isRTL}
              language={language}
              pendingApprovals={pendingApprovals}
              unreadNotifications={unreadNotifications}
              onNavigate={handleNavigate}
            />
          );
        })}

        {/* Collapse/Expand all button */}
        {sidebarOpen && (
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 w-full px-3 mt-2 py-1 text-[10px] text-on-surface-tertiary hover:text-accent transition-colors"
            title={allCollapsed ? 'Expand all' : 'Collapse all'}
          >
            <ChevronDown size={10} className={cn('transition-transform', allCollapsed && '-rotate-90')} />
            <span>{allCollapsed ? (isRTL ? 'فتح الكل' : 'Expand all') : (isRTL ? 'طي الكل' : 'Collapse all')}</span>
          </button>
        )}

        {/* Collapsible groups */}
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.id} className="mt-1">
            {sidebarOpen ? (
              <button
                onClick={() => toggleGroup(group.id)}
                className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] text-on-surface-tertiary uppercase tracking-wider hover:text-on-surface-secondary transition-colors"
              >
                <ChevronDown
                  size={10}
                  className={cn(
                    'transition-transform duration-150 shrink-0',
                    collapsed[group.id] && (isRTL ? 'rotate-90' : '-rotate-90')
                  )}
                />
                <span className="flex-1 text-start">{group.label[language]}</span>
              </button>
            ) : (
              <div className="h-px bg-border mx-2 my-1" />
            )}

            {(!collapsed[group.id] || !sidebarOpen) && (
              <div className="space-y-0.5">
                {group.items.map((itemId) => {
                  const item = NAV_ITEMS_MAP[itemId];
                  if (!item) return null;
                  return (
                    <NavItemButton
                      key={item.id}
                      item={item}
                      activePage={activePage}
                      sidebarOpen={sidebarOpen}
                      isRTL={isRTL}
                      language={language}
                      pendingApprovals={pendingApprovals}
                      unreadNotifications={unreadNotifications}
                      onNavigate={handleNavigate}
                    />
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {/* Recent Conversations (grouped) */}
        {sidebarOpen && conversations.length > 0 && (
          <div className="mt-4">
            {conversationGroups.map((group) => (
              <div key={group.label} className="mb-3">
                <p className="text-[10px] text-on-surface-tertiary px-3 mb-1 uppercase tracking-wider">
                  {group.label}
                </p>
                {group.conversations.map((conv) => {
                  const agentName = conv.agentId && conv.agentId !== 'manager'
                    ? AGENT_SHORT_NAMES[conv.agentId]?.[language] || customAgentNames[conv.agentId]?.[language] || null
                    : null;
                  const archiveConv = async () => {
                    try {
                      await apiFetch(`/api/conversations/${conv.id}/archive`, { method: 'PUT', body: JSON.stringify({ archived: true }) });
                      setConversations((prev) => prev.filter((c) => c.id !== conv.id));
                    } catch {}
                  };
                  const deleteConv = async () => {
                    try {
                      await apiFetch(`/api/conversations/${conv.id}`, { method: 'DELETE' });
                      setConversations((prev) => prev.filter((c) => c.id !== conv.id));
                    } catch {}
                  };
                  return (
                    <div key={conv.id} className="group relative flex items-center">
                      <button
                        onClick={() => {
                          setActiveConversation(conv.id);
                          router.push(`/chat/${conv.id}`);
                          onMobileNavigate?.();
                        }}
                        className="flex items-center gap-2 flex-1 min-w-0 px-3 py-1.5 rounded-[var(--radius)] text-sm text-on-sidebar hover:bg-sidebar-hover truncate text-start"
                      >
                        <MessageSquare size={14} className="shrink-0 opacity-50" />
                        {agentName && (
                          <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
                            {agentName}
                          </span>
                        )}
                        <span className="truncate">{conv.title}</span>
                      </button>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <ItemMenu
                          isRTL={isRTL}
                          onArchive={archiveConv}
                          onDelete={deleteConv}
                          deleteConfirmMessage={isRTL ? 'حذف هذه المحادثة نهائيًا؟' : 'Delete this conversation permanently?'}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* Bottom controls */}
      <div className="mt-auto border-t border-border px-3 py-3 space-y-1">
        {/* Live clock + date */}
        <SidebarClock compact={!sidebarOpen} language={language} />
        {/* Language toggle */}
        <button
          onClick={() => {
            const newLang = language === 'en' ? 'ar' : 'en';
            setLanguage(newLang);
            localStorage.setItem('ruhool-language', newLang);
          }}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2 rounded-[var(--radius)] text-sm text-on-sidebar hover:bg-sidebar-hover transition-colors',
            !sidebarOpen && 'justify-center px-0'
          )}
        >
          <Languages size={18} />
          {sidebarOpen && (language === 'en' ? 'العربية' : 'English')}
        </button>

        {/* Theme toggle */}
        <div className="relative">
          <button
            onClick={() => setShowThemeMenu(!showThemeMenu)}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 rounded-[var(--radius)] text-sm text-on-sidebar hover:bg-sidebar-hover transition-colors',
              !sidebarOpen && 'justify-center px-0'
            )}
          >
            <Palette size={18} />
            {sidebarOpen && THEMES.find((t) => t.id === theme)?.label[language]}
          </button>

          {showThemeMenu && (
            <div className={cn(
              'absolute bottom-full mb-1 bg-surface border border-border rounded-[var(--radius-lg)] shadow-lg py-1 w-48 z-50',
              isRTL ? 'right-0' : 'left-0'
            )}>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id);
                    setShowThemeMenu(false);
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-sm text-start hover:bg-surface-secondary transition-colors',
                    theme === t.id && 'text-accent font-medium'
                  )}
                >
                  {t.label[language]}
                </button>
              ))}
              <div className="border-t border-border my-1" />
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  onClick={() => setThemeVariant('light')}
                  className={cn(
                    'p-1.5 rounded-[var(--radius-sm)]',
                    themeVariant === 'light' ? 'bg-accent text-on-accent' : 'text-on-surface-secondary hover:bg-surface-secondary'
                  )}
                >
                  <Sun size={14} />
                </button>
                <button
                  onClick={() => setThemeVariant('dark')}
                  className={cn(
                    'p-1.5 rounded-[var(--radius-sm)]',
                    themeVariant === 'dark' ? 'bg-accent text-on-accent' : 'text-on-surface-secondary hover:bg-surface-secondary'
                  )}
                >
                  <Moon size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
