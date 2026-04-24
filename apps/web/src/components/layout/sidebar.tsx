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
  FolderKanban,
  GraduationCap,
  CalendarDays,
  HelpCircle,
  ClipboardList,
  Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ItemMenu } from '@/components/ui/item-menu';
import { SidebarClock } from './sidebar-clock';
import { WorkspaceSwitcher } from './workspace-switcher';

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  language: string;
  agentId?: string;
  archived?: boolean;
}

// Trait-based Latin transliterations to match the R12 rename. Keep
// the set aligned with BUILTIN_AGENT_DISPLAY in chat-view.tsx — any
// new agent should get its Arabic + Latin name added here so sidebar
// labels don't fall back to the raw agent id.
const AGENT_SHORT_NAMES: Record<string, { en: string; ar: string }> = {
  manager: { en: "Al-Ra'i", ar: 'الراعي' },
  doctor: { en: 'Al-Duktor', ar: 'الدكتور' },
  research: { en: 'Al-Bahith', ar: 'الباحث' },
  'reading-helper': { en: 'Al-Mulakhkhis', ar: 'المُلخِّص' },
  'writing-critic': { en: 'Al-Naqid', ar: 'الناقد' },
  comparator: { en: 'Al-Muqarin', ar: 'المُقارِن' },
  architect: { en: 'Al-Musammim', ar: 'المصمم' },
  'content-creator': { en: 'Al-Sarid', ar: 'السارد' },
  creative: { en: "Al-Mubdi'", ar: 'المبدع' },
  'tasks-agent': { en: 'Maham', ar: 'مهام' },
  analyst: { en: 'Al-Muhallil', ar: 'المحلل' },
  munazzim: { en: 'Al-Munazzim', ar: 'المنظّم' },
  mushakhkhis: { en: 'Al-Mushakhkhis', ar: 'المشخّص' },
  fatin: { en: 'Al-Fatin', ar: 'الفطين' },
  playmaker: { en: 'Al-Mumarrir', ar: 'المُمرر' },
  'research-companion': { en: 'Al-Khuwy', ar: 'الخوي' },
  mudawwin: { en: 'Al-Mudawwin', ar: 'المُدوّن' },
  sayyaq: { en: 'Al-Katib', ar: 'الكاتب' },
  clippy: { en: 'Clippy', ar: 'Clippy' },
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
  projects: { id: 'projects', icon: FolderKanban, label: { en: 'Projects', ar: 'المشاريع' }, href: '/projects' },
  approvals: { id: 'approvals', icon: Bell, label: { en: 'Approvals', ar: 'الموافقات' }, href: '/approvals' },
  workflows: { id: 'workflows', icon: Workflow, label: { en: 'Workflows', ar: 'سير العمل' }, href: '/workflows' },
  'workflow-runs': { id: 'workflow-runs', icon: Workflow, label: { en: 'Workflow Runs', ar: 'مسارات العمل' }, href: '/workflow-runs' },
  schedules: { id: 'schedules', icon: Clock, label: { en: 'Schedules', ar: 'الجدولة' }, href: '/schedules' },
  tools: { id: 'tools', icon: Wrench, label: { en: 'Tools', ar: 'الأدوات' }, href: '/tools' },
  shwasha: { id: 'shwasha', icon: BookOpen, label: { en: 'Reading', ar: 'القراءة' }, href: '/shwasha' },
  papers: { id: 'papers', icon: BookOpen, label: { en: 'Papers', ar: 'الأوراق' }, href: '/papers' },
  zotero: { id: 'zotero', icon: BookOpen, label: { en: 'Zotero', ar: 'Zotero' }, href: '/zotero' },
  notes: { id: 'notes', icon: NotebookPen, label: { en: 'Atomic Notes', ar: 'الملاحظات الذرية' }, href: '/notes' },
  'notes-keep': { id: 'notes-keep', icon: StickyNote, label: { en: 'Quick Notes', ar: 'ملاحظات سريعة' }, href: '/notes-keep' },
  'reports-inbox': { id: 'reports-inbox', icon: Mail, label: { en: 'Reports Inbox', ar: 'صندوق التقارير' }, href: '/reports-inbox' },
  knowledge: { id: 'knowledge', icon: Network, label: { en: 'Knowledge', ar: 'المعرفة' }, href: '/graph' },
  content: { id: 'content', icon: Palette, label: { en: 'Content', ar: 'المحتوى' }, href: '/content' },
  studio: { id: 'studio', icon: Video, label: { en: 'Studio', ar: 'الاستوديو' }, href: '/studio' },
  captions: { id: 'captions', icon: Captions, label: { en: 'Captions', ar: 'كابشنز' }, href: '/captions' },
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
  phd: { id: 'phd', icon: GraduationCap, label: { en: 'PhD Dashboard', ar: 'لوحة الدكتوراه' }, href: '/phd' },
  meetings: { id: 'meetings', icon: CalendarDays, label: { en: 'Meetings', ar: 'الاجتماعات' }, href: '/meetings' },
  companion: { id: 'companion', icon: GraduationCap, label: { en: 'Al-Khuwy', ar: 'الخوي' }, href: '/companion' },
  mudawwin: { id: 'mudawwin', icon: ClipboardList, label: { en: 'Al-Mudawwin', ar: 'المُدوّن' }, href: '/mudawwin' },
  supervision: { id: 'supervision', icon: Bell, label: { en: 'Supervision', ar: 'الإشراف' }, href: '/supervision' },
  'reading-queue': { id: 'reading-queue', icon: BookOpen, label: { en: 'Reading Queue', ar: 'قائمة القراءة' }, href: '/reading-queue' },
  sources: { id: 'sources', icon: Box, label: { en: 'Sources Hub', ar: 'مركز المصادر' }, href: '/sources' },
  inbox: { id: 'inbox', icon: StickyNote, label: { en: 'Inbox', ar: 'صندوق الالتقاط' }, href: '/inbox' },
  search: { id: 'search', icon: MessageSquare, label: { en: 'Smart Search', ar: 'البحث الذكي' }, href: '/search' },
  canvas: { id: 'canvas', icon: Network, label: { en: 'Canvas', ar: 'الكانفس' }, href: '/canvas' },
  'audit-log': { id: 'audit-log', icon: Eye, label: { en: 'Activity Log', ar: 'سجل النشاط' }, href: '/audit-log' },
  setup: { id: 'setup', icon: Settings, label: { en: 'Setup / Reset', ar: 'الإعداد / التصفير' }, href: '/setup' },
  ambient: { id: 'ambient', icon: HelpCircle, label: { en: 'Ambient (TV)', ar: 'شاشة العرض' }, href: '/ambient' },
};

