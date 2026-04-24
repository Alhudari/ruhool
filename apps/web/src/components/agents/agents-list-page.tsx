'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Network,
  LayoutList,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ItemMenu, ShowArchivedToggle } from '@/components/ui/item-menu';

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
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
};

interface AgentOrgDepartment {
  id: string;
  label: { ar: string; en: string };
  icon?: string;
  color?: string;
  manager: string;
  workers: string[];
}
interface ResolvedDepartment extends AgentOrgDepartment {
  managerName: { ar: string; en: string } | null;
  workerNames: Array<{ id: string; name: { ar: string; en: string } | null; known: boolean }>;
  managerKnown: boolean;
}
interface ResolvedWorkspace {
  id: string;
  label: { ar: string; en: string };
  icon?: string;
  color?: string;
  ceo: { id: string; name: { ar: string; en: string } | null; known: boolean };
  departments: ResolvedDepartment[];
}
interface AgentOrgResponse {
  org: {
    version: number;
    updatedAt: string;
    workspaces?: Array<{ id: string; ceo: string; departments: AgentOrgDepartment[]; label: { ar: string; en: string } }>;
    // Legacy v1 fields kept for back-compat:
    ceo?: string;
    departments?: AgentOrgDepartment[];
  };
  resolved: {
    workspaces?: ResolvedWorkspace[];
    sharedServices?: Array<{ id: string; name: { ar: string; en: string } | null; known: boolean }>;
    platformAdmins?: Array<{ id: string; name: { ar: string; en: string } | null; known: boolean }>;
    unassigned: Array<{ id: string; name: { ar: string; en: string }; builtIn: boolean }>;
    // Legacy v1 fallback:
    ceo?: { id: string; name: { ar: string; en: string } | null; known: boolean };
    departments?: ResolvedDepartment[];
  };
}

type View = 'list' | 'org';

