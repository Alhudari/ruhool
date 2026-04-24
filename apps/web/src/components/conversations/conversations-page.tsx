'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Archive, Trash2, Pin, FolderInput, Users, User, LayoutGrid, List, Table as TableIcon, Filter, AlertTriangle, Check, X, Plus, Pencil, FolderKanban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

interface Conversation {
  id: string;
  title: string;
  agentId?: string;
  participants?: string[];
  archived?: boolean;
  createdAt: string;
  updatedAt?: string;
  projectId?: string | null;
}
interface Project {
  id: string; name: string; description?: string; instructions?: string; color?: string; pinned?: boolean; archived?: boolean;
}
interface DeletionImpact { messages: number; memories: number; tasks: number; approvals: number; }

const AGENT_NAMES: Record<string, { ar: string; en: string }> = {
  manager: { ar: 'الراعي', en: "Al-Ra'i" },
  doctor: { ar: 'الدكتور', en: 'Al-Duktor' },
  research: { ar: 'الباحث', en: 'Al-Bahith' },
  'reading-helper': { ar: 'المُلخِّص', en: 'Al-Mulakhkhis' },
  'writing-critic': { ar: 'الناقد', en: 'Al-Naqid' },
  comparator: { ar: 'المُقارِن', en: 'Al-Muqarin' },
  architect: { ar: 'المصمم', en: 'Al-Musammim' },
  'content-creator': { ar: 'السارد', en: 'Al-Sarid' },
  creative: { ar: 'المبدع', en: "Al-Mubdi'" },
  'tasks-agent': { ar: 'مهام', en: 'Maham' },
  analyst: { ar: 'المحلل', en: 'Al-Muhallil' },
  munazzim: { ar: 'المنظّم', en: 'Al-Munazzim' },
  mushakhkhis: { ar: 'المشخّص', en: 'Al-Mushakhkhis' },
  'research-companion': { ar: 'الخوي', en: 'Al-Khuwy' },
  fatin: { ar: 'الفطين', en: 'Al-Fatin' },
  playmaker: { ar: 'المُمرر', en: 'Al-Mumarrir' },
  mudawwin: { ar: 'المُدوّن', en: 'Al-Mudawwin' },
  sayyaq: { ar: 'الكاتب', en: 'Al-Katib' },
  clippy: { ar: 'Clippy', en: 'Clippy' },
};