// ── Workspaces ─────────────────────────────────────────────────────────
// Each workspace is a focused "mode" (PhD / Studio / Ops / Lab / System).
// When selected, only its items show — keeps the sidebar lean for the task at hand.
interface Workspace {
  id: string;
  label: { en: string; ar: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  /** Sections inside this workspace — each section has a title and item ids. */
  sections: Array<{
    title?: { en: string; ar: string };
    items: string[];
  }>;
}

const WORKSPACES: Workspace[] = [
  {
    id: 'phd',
    label: { en: 'PhD Research', ar: 'الدكتوراه' },
    icon: GraduationCap,
    // R14-#10 IA pass: merged the one-item "Connections" section
    // (knowledge graph) into "Sources & Reading" so the workspace
    // has three flowing sections instead of four. `mudawwin` moved
    // out of "Today" into its own "Writing" section to sit next to
    // notes + papers.
    sections: [
      {
        title: { en: 'Today', ar: 'اليوم' },
        items: ['phd', 'companion', 'inbox', 'search'],
      },
      {
        title: { en: 'Sources & Reading', ar: 'المصادر والقراءة' },
        items: ['sources', 'zotero', 'reading-queue', 'shwasha', 'papers', 'knowledge'],
      },
      {
        title: { en: 'Writing', ar: 'الكتابة' },
        items: ['notes', 'mudawwin', 'canvas'],
      },
      {
        title: { en: 'Supervision', ar: 'الإشراف' },
        items: ['supervision', 'meetings'],
      },
    ],
  },
  {
    id: 'studio',
    label: { en: 'Content Studio', ar: 'الاستوديو' },
    icon: Video,
    sections: [
      {
        title: { en: 'Production', ar: 'الإنتاج' },
        items: ['studio', 'captions', 'library', 'content'],
      },
    ],
  },
  // R12b (2026-04-23): consolidated 'ops' + 'intelligence' into a
  // single 'agents' workspace — previously the team/automation split
  // overlapped with live/analysis, and the user couldn't tell where
  // to go. Now one roof: Team → Automation → Monitoring → Analysis.
  // 'lab' workspace removed same day — merged into studio.
  {
    id: 'agents',
    label: { en: 'Agents & Ops', ar: 'الوكلاء والتشغيل' },
    icon: Bot,
    sections: [
      {
        title: { en: 'Team', ar: 'الفريق' },
        items: ['agents', 'projects', 'approvals'],
      },
      {
        title: { en: 'Automation', ar: 'الأتمتة' },
        items: ['workflows', 'workflow-runs', 'schedules', 'triggers', 'tools'],
      },
      {
        title: { en: 'Live', ar: 'مباشر' },
        items: ['control', 'runs', 'watcher'],
      },
      {
        title: { en: 'Analysis', ar: 'التحليل' },
        // R15 IA: `analyst` moved from System/Diagnostics to here —
        // it IS an agent (cost/subscription analyst) and belongs with
        // other agent-facing analytic tools, not in Settings territory.
        items: ['memory', 'artifacts', 'evaluator', 'analyst'],
      },
    ],
  },
  {
    id: 'system',
    label: { en: 'System', ar: 'النظام' },
    icon: Settings,
    sections: [
      {
        title: { en: 'Workspace', ar: 'مساحة العمل' },
        // R13 IA pass: `setup` promoted to System-workspace only
        // (it's destructive — hide it from casual nav). `ambient` is
        // an always-on TV view, not workspace-specific — moved into
        // System for discoverability.
        items: ['settings', 'conversations', 'ambient', 'audit-log', 'setup'],
      },
      {
        title: { en: 'Diagnostics', ar: 'التشخيص' },
        // R15 IA: `analyst` moved to Agents/Analysis (it's an agent,
        // not system plumbing). Remaining items are actual system
        // diagnostics.
        items: ['files', 'blackbox', 'usage'],
      },
    ],
  },
];

// Quick-access: visible at the top regardless of workspace.
const QUICK_ACCESS = ['home', 'dashboard', 'reports-inbox', 'tasks', 'notes-keep', 'notifications'];

// Canonical workspace key — must match WorkspaceSwitcher (ruhool.active-workspace).
// Previously sidebar used 'ruhool-workspace' which desynced from the top toggle.
const WORKSPACE_KEY = 'ruhool.active-workspace';

function loadActiveWorkspace(): string {
  if (typeof window === 'undefined') return 'phd';
  try {
    // Migrate: if the old key exists, move its value into the new one.
    const old = localStorage.getItem('ruhool-workspace');
    if (old && !localStorage.getItem(WORKSPACE_KEY)) {
      localStorage.setItem(WORKSPACE_KEY, old);
      localStorage.removeItem('ruhool-workspace');
    }
    return localStorage.getItem(WORKSPACE_KEY) || 'phd';
  } catch { return 'phd'; }
}

function saveActiveWorkspace(id: string) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(WORKSPACE_KEY, id);
      // Emit the same event the WorkspaceSwitcher listens to, so both
      // controls stay in sync whichever the user clicks.
      window.dispatchEvent(new CustomEvent('ruhool:workspace-change', { detail: id }));
    } catch { /* ignore */ }
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