export function AgentsListPage() {
  const { language } = useAppStore();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<View>('list');
  const [org, setOrg] = useState<AgentOrgResponse | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const isRTL = language === 'ar';

  const load = useCallback(() => {
    apiFetch<Agent[]>(`/api/agents?archived=${showArchived}`)
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [showArchived]);

  const loadOrg = useCallback(() => {
    setOrgLoading(true);
    setOrgError(null);
    apiFetch<AgentOrgResponse>('/api/agent-org')
      .then(setOrg)
      .catch((e) => setOrgError(e instanceof Error ? e.message : 'Failed to load org'))
      .finally(() => setOrgLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (view === 'org' && !org && !orgLoading) loadOrg();
  }, [view, org, orgLoading, loadOrg]);

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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bot size={24} className="text-on-surface-secondary" />
          <h1 className="text-xl font-semibold text-on-surface">
            {isRTL ? 'الوكلاء' : 'Agents'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-[var(--radius)] border border-border overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={cn(
                'px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors',
                view === 'list' ? 'bg-accent text-on-accent' : 'text-on-surface-secondary hover:bg-surface-secondary',
              )}
              title={isRTL ? 'عرض قائمة' : 'List view'}
            >
              <LayoutList size={12} />
              {isRTL ? 'قائمة' : 'List'}
            </button>
            <button
              onClick={() => setView('org')}
              className={cn(
                'px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors border-s border-border',
                view === 'org' ? 'bg-accent text-on-accent' : 'text-on-surface-secondary hover:bg-surface-secondary',
              )}
              title={isRTL ? 'عرض شجرة المؤسسة' : 'Org view'}
            >
              <Network size={12} />
              {isRTL ? 'المؤسسة' : 'Org'}
            </button>
          </div>
          {view === 'list' && (
            <ShowArchivedToggle value={showArchived} onChange={setShowArchived} isRTL={isRTL} />
          )}
          <button
            onClick={() => router.push('/agents/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] bg-accent text-on-accent hover:bg-accent-hover transition-colors text-sm"
          >
            <Plus size={16} />
            {isRTL ? 'وكيل جديد' : 'New Agent'}
          </button>
        </div>
      </div>

      {view === 'org' ? (
        <OrgView
          org={org}
          loading={orgLoading}
          error={orgError}
          agents={agents}
          language={language}
          isRTL={isRTL}
          router={router}
        />
      ) : (
        <ListView
          builtInAgents={builtInAgents}
          customAgents={customAgents}
          isRTL={isRTL}
          language={language}
          router={router}
          onArchive={archiveAgent}
          onDelete={deleteAgent}
        />
      )}
    </div>
  );
}

function ListView({
  builtInAgents,
  customAgents,
  isRTL,
  language,
  router,
  onArchive,
  onDelete,
}: {
  builtInAgents: Agent[];
  customAgents: Agent[];
  isRTL: boolean;
  language: 'ar' | 'en';
  router: ReturnType<typeof useRouter>;
  onArchive: (id: string, archived: boolean) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  return (
    <>
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
                      onArchive={() => onArchive(agent.id, true)}
                      onUnarchive={() => onArchive(agent.id, false)}
                      onDelete={() => onDelete(agent.id)}
                      deleteConfirmMessage={isRTL ? 'حذف هذا الوكيل نهائيًا؟ سيتم فقد جميع المحادثات المرتبطة به.' : 'Delete this agent permanently? Related conversations will lose their agent reference.'}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function OrgView({
  org,
  loading,
  error,
  agents,
  language,
  isRTL,
  router,
}: {
  org: AgentOrgResponse | null;
  loading: boolean;
  error: string | null;
  agents: Agent[];
  language: 'ar' | 'en';
  isRTL: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Roving tabindex: one treeitem at a time is tabbable (tabIndex=0).
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const treeRef = useRef<HTMLUListElement | null>(null);

  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const toggle = useCallback((id: string) => setExpanded((p) => ({ ...p, [id]: !(p[id] ?? true) })), []);
  const isOpen = useCallback((id: string) => expanded[id] ?? true, [expanded]);

  // Resolve workspaces list (v2) or fall back to legacy single-org shape.
  const workspaces: ResolvedWorkspace[] = useMemo(() => {
    if (!org) return [];
    if (Array.isArray(org.resolved.workspaces)) return org.resolved.workspaces;
    // Legacy v1 fallback.
    if (org.resolved.ceo && org.resolved.departments) {
      return [{
        id: 'phd',
        label: { ar: 'الدكتوراه', en: 'PhD' },
        ceo: org.resolved.ceo,
        departments: org.resolved.departments,
      }];
    }
    return [];
  }, [org]);

  const activeWs = useMemo(() => {
    if (!workspaces.length) return null;
    return workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];
  }, [workspaces, activeWorkspaceId]);

  const AgentCard = ({ id, role, warn }: { id: string; role: 'ceo' | 'manager' | 'worker'; warn?: boolean }) => {
    const agent = byId.get(id);
    if (!agent) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius)] border border-dashed border-warning/40 bg-warning/5 text-xs">
          <AlertTriangle size={12} className="text-warning shrink-0" />
          <span className="text-warning font-mono">{id}</span>
          <span className="text-on-surface-tertiary">{isRTL ? '(غير معروف)' : '(unknown)'}</span>
        </div>
      );
    }
    const IconComp = ICON_MAP[agent.icon] || Bot;
    const colorClasses = COLOR_MAP[agent.color] || COLOR_MAP.gray;
    const badge = role === 'ceo'
      ? { label: { ar: 'المدير العام', en: 'CEO' }, cls: 'bg-accent text-on-accent' }
      : role === 'manager'
        ? { label: { ar: 'مدير قسم', en: 'Manager' }, cls: 'bg-accent/10 text-accent' }
        : null;

    return (
      <button
        onClick={() => router.push(`/agents/${id}`)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] border transition-all text-start',
          warn ? 'border-warning/40 bg-warning/5' : 'border-border hover:border-border-hover hover:bg-surface-secondary',
        )}
      >
        <div className={cn('p-1.5 rounded shrink-0', colorClasses)}>
          <IconComp size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-on-surface">{agent.name[language]}</span>
            {badge && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', badge.cls)}>
                {badge.label[language]}
              </span>
            )}
          </div>
          <p className="text-[10px] text-on-surface-tertiary mt-0.5 line-clamp-1">
            {agent.description[language]}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/agents/${id}/chat`); }}
          className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors flex items-center gap-1"
        >
          <MessageCircle size={10} />
          {isRTL ? 'محادثة' : 'Chat'}
        </button>
      </button>
    );
  };

  // Flat, in-order list of **visible** nodes, with each node's metadata.
  // The Arrow-key keyboard model walks this list.
  interface Visible {
    id: string;
    kind: 'ceo' | 'dept' | 'manager' | 'worker' | 'unassigned';
    level: number;
    expanded?: boolean;
    expandable: boolean;
    agentIdForActivate?: string;  // pressing Enter navigates here
    deptId?: string;              // only on dept rows
  }

  const visible = useMemo<Visible[]>(() => {
    if (!org || !activeWs) return [];
    const out: Visible[] = [];
    out.push({
      id: `ceo:${activeWs.ceo.id}`,
      kind: 'ceo',
      level: 1,
      expandable: false,
      agentIdForActivate: activeWs.ceo.id,
    });
    for (const d of activeWs.departments) {
      const dId = `dept:${d.id}`;
      out.push({
        id: dId,
        kind: 'dept',
        level: 1,
        expandable: true,
        expanded: isOpen(d.id),
        deptId: d.id,
      });
      if (isOpen(d.id)) {
        out.push({
          id: `manager:${d.manager}`,
          kind: 'manager',
          level: 2,
          expandable: false,
          agentIdForActivate: d.manager,
        });
        for (const w of d.workers) {
          out.push({
            id: `worker:${w}`,
            kind: 'worker',
            level: 2,
            expandable: false,
            agentIdForActivate: w,
          });
        }
      }
    }
    for (const u of (org.resolved.unassigned ?? [])) {
      out.push({
        id: `unassigned:${u.id}`,
        kind: 'unassigned',
        level: 1,
        expandable: false,
        agentIdForActivate: u.id,
      });
    }
    return out;
  }, [org, activeWs, expanded, isOpen]);

  const focusedIdx = visible.findIndex((v) => v.id === focusedId);
  const activeFocusId = focusedId ?? visible[0]?.id;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-on-surface-tertiary" />
      </div>
    );
  }
  if (error || !org) {
    return (
      <div className="text-center py-12 border border-dashed border-border rounded-[var(--radius-lg)]">
        <AlertTriangle size={32} className="mx-auto text-warning mb-3" />
        <p className="text-sm text-on-surface-secondary">
          {isRTL ? 'لم يتم إعداد هيكل المؤسسة بعد' : 'Organization not configured yet'}
        </p>
        <p className="text-xs text-on-surface-tertiary mt-1">
          {isRTL ? 'عدّل data/agent-org.json لإنشاء الهيكل' : 'Edit data/agent-org.json to define one'}
        </p>
        {error && <p className="text-[10px] text-error mt-2 font-mono">{error}</p>}
      </div>
    );
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!visible.length) return;
    const currentIdx = Math.max(0, focusedIdx);
    const current = visible[currentIdx];
    // Arrow keys differ by RTL — Left/Right swap semantics in Arabic.
    const expandKey = isRTL ? 'ArrowLeft' : 'ArrowRight';
    const collapseKey = isRTL ? 'ArrowRight' : 'ArrowLeft';

    const moveFocus = (id: string) => {
      setFocusedId(id);
      // The element's tabIndex is 0 for focused, -1 otherwise. Actual
      // focus() is called via the ref in onKeyDown.
      const el = treeRef.current?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(id)}"]`);
      el?.focus();
    };

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = visible[Math.min(visible.length - 1, currentIdx + 1)];
      if (next) moveFocus(next.id);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = visible[Math.max(0, currentIdx - 1)];
      if (prev) moveFocus(prev.id);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      moveFocus(visible[0].id);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      moveFocus(visible[visible.length - 1].id);
      return;
    }
    if (e.key === expandKey) {
      // Expand or descend.
      if (current?.expandable && !current.expanded && current.deptId) {
        e.preventDefault();
        toggle(current.deptId);
        return;
      }
      if (current?.expandable && current.expanded) {
        e.preventDefault();
        const next = visible[currentIdx + 1];
        if (next) moveFocus(next.id);
        return;
      }
    }
    if (e.key === collapseKey) {
      if (current?.expandable && current.expanded && current.deptId) {
        e.preventDefault();
        toggle(current.deptId);
        return;
      }
      // On a child, move focus to its parent dept header.
      if (current?.level === 2) {
        e.preventDefault();
        for (let i = currentIdx - 1; i >= 0; i -= 1) {
          if (visible[i].kind === 'dept') { moveFocus(visible[i].id); break; }
        }
        return;
      }
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (current?.expandable && current.deptId) {
        e.preventDefault();
        toggle(current.deptId);
        return;
      }
      if (current?.agentIdForActivate) {
        e.preventDefault();
        router.push(`/agents/${current.agentIdForActivate}`);
      }
    }
  };

  const renderAgentTreeItem = (
    node: Visible,
    agent: Agent | undefined,
    tree: { setsize: number; posinset: number },
    warn?: boolean,
  ) => {
    const IconComp = agent ? (ICON_MAP[agent.icon] || Bot) : Bot;
    const colorClasses = agent ? (COLOR_MAP[agent.color] || COLOR_MAP.gray) : COLOR_MAP.gray;
    const role = node.kind as 'ceo' | 'manager' | 'worker' | 'unassigned';
    const badge = role === 'ceo'
      ? { label: { ar: 'المدير العام', en: 'CEO' }, cls: 'bg-accent text-on-accent' }
      : role === 'manager'
        ? { label: { ar: 'مدير قسم', en: 'Manager' }, cls: 'bg-accent/10 text-accent' }
        : null;
    const isFocused = activeFocusId === node.id;
    return (
      <li
        key={node.id}
        role="treeitem"
        aria-level={node.level}
        aria-setsize={tree.setsize}
        aria-posinset={tree.posinset}
        aria-selected={isFocused}
      >
        <div
          data-tree-id={node.id}
          tabIndex={isFocused ? 0 : -1}
          onFocus={() => setFocusedId(node.id)}
          onClick={() => agent && router.push(`/agents/${agent.id}`)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] border transition-all text-start cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent',
            warn ? 'border-warning/40 bg-warning/5' : 'border-border hover:border-border-hover hover:bg-surface-secondary',
          )}
        >
          {agent ? (
            <>
              <div className={cn('p-1.5 rounded shrink-0', colorClasses)}>
                <IconComp size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-on-surface">{agent.name[language]}</span>
                  {badge && (
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', badge.cls)}>
                      {badge.label[language]}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-on-surface-tertiary mt-0.5 line-clamp-1">
                  {agent.description[language]}
                </p>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <AlertTriangle size={12} className="text-warning shrink-0" />
              <span className="text-warning font-mono">{node.agentIdForActivate}</span>
              <span className="text-on-surface-tertiary">{isRTL ? '(غير معروف)' : '(unknown)'}</span>
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="p-3 rounded-[var(--radius-lg)] bg-info/5 border border-info/20 text-xs text-on-surface-secondary">
        <div className="flex items-start gap-2">
          <Users size={14} className="text-info shrink-0 mt-0.5" />
          <div>
            <p>
              {isRTL
                ? 'هيكل المؤسسة: لكل غرفة مديرها وأقسامها. المدير العام يوجّه مدراء الأقسام، وكل مدير يوجّه فريقه.'
                : 'Company model: each workspace has its own CEO and departments. CEO routes to department managers; each manager delegates to workers.'}
            </p>
          </div>
        </div>
      </div>

      {/* Workspace tabs */}
      {workspaces.length > 1 && (
        <div className="flex items-center gap-1 border-b border-border" role="tablist" aria-label={isRTL ? 'الغرف' : 'Workspaces'}>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              role="tab"
              aria-selected={activeWs?.id === ws.id}
              onClick={() => { setActiveWorkspaceId(ws.id); setFocusedId(null); }}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeWs?.id === ws.id
                  ? 'text-accent border-accent'
                  : 'text-on-surface-secondary border-transparent hover:text-on-surface',
              )}
            >
              {ws.label[language]}
              <span className="text-[10px] text-on-surface-tertiary ms-1.5">
                ({ws.departments.length})
              </span>
            </button>
          ))}
        </div>
      )}

      <ul
        ref={treeRef}
        role="tree"
        aria-label={isRTL ? 'هيكل المؤسسة' : 'Organization tree'}
        onKeyDown={onKeyDown}
        className="space-y-2"
      >
        {(() => {
          // Compute setsize/posinset per level.
          const rootNodes = visible.filter((v) => v.level === 1);
          const rootCount = rootNodes.length;
          let rootPos = 0;
          return visible.map((node) => {
            if (node.level === 1) rootPos += 1;
            if (node.kind === 'ceo' && activeWs) {
              return renderAgentTreeItem(node, byId.get(activeWs.ceo.id), { setsize: rootCount, posinset: rootPos }, !activeWs.ceo.known);
            }
            if (node.kind === 'dept' && node.deptId && activeWs) {
              const dept = activeWs.departments.find((d) => d.id === node.deptId);
              if (!dept) return null;
              const open = node.expanded ?? false;
              const deptKids = open ? 1 + dept.workers.length : 0;
              const isFocused = activeFocusId === node.id;
              return (
                <li
                  key={node.id}
                  role="treeitem"
                  aria-level={1}
                  aria-expanded={open}
                  aria-setsize={rootCount}
                  aria-posinset={rootPos}
                  aria-selected={isFocused}
                >
                  <div
                    data-tree-id={node.id}
                    tabIndex={isFocused ? 0 : -1}
                    onFocus={() => setFocusedId(node.id)}
                    onClick={() => toggle(dept.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-surface-secondary hover:bg-surface-tertiary transition-colors rounded-[var(--radius)] cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {open
                      ? <ChevronDown size={14} className="text-on-surface-tertiary" aria-hidden="true" />
                      : <ChevronRight size={14} className={cn('text-on-surface-tertiary', isRTL && 'rotate-180')} aria-hidden="true" />}
                    <span className="text-sm font-semibold text-on-surface flex-1">{dept.label[language]}</span>
                    <span className="text-[10px] text-on-surface-tertiary">
                      {isRTL ? `${dept.workers.length} أعضاء` : `${dept.workers.length} members`}
                    </span>
                  </div>
                  {open && (
                    <ul
                      role="group"
                      className={cn('mt-2 space-y-2 ps-4 border-s-2 border-border', isRTL && 'border-s-0 border-e-2 pe-4 ps-0')}
                    >
                      {[
                        { id: `manager:${dept.manager}`, agentId: dept.manager, kind: 'manager' as const, warn: !dept.managerKnown },
                        ...dept.workers.map((w) => ({ id: `worker:${w}`, agentId: w, kind: 'worker' as const, warn: !byId.has(w) })),
                      ].map((child, ci, arr) => {
                        const isChildFocused = activeFocusId === child.id;
                        return renderAgentTreeItem(
                          {
                            id: child.id,
                            kind: child.kind,
                            level: 2,
                            expandable: false,
                            agentIdForActivate: child.agentId,
                          },
                          byId.get(child.agentId),
                          { setsize: deptKids, posinset: ci + 1 },
                          child.warn,
                        ) || (isChildFocused ? null : null);
                      })}
                    </ul>
                  )}
                </li>
              );
            }
            return null;
          });
        })()}
      </ul>

      {/* Shared services */}
      {(org.resolved.sharedServices ?? []).length > 0 && (
        <div>
          <p className="text-xs text-on-surface-tertiary uppercase tracking-wider mb-2 px-1">
            {isRTL ? 'خدمات مشتركة (تستخدمها كل الغرف)' : 'Shared services (across workspaces)'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(org.resolved.sharedServices ?? []).map((a) => (
              <AgentCard key={a.id} id={a.id} role="worker" warn={!a.known} />
            ))}
          </div>
        </div>
      )}

      {/* Platform admins */}
      {(org.resolved.platformAdmins ?? []).length > 0 && (
        <div>
          <p className="text-xs text-on-surface-tertiary uppercase tracking-wider mb-2 px-1">
            {isRTL ? 'إدارة المنصة' : 'Platform administration'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(org.resolved.platformAdmins ?? []).map((a) => (
              <AgentCard key={a.id} id={a.id} role="manager" warn={!a.known} />
            ))}
          </div>
        </div>
      )}

      {/* Unassigned agents */}
      {(org.resolved.unassigned ?? []).length > 0 && (
        <div>
          <p className="text-xs text-on-surface-tertiary uppercase tracking-wider mb-2 px-1">
            {isRTL ? 'بدون قسم' : 'Unassigned'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(org.resolved.unassigned ?? []).map((a) => (
              <AgentCard key={a.id} id={a.id} role="worker" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