export function ConversationsPageView() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'table' | 'list' | 'cards'>('table');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<'all' | 'individual' | 'group'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDel, setConfirmDel] = useState<{ ids: string[]; impacts: DeletionImpact | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState<Project | null | 'new'>(null);

  const reload = async () => {
    try {
      const [c, p, store] = await Promise.all([
        apiFetch<Conversation[]>('/api/conversations'),
        apiFetch<Project[]>('/api/projects'),
        apiFetch<{ pinnedConversations?: string[] }>('/api/store/pinned').catch(() => ({ pinnedConversations: [] })),
      ]);
      setConvs(c); setProjects(p);
      setPinnedIds(store.pinnedConversations || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    return convs.filter((cv) => {
      if (showArchived !== !!cv.archived) return false;
      if (agentFilter !== 'all' && cv.agentId !== agentFilter) return false;
      if (projectFilter !== 'all') {
        if (projectFilter === 'none' && cv.projectId) return false;
        if (projectFilter !== 'none' && cv.projectId !== projectFilter) return false;
      }
      const isGroup = (cv.participants?.length || 1) > 1;
      if (groupFilter === 'group' && !isGroup) return false;
      if (groupFilter === 'individual' && isGroup) return false;
      return true;
    }).sort((a, b) => {
      const ap = pinnedIds.includes(a.id), bp = pinnedIds.includes(b.id);
      if (ap !== bp) return ap ? -1 : 1;
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    });
  }, [convs, agentFilter, projectFilter, groupFilter, showArchived, pinnedIds]);

  const allSelectedVisible = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const toggleAll = () => {
    if (allSelectedVisible) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  };
  const toggleOne = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  const bulk = async (action: string, projectId?: string | null) => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await apiFetch('/api/conversations/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selected), action, projectId }),
      });
      setSelected(new Set());
      reload();
    } finally { setBusy(false); }
  };

  const openDeleteConfirm = async (ids: string[]) => {
    const impacts = await Promise.all(ids.map((id) => apiFetch<DeletionImpact>(`/api/conversations/${id}/deletion-impact`).catch(() => ({ messages: 0, memories: 0, tasks: 0, approvals: 0 }))));
    const total = impacts.reduce((acc, i) => ({ messages: acc.messages + i.messages, memories: acc.memories + i.memories, tasks: acc.tasks + i.tasks, approvals: acc.approvals + i.approvals }), { messages: 0, memories: 0, tasks: 0, approvals: 0 });
    setConfirmDel({ ids, impacts: total });
  };

  const togglePinSingle = async (id: string, pinned: boolean) => {
    await apiFetch(`/api/conversations/${id}/pin`, { method: 'PUT', body: JSON.stringify({ pinned }) });
    reload();
  };
  const moveToProject = async (id: string, projectId: string | null) => {
    await apiFetch(`/api/conversations/${id}/project`, { method: 'PUT', body: JSON.stringify({ projectId }) });
    reload();
  };

  if (loading) return <div className="p-12 text-center text-on-surface-tertiary">…</div>;

  return (
    <div className={cn('max-w-7xl mx-auto px-6 py-6 space-y-4', isRTL && 'rtl')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
            <MessageSquare size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-on-surface">{isRTL ? 'إدارة المحادثات' : 'Conversations'}</h1>
            <p className="text-xs text-on-surface-tertiary">{convs.length} {isRTL ? 'محادثة' : 'conversations'} · {projects.length} {isRTL ? 'مشاريع' : 'projects'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-[var(--radius)] border border-border p-0.5">
          {([{ id: 'table', icon: TableIcon }, { id: 'list', icon: List }, { id: 'cards', icon: LayoutGrid }] as const).map((v) => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={cn('p-1.5 rounded', view === v.id ? 'bg-accent text-on-accent' : 'text-on-surface-secondary hover:bg-surface-secondary')}>
              <v.icon size={14} />
            </button>
          ))}
        </div>
      </div>

      {/* Projects strip */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wide">{isRTL ? 'المشاريع' : 'Projects'}</p>
          <button onClick={() => setShowProjectForm('new')} className="text-xs text-accent hover:underline flex items-center gap-1">
            <Plus size={12} /> {isRTL ? 'مشروع جديد' : 'New project'}
          </button>
        </div>
        {projects.length === 0 ? (
          <p className="text-xs text-on-surface-tertiary py-2">{isRTL ? 'لا توجد مشاريع. أنشئ واحداً لتجميع محادثاتك.' : 'No projects yet.'}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => {
              const count = convs.filter((c) => c.projectId === p.id).length;
              return (
                <div key={p.id} className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border bg-surface-secondary text-xs">
                  <span className="w-2 h-2 rounded-full" style={{ background: p.color || '#8b5cf6' }} />
                  <span className="font-medium text-on-surface">{p.name}</span>
                  <span className="text-on-surface-tertiary">({count})</span>
                  <button onClick={() => setShowProjectForm(p)} className="opacity-0 group-hover:opacity-100 text-on-surface-tertiary hover:text-accent">
                    <Pencil size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}
          className="h-9 rounded-[var(--radius)] bg-surface border border-border text-sm px-2">
          <option value="all">{isRTL ? 'كل الوكلاء' : 'All agents'}</option>
          {Object.entries(AGENT_NAMES).map(([id, n]) => <option key={id} value={id}>{n[language]}</option>)}
        </select>
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}
          className="h-9 rounded-[var(--radius)] bg-surface border border-border text-sm px-2">
          <option value="all">{isRTL ? 'كل المشاريع' : 'All projects'}</option>
          <option value="none">{isRTL ? 'بدون مشروع' : 'No project'}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value as 'all' | 'individual' | 'group')}
          className="h-9 rounded-[var(--radius)] bg-surface border border-border text-sm px-2">
          <option value="all">{isRTL ? 'فردية + جماعية' : 'All types'}</option>
          <option value="individual">{isRTL ? 'فردية فقط' : 'Individual only'}</option>
          <option value="group">{isRTL ? 'جماعية فقط' : 'Group only'}</option>
        </select>
        <button onClick={() => setShowArchived(!showArchived)}
          className={cn('h-9 px-3 rounded-[var(--radius)] border text-sm flex items-center gap-1.5',
            showArchived ? 'bg-accent/10 text-accent border-accent/40' : 'bg-surface text-on-surface-secondary border-border hover:border-accent/40')}>
          <Archive size={14} /> {isRTL ? 'المؤرشفة' : 'Archived'}
        </button>
        <button onClick={toggleAll} className="h-9 px-3 rounded-[var(--radius)] text-sm bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary">
          {allSelectedVisible ? (isRTL ? 'إلغاء التحديد' : 'Deselect all') : (isRTL ? 'تحديد الكل' : 'Select all')}
        </button>
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-20 rounded-[var(--radius-lg)] border-2 border-accent bg-accent/10 backdrop-blur p-3 flex items-center gap-2 flex-wrap shadow-lg">
          <span className="text-sm font-semibold text-accent">{selected.size} {isRTL ? 'مختار' : 'selected'}</span>
          <select onChange={(e) => { if (e.target.value) bulk('move-to-project', e.target.value === 'none' ? null : e.target.value); }}
            disabled={busy} className="h-8 rounded text-xs bg-surface border border-border px-2">
            <option value="">{isRTL ? 'نقل لمشروع…' : 'Move to project…'}</option>
            <option value="none">{isRTL ? 'بدون مشروع' : 'No project'}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => bulk(showArchived ? 'unarchive' : 'archive')} disabled={busy}
            className="h-8 px-3 rounded text-xs bg-surface text-on-surface hover:bg-surface-secondary border border-border flex items-center gap-1">
            <Archive size={11} /> {showArchived ? (isRTL ? 'إلغاء أرشفة' : 'Unarchive') : (isRTL ? 'أرشفة' : 'Archive')}
          </button>
          <button onClick={() => bulk('pin')} disabled={busy} className="h-8 px-3 rounded text-xs bg-surface text-on-surface hover:bg-surface-secondary border border-border flex items-center gap-1">
            <Pin size={11} /> {isRTL ? 'تثبيت' : 'Pin'}
          </button>
          <button onClick={() => openDeleteConfirm(Array.from(selected))} disabled={busy}
            className="h-8 px-3 rounded text-xs bg-red-500 text-white hover:bg-red-600 flex items-center gap-1">
            <Trash2 size={11} /> {isRTL ? 'حذف…' : 'Delete…'}
          </button>
          <button onClick={() => setSelected(new Set())} className="ms-auto h-8 px-2 text-xs text-on-surface-tertiary hover:text-on-surface">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-on-surface-tertiary text-sm">
          {isRTL ? 'لا توجد محادثات بهذا الفلتر' : 'No conversations match'}
        </div>
      ) : view === 'table' ? (
        <div className="rounded-[var(--radius-lg)] border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary text-xs text-on-surface-tertiary">
              <tr>
                <th className="px-3 py-2 w-10"><input type="checkbox" checked={allSelectedVisible} onChange={toggleAll} className="accent-accent" /></th>
                <th className="text-start px-3 py-2 font-medium">{isRTL ? 'العنوان' : 'Title'}</th>
                <th className="text-start px-3 py-2 font-medium">{isRTL ? 'الوكيل' : 'Agent'}</th>
                <th className="text-start px-3 py-2 font-medium">{isRTL ? 'المشاركون' : 'Participants'}</th>
                <th className="text-start px-3 py-2 font-medium">{isRTL ? 'المشروع' : 'Project'}</th>
                <th className="text-start px-3 py-2 font-medium">{isRTL ? 'التاريخ' : 'Date'}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cv) => {
                const isPinned = pinnedIds.includes(cv.id);
                const proj = cv.projectId ? projects.find((p) => p.id === cv.projectId) : null;
                return (
                  <tr key={cv.id} className={cn('border-t border-border hover:bg-surface-secondary', selected.has(cv.id) && 'bg-accent/5')}>
                    <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(cv.id)} onChange={() => toggleOne(cv.id)} className="accent-accent" /></td>
                    <td className="px-3 py-2.5">
                      <Link href={`/chat/${cv.id}`} className="flex items-center gap-1.5 font-medium text-on-surface hover:text-accent">
                        {isPinned && <Pin size={11} className="text-amber-500 fill-amber-500" />}
                        <span className="truncate max-w-[300px]">{cv.title || (isRTL ? 'بدون عنوان' : 'Untitled')}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-on-surface-secondary">{cv.agentId ? AGENT_NAMES[cv.agentId]?.[language] || cv.agentId : '—'}</td>
                    <td className="px-3 py-2.5 text-xs"><span className="inline-flex items-center gap-1 text-on-surface-secondary">{(cv.participants?.length || 1) > 1 ? <Users size={11} /> : <User size={11} />}{cv.participants?.length || 1}</span></td>
                    <td className="px-3 py-2.5 text-xs">
                      {proj ? <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: proj.color || '#8b5cf6' }} />{proj.name}</span> : <select onChange={(e) => moveToProject(cv.id, e.target.value || null)} className="h-6 text-[10px] bg-transparent border-0 text-on-surface-tertiary">
                        <option value="">—</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-on-surface-tertiary">{new Date(cv.updatedAt || cv.createdAt).toLocaleDateString(isRTL ? 'ar' : 'en', { month: 'short', day: 'numeric' })}</td>
                    <td className="px-3 py-2.5 text-end">
                      <button onClick={() => togglePinSingle(cv.id, !isPinned)} className="p-1 text-on-surface-tertiary hover:text-amber-500">
                        <Pin size={12} className={isPinned ? 'fill-amber-500 text-amber-500' : ''} />
                      </button>
                      <button onClick={() => openDeleteConfirm([cv.id])} className="p-1 text-on-surface-tertiary hover:text-red-500">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : view === 'list' ? (
        <div className="divide-y divide-border border border-border rounded-[var(--radius-lg)] overflow-hidden">
          {filtered.map((cv) => {
            const isPinned = pinnedIds.includes(cv.id);
            return (
              <div key={cv.id} className={cn('flex items-center gap-3 px-3 py-2.5 hover:bg-surface-secondary', selected.has(cv.id) && 'bg-accent/5')}>
                <input type="checkbox" checked={selected.has(cv.id)} onChange={() => toggleOne(cv.id)} className="accent-accent" />
                <Link href={`/chat/${cv.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 font-medium text-on-surface truncate">
                    {isPinned && <Pin size={11} className="text-amber-500 fill-amber-500" />}
                    {cv.title || (isRTL ? 'بدون عنوان' : 'Untitled')}
                  </div>
                  <div className="text-xs text-on-surface-tertiary flex gap-2 items-center mt-0.5">
                    <span>{cv.agentId ? AGENT_NAMES[cv.agentId]?.[language] : '—'}</span>
                    <span>· {(cv.participants?.length || 1) > 1 ? `${cv.participants!.length} مشاركين` : (isRTL ? 'فردية' : 'Individual')}</span>
                    <span>· {new Date(cv.updatedAt || cv.createdAt).toLocaleDateString(isRTL ? 'ar' : 'en')}</span>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((cv) => {
            const isPinned = pinnedIds.includes(cv.id);
            return (
              <div key={cv.id} className={cn('rounded-[var(--radius-lg)] border border-border bg-surface p-3 hover:border-accent/40 group', selected.has(cv.id) && 'border-accent bg-accent/5')}>
                <div className="flex items-start gap-2 mb-2">
                  <input type="checkbox" checked={selected.has(cv.id)} onChange={() => toggleOne(cv.id)} className="mt-0.5 accent-accent" />
                  {isPinned && <Pin size={11} className="text-amber-500 fill-amber-500 mt-0.5" />}
                  <Link href={`/chat/${cv.id}`} className="flex-1 text-sm font-medium text-on-surface hover:text-accent line-clamp-2">{cv.title || (isRTL ? 'بدون عنوان' : 'Untitled')}</Link>
                </div>
                <div className="text-xs text-on-surface-tertiary">{cv.agentId ? AGENT_NAMES[cv.agentId]?.[language] : '—'} · {new Date(cv.updatedAt || cv.createdAt).toLocaleDateString(isRTL ? 'ar' : 'en')}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <div className="max-w-md w-full rounded-[var(--radius-lg)] bg-surface border border-border p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-500 mt-1" size={22} />
              <div>
                <h3 className="text-sm font-semibold text-on-surface">{isRTL ? `حذف ${confirmDel.ids.length} محادثة؟` : `Delete ${confirmDel.ids.length} conversation(s)?`}</h3>
                <p className="text-xs text-on-surface-secondary mt-1">{isRTL ? 'اختر نوع الحذف:' : 'Choose deletion type:'}</p>
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={async () => { await bulk('delete'); setConfirmDel(null); setSelected(new Set()); }}
                className="w-full p-3 rounded-[var(--radius)] border border-border hover:border-amber-500 text-start">
                <div className="flex items-center gap-2 text-sm font-semibold text-on-surface"><Check size={14} className="text-amber-500" />{isRTL ? 'حذف سطحي' : 'Shallow delete'}</div>
                <p className="text-xs text-on-surface-secondary mt-1">
                  {isRTL ? `يحذف ${confirmDel.impacts?.messages || 0} رسالة فقط. الذكريات والمهام والموافقات تبقى.` : `Removes ${confirmDel.impacts?.messages || 0} messages only. Memories, tasks, approvals stay.`}
                </p>
              </button>
              <button onClick={async () => { await bulk('deep-delete'); setConfirmDel(null); setSelected(new Set()); }}
                className="w-full p-3 rounded-[var(--radius)] border border-red-500/30 hover:border-red-500 text-start">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-500"><Trash2 size={14} />{isRTL ? 'حذف عميق ⚠️' : 'Deep delete ⚠️'}</div>
                <p className="text-xs text-on-surface-secondary mt-1">
                  {isRTL
                    ? `يحذف معه: ${confirmDel.impacts?.messages || 0} رسالة + ${confirmDel.impacts?.memories || 0} ذكرى + ${confirmDel.impacts?.tasks || 0} مهمة + ${confirmDel.impacts?.approvals || 0} موافقة.`
                    : `Also deletes: ${confirmDel.impacts?.memories || 0} memories + ${confirmDel.impacts?.tasks || 0} tasks + ${confirmDel.impacts?.approvals || 0} approvals.`}
                </p>
              </button>
              <button onClick={() => setConfirmDel(null)} className="w-full h-9 rounded text-xs text-on-surface-tertiary hover:bg-surface-secondary">
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project form */}
      {showProjectForm && (
        <ProjectForm
          isRTL={isRTL}
          initial={showProjectForm === 'new' ? null : showProjectForm}
          onClose={() => setShowProjectForm(null)}
          onSaved={() => { setShowProjectForm(null); reload(); }}
        />
      )}
    </div>
  );
}

function ProjectForm({ isRTL, initial, onClose, onSaved }: { isRTL: boolean; initial: Project | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [instructions, setInstructions] = useState(initial?.instructions || '');
  const [color, setColor] = useState(initial?.color || '#8b5cf6');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (initial) {
        await apiFetch(`/api/projects/${initial.id}`, { method: 'PUT', body: JSON.stringify({ name, description, instructions, color }) });
      } else {
        await apiFetch('/api/projects', { method: 'POST', body: JSON.stringify({ name, description, instructions, color }) });
      }
      onSaved();
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!initial || !confirm(isRTL ? `حذف مشروع «${initial.name}»؟ المحادثات بداخله ستُفصل (لا تُحذف).` : `Delete project ${initial.name}?`)) return;
    setBusy(true);
    try { await apiFetch(`/api/projects/${initial.id}`, { method: 'DELETE' }); onSaved(); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="max-w-lg w-full rounded-[var(--radius-lg)] bg-surface border border-border p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2"><FolderKanban size={16} />{initial ? (isRTL ? 'تعديل مشروع' : 'Edit project') : (isRTL ? 'مشروع جديد' : 'New project')}</h3>
          <button onClick={onClose} className="text-on-surface-tertiary hover:text-on-surface"><X size={16} /></button>
        </div>
        <div>
          <label className="text-xs font-semibold text-on-surface-secondary">{isRTL ? 'الاسم' : 'Name'}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isRTL ? 'مثل: بحث BIM' : 'e.g. BIM Research'} className="mt-1 w-full h-9 px-3 rounded bg-surface-secondary border border-border text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-on-surface-secondary">{isRTL ? 'الوصف' : 'Description'}</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full h-9 px-3 rounded bg-surface-secondary border border-border text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-on-surface-secondary">{isRTL ? 'تعليمات النظام (تُحقن في كل محادثة داخل المشروع)' : 'System instructions (injected into every conversation)'}</label>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4}
            placeholder={isRTL ? 'مثل: "ركّز على الجمهور الخليجي، اللهجة الكويتية، أمثلة محلية"' : 'e.g. "Focus on Gulf audience, examples from Kuwait..."'}
            className="mt-1 w-full px-3 py-2 rounded bg-surface-secondary border border-border text-sm resize-none" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-on-surface-secondary">{isRTL ? 'اللون' : 'Color'}</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 rounded cursor-pointer" />
        </div>
        <div className="flex gap-2 pt-2 border-t border-border">
          <button onClick={save} disabled={!name.trim() || busy}
            className="flex-1 h-9 rounded bg-accent text-on-accent text-sm font-semibold disabled:opacity-40">
            {busy ? '…' : (initial ? (isRTL ? 'حفظ' : 'Save') : (isRTL ? 'إنشاء' : 'Create'))}
          </button>
          {initial && (
            <button onClick={remove} disabled={busy} className="h-9 px-3 rounded text-sm text-red-500 hover:bg-red-500/10">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