// Generic theme names — user can rename or reorder via settings later.
const THEMES = [
  { id: 'claude-clean',  label: { en: 'Theme 1', ar: 'سمة 1' } },
  { id: 'desert-caravan', label: { en: 'Theme 2', ar: 'سمة 2' } },
  { id: 'academic',      label: { en: 'Theme 3', ar: 'سمة 3' } },
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
  const [activeWorkspace, setActiveWorkspace] = useState<string>(loadActiveWorkspace);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);

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

  // Sync workspace from localStorage on mount + whenever the top
  // WorkspaceSwitcher fires 'ruhool:workspace-change' (or storage
  // updates from another tab).
  useEffect(() => {
    setActiveWorkspace(loadActiveWorkspace());
    const onChange = () => setActiveWorkspace(loadActiveWorkspace());
    window.addEventListener('ruhool:workspace-change', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('ruhool:workspace-change', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const switchWorkspace = (id: string) => {
    setActiveWorkspace(id);
    saveActiveWorkspace(id);
    setShowWorkspaceMenu(false);
  };

  const handleNavigate = (id: string, href: string) => {
    setActivePage(id);
    router.push(href);
    onMobileNavigate?.();
  };

  const currentWorkspace = WORKSPACES.find((w) => w.id === activeWorkspace) ?? WORKSPACES[0];

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
      {/* Logo / Expand button */}
      {sidebarOpen ? (
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
          <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0">
            <img src="/logo.png" alt="Ruhool" className="w-full h-full object-contain" />
          </div>
          <span className="font-semibold text-on-surface truncate">
            {isRTL ? 'رحول' : 'Ruhool'}
          </span>
          <button
            onClick={toggleSidebar}
            title={isRTL ? 'طي الشريط' : 'Collapse sidebar'}
            className={cn(
              'p-1.5 rounded hover:bg-sidebar-hover text-on-surface-tertiary hover:text-on-surface',
              isRTL ? 'mr-auto' : 'ml-auto'
            )}
          >
            {isRTL ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      ) : (
        // Collapsed: whole 64px header is a big expand target with a clear chevron icon.
        <button
          onClick={toggleSidebar}
          title={isRTL ? 'فتح الشريط' : 'Expand sidebar'}
          aria-label={isRTL ? 'فتح الشريط' : 'Expand sidebar'}
          className="relative flex items-center justify-center h-14 w-full border-b border-border hover:bg-sidebar-hover text-on-surface-tertiary hover:text-accent transition-colors group"
        >
          {/* Chevron is the primary affordance — bigger and centered */}
          {isRTL ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      )}

      {/* R15-#22 — WorkspaceSwitcher always visible in the sidebar.
          Compact (icon-only) when sidebar is collapsed, full when open.
          Top toolbar's switcher is redundant on mobile where the
          toolbar is hidden; this one stays. */}
      <div className={cn('px-3 pt-3', !sidebarOpen && 'px-2')}>
        <WorkspaceSwitcher compact={!sidebarOpen} />
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

      {/* Workspace switcher */}
      {sidebarOpen ? (
        <div className="px-3 pt-1 pb-2 relative">
          <button
            onClick={() => setShowWorkspaceMenu((v) => !v)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-[var(--radius)] bg-sidebar-active text-on-surface text-sm hover:bg-sidebar-hover transition-colors"
          >
            <currentWorkspace.icon size={16} className="shrink-0 text-accent" />
            <span className="flex-1 text-start font-semibold truncate">
              {currentWorkspace.label[language]}
            </span>
            <ChevronDown size={14} className={cn('transition-transform', showWorkspaceMenu && 'rotate-180')} />
          </button>
          {showWorkspaceMenu && (
            <div className="absolute top-full inset-x-3 mt-1 bg-surface border border-border rounded-[var(--radius-lg)] shadow-lg py-1 z-50">
              {WORKSPACES.map((w) => (
                <button
                  key={w.id}
                  onClick={() => switchWorkspace(w.id)}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-sidebar-hover transition-colors text-start',
                    activeWorkspace === w.id ? 'text-accent font-semibold' : 'text-on-surface-secondary'
                  )}
                >
                  <w.icon size={14} className="shrink-0" />
                  <span className="flex-1">{w.label[language]}</span>
                  {activeWorkspace === w.id && <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        // Collapsed: just an icon for the active workspace; click to cycle through
        <div className="px-2 pt-1 pb-2">
          <button
            onClick={() => {
              const idx = WORKSPACES.findIndex((w) => w.id === activeWorkspace);
              const next = WORKSPACES[(idx + 1) % WORKSPACES.length];
              switchWorkspace(next.id);
            }}
            title={isRTL ? `مساحة العمل: ${currentWorkspace.label.ar}` : `Workspace: ${currentWorkspace.label.en}`}
            className="flex items-center justify-center w-full p-2 rounded-[var(--radius)] bg-sidebar-active text-accent hover:bg-sidebar-hover transition-colors"
          >
            <currentWorkspace.icon size={18} />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="px-3 space-y-0.5 overflow-auto flex-1">
        {/* Quick access — always visible across all workspaces */}
        {QUICK_ACCESS.map((itemId) => {
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

        {/* Workspace divider */}
        <div className={cn('mt-3 mb-1 h-px bg-border', !sidebarOpen && 'mx-2')} />

        {/* Workspace sections */}
        {currentWorkspace.sections.map((section, sIdx) => (
          <div key={sIdx} className={sIdx > 0 ? 'mt-3' : ''}>
            {sidebarOpen && section.title && (
              <p className="px-3 py-1 text-[10px] text-on-surface-tertiary uppercase tracking-wider">
                {section.title[language]}
              </p>
            )}
            {!sidebarOpen && sIdx > 0 && <div className="h-px bg-border mx-2 my-1" />}
            <div className="space-y-0.5">
              {section.items.map((itemId) => {
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

      {/* (Bottom controls removed — language/theme/clock all moved to TopToolbar) */}
    </aside>
  );
}
