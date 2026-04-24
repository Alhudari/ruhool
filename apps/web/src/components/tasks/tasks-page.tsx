'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckSquare, Plus, Search, List, LayoutGrid, Pin, PinOff,
  Trash2, Loader2, Calendar, Clock, Tag, ChevronDown, ChevronRight,
  X, Check, Circle, Square, Flag, MessageSquare, StickyNote, Flame,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/shared/Toast';
import { HabitStatsRing } from './HabitStatsRing';

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  children?: ChecklistItem[];
}

interface TaskItem {
  id: string;
  title: string;
  notes: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low' | 'none';
  dueDate: string | null;
  dueTime: string | null;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  list: string;
  tags: string[];
  color: string;
  pinned: boolean;
  checklist: ChecklistItem[];
  reminder: string | null;
  order?: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Round 4: workspace this task belongs to ('phd' | 'life' | …). Legacy
   *  rows default to 'phd' via migration 003. */
  workspaceId?: string;
  /** Round 6: habit / today / cross-workspace flags. */
  isHabit?: boolean;
  habitFrequency?: 'daily' | 'skip-weekends' | 'weekly' | 'custom';
  habitDays?: number[];
  habitTemplateId?: string;
  durationMinutes?: number;
  habitStartDate?: string | null;
  habitEndDate?: string | null;
  scheduledFor?: string | null;
  isToday?: boolean;
  crossWorkspace?: boolean;
  /** J-6: Quick Note */
  isQuickNote?: boolean;
  noteColor?: string;
  categoryEn?: string;
  categoryAr?: string;
  meetingSourceId?: string;
  meetingSourceNo?: number;
  /** J-7: soft delete */
  deletedAt?: string;
}

const PRIORITY_CONFIG: Record<string, { label: { en: string; ar: string }; color: string; dot: string }> = {
  high: { label: { en: 'High', ar: '\u0639\u0627\u0644\u064a\u0629' }, color: 'text-red-500', dot: 'bg-red-500' },
  medium: { label: { en: 'Medium', ar: '\u0645\u062a\u0648\u0633\u0637\u0629' }, color: 'text-amber-500', dot: 'bg-amber-500' },
  low: { label: { en: 'Low', ar: '\u0645\u0646\u062e\u0641\u0636\u0629' }, color: 'text-blue-500', dot: 'bg-blue-500' },
  none: { label: { en: 'None', ar: '\u0628\u062f\u0648\u0646' }, color: 'text-on-surface-tertiary', dot: 'bg-transparent' },
};

// TH-01 (AUDIT.md): hex values are the user-selectable card palette (data, not UI chrome).
export const CARD_COLORS: Array<{ id: string; bg: string; label: string; hex?: string }> = [
  { id: 'none', bg: 'bg-surface', label: '\u0628\u062f\u0648\u0646' },
  { id: 'yellow', bg: 'bg-yellow-200', label: '\u0623\u0635\u0641\u0631', hex: '#FEF08A' },
  { id: 'blue', bg: 'bg-blue-200', label: '\u0623\u0632\u0631\u0642', hex: '#BFDBFE' },
  { id: 'green', bg: 'bg-green-200', label: '\u0623\u062e\u0636\u0631', hex: '#BBF7D0' },
  { id: 'pink', bg: 'bg-pink-200', label: '\u0648\u0631\u062f\u064a', hex: '#FBCFE8' },
  { id: 'purple', bg: 'bg-purple-200', label: '\u0628\u0646\u0641\u0633\u062c\u064a', hex: '#DDD6FE' },
  { id: 'orange', bg: 'bg-orange-200', label: '\u0628\u0631\u062a\u0642\u0627\u0644\u064a', hex: '#FED7AA' },
];

export function getCardBg(color: string): string {
  return CARD_COLORS.find(c => c.id === color)?.bg || 'bg-surface';
}

// Returns contrast-safe text classes for a given card color.
// For the "none" color we keep the default on-surface tokens so the card
// follows the active theme. For tinted backgrounds we force dark text so
// the content stays readable across light/dark themes.
export function getContrastColor(bgColor: string): { primary: string; secondary: string; tertiary: string; muted: string } {
  if (!bgColor || bgColor === 'none') {
    return {
      primary: 'text-on-surface',
      secondary: 'text-on-surface-secondary',
      tertiary: 'text-on-surface-tertiary',
      muted: 'bg-black/5',
    };
  }
  // Tinted pastel backgrounds — always dark text for readability
  return {
    primary: 'text-neutral-900',
    secondary: 'text-neutral-700',
    tertiary: 'text-neutral-600',
    muted: 'bg-white/40',
  };
}

function formatDate(dateStr: string | null, isRTL: boolean): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const taskDate = new Date(d);
  taskDate.setHours(0, 0, 0, 0);
  const diff = taskDate.getTime() - today.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days === 0) return isRTL ? '\u0627\u0644\u064a\u0648\u0645' : 'Today';
  if (days === 1) return isRTL ? '\u063a\u062f\u0627\u064b' : 'Tomorrow';
  if (days === -1) return isRTL ? '\u0623\u0645\u0633' : 'Yesterday';
  return d.toLocaleDateString(isRTL ? 'ar-KW' : 'en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(task: TaskItem): boolean {
  if (!task.dueDate || task.completed) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.dueDate) < today;
}

export function TasksPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const { showToast } = useToast();
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [lists, setLists] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [activeList, setActiveList] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  // Round 4: workspace filter. 'all' = unscoped; otherwise show only
  // tasks tagged with that workspace. Persists to localStorage.
  const [workspaceFilter, setWorkspaceFilter] = useState<'all' | 'phd' | 'life'>('all');
  // Round 6: top-level view filter — 'all' is flat task list, 'today'
  // is today's focus, 'habits' is habit templates only.
  const [todayView, setTodayView] = useState<'all' | 'today' | 'habits' | 'notes'>('all');
  const [quickNotes, setQuickNotes] = useState<TaskItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; en: string; ar: string }[]>([]);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem('ruhool.tasks.workspace-filter');
      if (v === 'all' || v === 'phd' || v === 'life') setWorkspaceFilter(v);
    } catch { /* noop */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem('ruhool.tasks.workspace-filter', workspaceFilter); } catch { /* noop */ }
  }, [workspaceFilter]);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);

  const openNewHabit = () => {
    const now = new Date().toISOString();
    setEditingTask({
      id: '', title: '', notes: '', completed: false,
      priority: 'none', dueDate: null, dueTime: null,
      list: 'عام', tags: [], color: 'none', pinned: false,
      checklist: [], reminder: null, createdAt: now, updatedAt: now,
      completedAt: null, isHabit: true, habitFrequency: 'daily', habitDays: [],
    });
  };
  const openNewNote = () => {
    const now = new Date().toISOString();
    setEditingTask({
      id: '', title: '', notes: '', completed: false,
      priority: 'none', dueDate: null, dueTime: null,
      list: 'عام', tags: [], color: 'yellow', pinned: false,
      checklist: [], reminder: null, createdAt: now, updatedAt: now,
      completedAt: null, isQuickNote: true, noteColor: '#fef08a',
    });
  };

  const [loadError, setLoadError] = useState<string | null>(null);
  const [quickAddText, setQuickAddText] = useState('');
  const [newListName, setNewListName] = useState('');
  const [showNewList, setShowNewList] = useState(false);
  const quickAddRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      // R17 — fetch categories for the ACTIVE workspace. When filter is
      // 'all', union both phd + life categories so the user can still
      // pick any category when creating a cross-workspace task.
      const listsEndpoint = workspaceFilter === 'all'
        ? null
        : `/api/tasks/lists?workspaceId=${workspaceFilter}`;
      const [t, l] = await Promise.all([
        apiFetch<TaskItem[]>('/api/tasks'),
        listsEndpoint
          ? apiFetch<string[]>(listsEndpoint)
          : Promise.all([
              apiFetch<string[]>('/api/tasks/lists?workspaceId=phd').catch(() => []),
              apiFetch<string[]>('/api/tasks/lists?workspaceId=life').catch(() => []),
            ]).then(([a, b]) => Array.from(new Set([...a, ...b]))),
      ]);
      // Respect persisted order if present
      t.sort((a, b) => {
        const ao = a.order ?? Number.MAX_SAFE_INTEGER;
        const bo = b.order ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      const cats = await apiFetch<{ id: string; en: string; ar: string }[]>('/api/tasks/categories').catch(() => []);
      setTasks(t);
      setLists(l);
      setCategories(cats);
    } catch (e) { setLoadError(e instanceof Error ? e.message : 'Failed to load tasks'); }
    finally { setLoading(false); }
  }, [workspaceFilter]);

  const getCategoryLabel = (listId: string): string => {
    const cat = categories.find(c => c.id === listId || c.en === listId || c.ar === listId);
    if (cat) return isRTL ? cat.ar : cat.en;
    return listId;
  };

  useEffect(() => { load(); }, [load]);

  // Load user preferences
  useEffect(() => {
    apiFetch<{ defaultView?: 'list' | 'grid'; showCompleted?: boolean }>('/api/task-prefs')
      .then(p => {
        if (p?.defaultView) setView(p.defaultView);
        if (typeof p?.showCompleted === 'boolean') setShowCompleted(p.showCompleted);
      })
      .catch(() => { /* ignore */ });
  }, []);

  // ── Google Tasks fast-sync: 30s poll when tab is visible, plus
  //    immediate pull on tab focus / visibility return. When the tab
  //    is hidden we back off — the backend scheduler picks up the
  //    slack every 5 min.
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (cancelled || document.hidden) return;
      try {
        const r = await apiFetch<{ ok?: boolean; skipped?: boolean }>(
          '/api/google-tasks/sync/tick',
          { method: 'POST' },
        );
        if (r?.ok && !cancelled) await load();
      } catch { /* silent — sync errors surface on the settings page */ }
    };

    const startLoop = () => {
      if (intervalId) return;
      void tick();  // immediate pull on (re)gain focus
      intervalId = setInterval(tick, 30_000);
    };
    const stopLoop = () => {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
    };

    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };
    const onFocus = () => { if (!document.hidden) void tick(); };

    if (!document.hidden) startLoop();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      stopLoop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  // Filter tasks
  const todayIso = new Date().toISOString().slice(0, 10);

  const filtered = tasks.filter(t => {
    // Round 6 view: Habits = templates only; Today = today's focus.
    if (todayView === 'habits') {
      if (!t.isHabit) return false;
    } else if (todayView === 'today') {
      if (t.isHabit) return false;
      const inToday = t.isToday || t.scheduledFor === todayIso || t.dueDate === todayIso;
      if (!inToday) return false;
    } else {
      // 'all' — hide habit templates (they're in Habits tab) and
      // habit-instance clutter unless they're scheduled today.
      if (t.isHabit) return false;
    }
    if (activeList && t.list !== activeList) return false;
    if (!showCompleted && t.completed) return false;
    if (workspaceFilter !== 'all') {
      const wsId = t.workspaceId ?? 'phd';
      // Cross-workspace tasks show in every filter.
      if (!t.crossWorkspace && wsId !== workspaceFilter) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q) || t.tags.some(tag => tag.includes(q));
    }
    return true;
  });

  // Group for list view
  const pinned = filtered.filter(t => t.pinned && !t.completed);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const todayTasks = filtered.filter(t => !t.pinned && !t.completed && t.dueDate && new Date(t.dueDate) >= today && new Date(t.dueDate) < tomorrow);
  const upcoming = filtered.filter(t => !t.pinned && !t.completed && t.dueDate && new Date(t.dueDate) >= tomorrow);
  const noDate = filtered.filter(t => !t.pinned && !t.completed && !t.dueDate);
  const completed = filtered.filter(t => t.completed);
  const overdue = filtered.filter(t => !t.pinned && !t.completed && t.dueDate && new Date(t.dueDate) < today);

  const toggleComplete = async (id: string) => {
    try {
      const updated = await apiFetch<TaskItem>(`/api/tasks/${id}/toggle`, { method: 'PUT' });
      setTasks(prev => prev.map(t => t.id === id ? updated : t));
    } catch {}
  };

  const togglePin = async (id: string) => {
    try {
      const updated = await apiFetch<TaskItem>(`/api/tasks/${id}/pin`, { method: 'PUT' });
      setTasks(prev => prev.map(t => t.id === id ? updated : t));
    } catch {}
  };

  const deleteTask = async (id: string, title?: string) => {
    // Optimistic: hide immediately
    setTasks(prev => prev.filter(t => t.id !== id));
    if (editingTask?.id === id) setEditingTask(null);
    try {
      await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
      showToast({
        message: isRTL ? `"${title ?? ''}" نُقلت للمحذوفات` : `"${title ?? ''}" moved to trash`,
        type: 'info',
        undo: async () => {
          await apiFetch(`/api/tasks/${id}/restore`, { method: 'POST' });
          await load();
        },
      });
    } catch {
      await load(); // revert on failure
    }
  };

  const saveTask = async (task: TaskItem) => {
    try {
      if (!task.id) {
        // Create new task
        const created = await apiFetch<TaskItem>('/api/tasks', {
          method: 'POST',
          body: JSON.stringify(task),
        });
        setTasks(prev => [created, ...prev]);
      } else {
        const updated = await apiFetch<TaskItem>(`/api/tasks/${task.id}`, {
          method: 'PUT',
          body: JSON.stringify(task),
        });
        setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
      }
      setEditingTask(null);
    } catch {}
  };

  const quickAdd = async () => {
    const text = quickAddText.trim();
    if (!text) return;
    // Smart parsing (basic)
    let title = text;
    let dueDate: string | null = null;
    let dueTime: string | null = null;
    let priority: 'high' | 'medium' | 'low' | 'none' = 'none';

    // Detect tomorrow
    if (/\u063a\u062f\u0627\u064b?|\u063a\u062f\u0627|tomorrow/i.test(text)) {
      const tom = new Date(); tom.setDate(tom.getDate() + 1);
      dueDate = tom.toISOString().split('T')[0];
      title = title.replace(/\u063a\u062f\u0627\u064b?|\u063a\u062f\u0627|tomorrow/gi, '').trim();
    }
    // Detect today
    if (/\u0627\u0644\u064a\u0648\u0645|today/i.test(text)) {
      dueDate = new Date().toISOString().split('T')[0];
      title = title.replace(/\u0627\u0644\u064a\u0648\u0645|today/gi, '').trim();
    }
    // Detect time patterns like 3 المساء or 10 صباحاً
    const timeMatch = text.match(/(\d{1,2})\s*(\u0627\u0644\u0645\u0633\u0627\u0621|\u0645\u0633\u0627\u0621\u064b?|\u0635\u0628\u0627\u062d\u0627\u064b?|pm|am)/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      if (/\u0627\u0644\u0645\u0633\u0627\u0621|\u0645\u0633\u0627\u0621|pm/i.test(timeMatch[2]) && hour < 12) hour += 12;
      dueTime = `${hour.toString().padStart(2, '0')}:00`;
      title = title.replace(timeMatch[0], '').trim();
    }
    // Detect priority markers
    if (/!\s*$|#\u0645\u0647\u0645|\u0639\u0627\u062c\u0644|urgent/i.test(text)) {
      priority = 'high';
      title = title.replace(/!\s*$|#\u0645\u0647\u0645|\u0639\u0627\u062c\u0644|urgent/gi, '').trim();
    }

    try {
      const created = await apiFetch<TaskItem>('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          dueDate,
          dueTime,
          priority,
          list: activeList || '\u0639\u0627\u0645',
          workspaceId: workspaceFilter !== 'all' ? workspaceFilter : ((typeof window !== 'undefined' && window.localStorage.getItem('ruhool.active-workspace')) || 'phd'),
        }),
      });
      setTasks(prev => [created, ...prev]);
      setQuickAddText('');
    } catch {}
  };

  const createList = async () => {
    if (!newListName.trim()) return;
    // R17 — new category belongs to the currently-active workspace.
    // When the filter is 'all', use the user's active workspace from
    // localStorage (defaults to 'phd') — we can't create a "universal"
    // category since it conflates phd + life.
    const activeWs = workspaceFilter !== 'all'
      ? workspaceFilter
      : ((typeof window !== 'undefined' && window.localStorage.getItem('ruhool.active-workspace')) || 'phd');
    try {
      const result = await apiFetch<{ lists: string[] }>('/api/tasks/lists', {
        method: 'POST',
        body: JSON.stringify({ name: newListName.trim(), workspaceId: activeWs }),
      });
      setLists(result.lists);
      setNewListName('');
      setShowNewList(false);
    } catch {}
  };

  // Drag & drop reordering
  const dragIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '1';
    setDragOverId(null);
  };

  const handleDragOver = (e: React.DragEvent, overId?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overId && overId !== dragOverId) setDragOverId(overId);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string, targetList?: string) => {
    e.preventDefault();
    const sourceId = dragIdRef.current;
    dragIdRef.current = null;
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;
    const sourceTask = tasks.find(t => t.id === sourceId);
    if (!sourceTask) return;
    // Optimistic reorder within current filtered list
    const newTasks = [...tasks];
    const sIdx = newTasks.findIndex(t => t.id === sourceId);
    const tIdx = newTasks.findIndex(t => t.id === targetId);
    if (sIdx === -1 || tIdx === -1) return;
    const [moved] = newTasks.splice(sIdx, 1);
    if (targetList) moved.list = targetList;
    newTasks.splice(tIdx, 0, moved);
    setTasks(newTasks);
    try {
      await apiFetch('/api/tasks/reorder', {
        method: 'PUT',
        body: JSON.stringify({ orderedIds: newTasks.map(t => t.id), list: targetList }),
      });
    } catch { /* reload on error */ load(); }
  };

  // Drop onto list tab: move task to that list
  const handleDropOnList = async (e: React.DragEvent, listName: string) => {
    e.preventDefault();
    const sourceId = dragIdRef.current;
    dragIdRef.current = null;
    if (!sourceId) return;
    const t = tasks.find(x => x.id === sourceId);
    if (!t || t.list === listName) return;
    setTasks(prev => prev.map(x => x.id === sourceId ? { ...x, list: listName } : x));
    try {
      await apiFetch<TaskItem>(`/api/tasks/${sourceId}`, {
        method: 'PUT',
        body: JSON.stringify({ list: listName }),
      });
    } catch { load(); }
  };

  const deleteList = async (name: string) => {
    // R17 — pass the active workspace so the server deletes the
    // category from the right bucket (phd/life/...).
    const activeWs = workspaceFilter !== 'all'
      ? workspaceFilter
      : ((typeof window !== 'undefined' && window.localStorage.getItem('ruhool.active-workspace')) || 'phd');
    try {
      const result = await apiFetch<{ lists: string[] }>(`/api/tasks/lists/${encodeURIComponent(name)}?workspaceId=${activeWs}`, { method: 'DELETE' });
      setLists(result.lists);
      if (activeList === name) setActiveList(null);
      await load();
    } catch {}
  };

  // Task group renderer for list view
  const TaskGroup = ({ label, items, defaultOpen = true }: { label: string; items: TaskItem[]; defaultOpen?: boolean }) => {
    const [open, setOpen] = useState(defaultOpen);
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-medium text-on-surface-secondary mb-2 hover:text-on-surface transition-colors">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {label} ({items.length})
        </button>
        {open && (
          <div className="space-y-1">
            {items.map(task => (
              <TaskListRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const TaskListRow = ({ task }: { task: TaskItem }) => {
    const overdue_ = isOverdue(task);
    const isOver = dragOverId === task.id;
    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, task.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, task.id)}
        onDragLeave={() => setDragOverId(null)}
        onDrop={(e) => handleDrop(e, task.id)}
        className={cn(
          'group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:bg-surface-secondary/50 hover:border-border cursor-pointer transition-all',
          task.pinned && 'bg-surface-secondary/30',
          isOver && 'border-accent bg-accent/5',
        )}
        onClick={() => setEditingTask({ ...task })}
      >
        <button
          onClick={(e) => { e.stopPropagation(); toggleComplete(task.id); }}
          className="flex-shrink-0"
        >
          {task.completed ? (
            <CheckSquare size={18} className="text-accent" />
          ) : (
            <Square size={18} className="text-on-surface-tertiary group-hover:text-on-surface-secondary" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm truncate', task.completed && 'line-through text-on-surface-tertiary')}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {task.dueDate && (
              <span className={cn('text-xs', overdue_ ? 'text-red-500' : 'text-on-surface-tertiary')}>
                {formatDate(task.dueDate, isRTL)}
                {task.dueTime && ` ${task.dueTime}`}
              </span>
            )}
            {task.list !== '\u0639\u0627\u0645' && !activeList && (
              <span className="text-xs text-on-surface-tertiary bg-surface-secondary px-1.5 py-0.5 rounded">{task.list}</span>
            )}
          </div>
        </div>
        {task.priority !== 'none' && PRIORITY_CONFIG[task.priority] && (
          <div className={cn('w-2 h-2 rounded-full flex-shrink-0', PRIORITY_CONFIG[task.priority].dot)} />
        )}
        {task.pinned && <Pin size={14} className="text-on-surface-tertiary flex-shrink-0" />}
      </div>
    );
  };

  const countChecklist = (items: ChecklistItem[]): { done: number; total: number } => {
    let done = 0, total = 0;
    const walk = (arr: ChecklistItem[]) => {
      for (const it of arr) {
        total++;
        if (it.done) done++;
        if (it.children) walk(it.children);
      }
    };
    walk(items);
    return { done, total };
  };

  const TaskGridCard = ({ task, onDragStart, onDragOver, onDrop }: {
    task: TaskItem;
    onDragStart?: (e: React.DragEvent, id: string) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent, id: string) => void;
  }) => {
    const overdue_ = isOverdue(task);
    const { done: checklistDone, total: checklistTotal } = countChecklist(task.checklist);
    const colors = getContrastColor(task.color);
    return (
      <div
        draggable
        onDragStart={(e) => onDragStart?.(e, task.id)}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop?.(e, task.id)}
        className={cn(
          'group relative rounded-xl border border-border p-4 cursor-pointer hover:shadow-md transition-all',
          getCardBg(task.color),
        )}
        onClick={() => setEditingTask({ ...task })}
      >
        {task.pinned && (
          <Pin size={14} className={cn('absolute top-2 end-2', colors.tertiary)} />
        )}
        <div className="flex items-start gap-2 mb-2">
          <button
            onClick={(e) => { e.stopPropagation(); toggleComplete(task.id); }}
            className="flex-shrink-0 mt-0.5"
          >
            {task.completed ? (
              <CheckSquare size={16} className="text-accent" />
            ) : (
              <Square size={16} className={colors.tertiary} />
            )}
          </button>
          <h3 className={cn('text-sm font-medium flex-1', colors.primary, task.completed && 'line-through opacity-60')}>
            {task.title}
          </h3>
        </div>
        {task.notes && (
          <p className={cn('text-xs mb-2 line-clamp-3 ps-6', colors.secondary)}>{task.notes}</p>
        )}
        {task.checklist.length > 0 && (
          <div className="ps-6 mb-2 space-y-1">
            {task.checklist.slice(0, 3).map(item => (
              <div key={item.id} className={cn('flex items-center gap-1.5 text-xs', colors.secondary)}>
                {item.done ? <Check size={12} className="text-accent" /> : <Circle size={12} />}
                <span className={cn(item.done && 'line-through opacity-60')}>{item.text}</span>
              </div>
            ))}
            {task.checklist.length > 3 && (
              <p className={cn('text-xs', colors.tertiary)}>+{task.checklist.length - 3} {isRTL ? '\u0639\u0646\u0627\u0635\u0631' : 'more'}</p>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {task.dueDate && (
            <span className={cn('text-xs flex items-center gap-1', overdue_ ? 'text-red-600' : colors.tertiary)}>
              <Calendar size={10} />
              {formatDate(task.dueDate, isRTL)}
            </span>
          )}
          {task.priority !== 'none' && (
            <span className={cn('text-xs flex items-center gap-1', PRIORITY_CONFIG[task.priority].color)}>
              <Flag size={10} />
              {PRIORITY_CONFIG[task.priority].label[isRTL ? 'ar' : 'en']}
            </span>
          )}
          {task.tags.map(tag => (
            <span key={tag} className={cn('text-xs px-1.5 py-0.5 rounded', colors.muted, colors.tertiary)}>{tag}</span>
          ))}
          {task.checklist.length > 0 && (
            <span className={cn('text-xs', colors.tertiary)}>{checklistDone}/{checklistTotal}</span>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
        <div className="h-8 w-48 bg-surface-secondary rounded animate-pulse mb-6" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-surface-secondary animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-accent/10 text-accent flex items-center justify-center shrink-0">
            <CheckSquare size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-on-surface">
              {isRTL ? '\u0627\u0644\u0645\u0647\u0627\u0645' : 'Tasks'}
              <span className="text-sm font-normal text-on-surface-tertiary ms-2">
                ({tasks.filter(t => !t.completed).length})
              </span>
            </h1>
            <p className="text-xs text-on-surface-tertiary">
              {isRTL ? '\u0645\u0647\u0627\u0645 \u0627\u0644\u062f\u0643\u062a\u0648\u0631\u0627\u0647 \u0648\u0627\u0644\u062d\u064a\u0627\u0629' : 'PhD & life task management'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/?q=${encodeURIComponent(isRTL ? '@مهام ساعدني في تنظيم مهامي اليوم' : '@tasks-agent Help me organize my tasks for today')}`)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            title={isRTL ? 'تحدث مع مهام' : 'Chat with Maham'}
          >
            <MessageSquare size={14} />
            {isRTL ? 'مهام' : 'Maham'}
          </button>
          <button
            onClick={() => setView('list')}
            className={cn('p-2 rounded-lg transition-colors', view === 'list' ? 'bg-surface-secondary text-on-surface' : 'text-on-surface-tertiary hover:text-on-surface')}
          >
            <List size={18} />
          </button>
          <button
            onClick={() => setView('grid')}
            className={cn('p-2 rounded-lg transition-colors', view === 'grid' ? 'bg-surface-secondary text-on-surface' : 'text-on-surface-tertiary hover:text-on-surface')}
          >
            <LayoutGrid size={18} />
          </button>
        </div>
      </div>

      {/* Load error */}
      {loadError && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400 flex items-center justify-between">
          <span>{loadError}</span>
          <button onClick={() => { setLoadError(null); load(); }} className="text-xs underline">{isRTL ? 'إعادة المحاولة' : 'Retry'}</button>
        </div>
      )}

      {/* Search bar */}
      <div className="relative mb-4">
        <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-tertiary" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={isRTL ? '\u0628\u062d\u062b \u0641\u064a \u0627\u0644\u0645\u0647\u0627\u0645...' : 'Search tasks...'}
          className="w-full bg-input border border-border rounded-lg ps-9 pe-3 py-2 text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
          dir={isRTL ? 'rtl' : 'ltr'}
        />
      </div>

      {/* Today filter — Round 6 */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[11px] text-on-surface-tertiary shrink-0">
          {isRTL ? 'العرض:' : 'View:'}
        </span>
        {([
          { id: 'all' as const, labelAr: 'الكل', labelEn: 'All' },
          { id: 'today' as const, labelAr: 'اليوم', labelEn: 'Today' },
          { id: 'notes' as const, labelAr: 'ملاحظات', labelEn: 'Notes' },
          { id: 'habits' as const, labelAr: 'العادات', labelEn: 'Habits' },
        ]).map((v) => (
          <button
            key={v.id}
            onClick={() => setTodayView(v.id)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors border',
              todayView === v.id
                ? 'bg-accent/10 text-accent border-accent/30'
                : 'bg-surface border-border text-on-surface-tertiary hover:bg-surface-secondary',
            )}
          >
            {isRTL ? v.labelAr : v.labelEn}
          </button>
        ))}
        {todayView === 'habits' && (
          <button onClick={openNewHabit}
            className="ms-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-accent text-on-accent border border-accent hover:opacity-90 transition-opacity">
            <Plus size={12} /> {isRTL ? 'عادة جديدة' : 'New Habit'}
          </button>
        )}
        {todayView === 'notes' && (
          <button onClick={openNewNote}
            className="ms-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500 text-white border border-amber-500 hover:opacity-90 transition-opacity">
            <Plus size={12} /> {isRTL ? 'ملاحظة جديدة' : 'New Note'}
          </button>
        )}
      </div>

      {/* Workspace filter — Round 4 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] text-on-surface-tertiary shrink-0">
          {isRTL ? 'الغرفة:' : 'Workspace:'}
        </span>
        {([
          { id: 'all' as const, labelAr: 'الكل', labelEn: 'All' },
          { id: 'phd' as const, labelAr: 'الدكتوراه', labelEn: 'PhD' },
          { id: 'life' as const, labelAr: 'الحياة', labelEn: 'Life' },
        ]).map((ws) => (
          <button
            key={ws.id}
            onClick={() => setWorkspaceFilter(ws.id)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors border',
              workspaceFilter === ws.id
                ? 'bg-accent/10 text-accent border-accent/30'
                : 'bg-surface border-border text-on-surface-tertiary hover:bg-surface-secondary',
            )}
          >
            {isRTL ? ws.labelAr : ws.labelEn}
          </button>
        ))}
      </div>

      {/* List tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setActiveList(null)}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors border',
            !activeList ? 'bg-accent text-white border-accent' : 'bg-surface border-border text-on-surface-secondary hover:bg-surface-secondary'
          )}
        >
          {isRTL ? '\u0627\u0644\u0643\u0644' : 'All'}
        </button>
        {lists.map(list => (
          <button
            key={list}
            onClick={() => setActiveList(activeList === list ? null : list)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDropOnList(e, list)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors border group relative',
              activeList === list ? 'bg-accent text-white border-accent' : 'bg-surface border-border text-on-surface-secondary hover:bg-surface-secondary'
            )}
          >
            {getCategoryLabel(list)}
            {activeList === list && lists.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); deleteList(list); }}
                className="ms-1.5 opacity-70 hover:opacity-100"
              >
                <X size={12} />
              </button>
            )}
          </button>
        ))}
        {showNewList ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createList()}
              placeholder={isRTL ? '\u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0626\u0645\u0629' : 'List name'}
              className="w-24 px-2 py-1 text-sm bg-input border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
              dir={isRTL ? 'rtl' : 'ltr'}
            />
            <button onClick={createList} className="p-1 text-accent"><Check size={14} /></button>
            <button onClick={() => { setShowNewList(false); setNewListName(''); }} className="p-1 text-on-surface-tertiary"><X size={14} /></button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewList(true)}
            className="p-1.5 rounded-full border border-dashed border-border text-on-surface-tertiary hover:text-on-surface hover:border-on-surface-tertiary transition-colors"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* ── Quick Notes Grid — Notes view ───────────────────────────── */}
      {todayView === 'notes' && (
        <div>
          {tasks.filter(t => t.isQuickNote && !t.deletedAt).length === 0 ? (
            <div className="flex flex-col items-center py-16 text-on-surface-tertiary">
              <StickyNote size={40} className="opacity-30 mb-3" />
              <p className="text-sm">{isRTL ? 'لا ملاحظات بعد' : 'No notes yet'}</p>
              <button onClick={openNewNote}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm hover:opacity-90">
                <Plus size={14} /> {isRTL ? 'أضف ملاحظة' : 'Add note'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {tasks.filter(t => t.isQuickNote && !t.deletedAt).map(note => (
                <button
                  key={note.id}
                  onClick={() => setEditingTask({ ...note })}
                  style={{ backgroundColor: note.noteColor ?? '#fef08a' }}
                  className="rounded-xl p-4 min-h-[110px] text-start shadow-sm hover:shadow-md transition-shadow group relative"
                >
                  {note.title && (
                    <p className="text-sm font-semibold text-gray-800 mb-1 leading-snug">{note.title}</p>
                  )}
                  {note.notes && (
                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-4">{note.notes}</p>
                  )}
                  {note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {note.tags.slice(0, 2).map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0 rounded-full bg-black/10 text-gray-700">#{t}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-gray-500 mt-2 absolute bottom-2 end-3">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {/* ── Habits Grid — dedicated view with streak + heatmap ─────── */}
      {todayView === 'habits' && (
        <HabitsGrid
          habits={tasks.filter(t => t.isHabit && !t.deletedAt)}
          allTasks={tasks}
          isRTL={isRTL}
          onEdit={(t) => setEditingTask({ ...t })}
          onComplete={async (habitId) => {
            // Spawn today's instance then toggle it
            await apiFetch('/api/tasks/habits/spawn-due', { method: 'POST' }).catch(() => {});
            await load();
            const today = new Date().toISOString().slice(0, 10);
            const instance = tasks.find(t => t.habitTemplateId === habitId && t.scheduledFor === today);
            if (instance) {
              await apiFetch(`/api/tasks/${instance.id}/toggle`, { method: 'PUT' }).catch(() => {});
              await load();
            }
          }}
          onOpenNew={openNewHabit}
        />
      )}

      {todayView !== 'notes' && todayView !== 'habits' && view === 'list' ? (
        <div>
          <TaskGroup label={isRTL ? '\u0645\u062b\u0628\u062a\u0629' : 'Pinned'} items={pinned} />
          <TaskGroup label={isRTL ? '\u0645\u062a\u0623\u062e\u0631\u0629' : 'Overdue'} items={overdue} />
          <TaskGroup label={isRTL ? '\u0627\u0644\u064a\u0648\u0645' : 'Today'} items={todayTasks} />
          <TaskGroup label={isRTL ? '\u0642\u0627\u062f\u0645\u0629' : 'Upcoming'} items={upcoming} />
          <TaskGroup label={isRTL ? '\u0628\u062f\u0648\u0646 \u0645\u0648\u0639\u062f' : 'No date'} items={noDate} />
          {completed.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-2 text-sm text-on-surface-tertiary hover:text-on-surface-secondary transition-colors"
              >
                {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {isRTL ? '\u0645\u0643\u062a\u0645\u0644\u0629' : 'Completed'} ({tasks.filter(t => t.completed).length})
              </button>
              {showCompleted && (
                <div className="mt-2 space-y-1 opacity-60">
                  {completed.map(task => (
                    <TaskListRow key={task.id} task={task} />
                  ))}
                </div>
              )}
            </div>
          )}
          {filtered.length === 0 && !tasks.some(t => t.completed) && (
            <div className="text-center py-16 text-on-surface-tertiary">
              <CheckSquare size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{isRTL ? '\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0647\u0627\u0645 \u0628\u0639\u062f' : 'No tasks yet'}</p>
              <p className="text-xs mt-1">{isRTL ? '\u0623\u0636\u0641 \u0645\u0647\u0645\u0629 \u062c\u062f\u064a\u062f\u0629 \u0645\u0646 \u0627\u0644\u0623\u0633\u0641\u0644' : 'Add a task from below'}</p>
            </div>
          )}
        </div>
      ) : (
        <div>
          {pinned.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-medium text-on-surface-tertiary uppercase mb-3">{isRTL ? '\u0645\u062b\u0628\u062a\u0629' : 'Pinned'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {pinned.map(task => <TaskGridCard key={task.id} task={task} onDragStart={handleDragStart} onDragOver={(e) => handleDragOver(e, task.id)} onDrop={(e) => handleDrop(e, task.id)} />)}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...overdue, ...todayTasks, ...upcoming, ...noDate].map(task => (
              <div key={task.id} onDragEnd={handleDragEnd}>
                <TaskGridCard task={task} onDragStart={handleDragStart} onDragOver={(e) => handleDragOver(e, task.id)} onDrop={(e) => handleDrop(e, task.id)} />
              </div>
            ))}
          </div>
          {showCompleted && completed.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-medium text-on-surface-tertiary uppercase mb-3">{isRTL ? '\u0645\u0643\u062a\u0645\u0644\u0629' : 'Completed'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 opacity-60">
                {completed.map(task => <TaskGridCard key={task.id} task={task} onDragStart={handleDragStart} onDragOver={(e) => handleDragOver(e, task.id)} onDrop={(e) => handleDrop(e, task.id)} />)}
              </div>
            </div>
          )}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-on-surface-tertiary col-span-full">
              <CheckSquare size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{isRTL ? '\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0647\u0627\u0645' : 'No tasks'}</p>
            </div>
          )}
          {!showCompleted && tasks.some(t => t.completed) && (
            <button
              onClick={() => setShowCompleted(true)}
              className="mt-4 text-sm text-on-surface-tertiary hover:text-on-surface-secondary transition-colors"
            >
              {isRTL ? `\u0639\u0631\u0636 \u0627\u0644\u0645\u0643\u062a\u0645\u0644\u0629 (${tasks.filter(t => t.completed).length})` : `Show completed (${tasks.filter(t => t.completed).length})`}
            </button>
          )}
        </div>
      )}

      {/* Trash section — soft-deleted tasks */}
      {tasks.some(t => (t as { deletedAt?: string }).deletedAt) && (
        <div className="mt-6 border-t border-border pt-4">
          <button
            onClick={() => {/* toggle trash visibility handled by todayView filter */}}
            className="text-xs text-on-surface-tertiary hover:text-error transition-colors flex items-center gap-1"
          >
            <Trash2 size={12} />
            {isRTL ? 'المحذوفات' : 'Trash'}
            {' '}({tasks.filter(t => (t as { deletedAt?: string }).deletedAt).length})
          </button>
        </div>
      )}

      {/* Quick Add (bottom floating) */}
      <div className="fixed bottom-4 md:bottom-6 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 w-full max-w-xl px-4">
        <div className="flex items-center gap-2 bg-surface border border-amber-500/30 rounded-xl shadow-lg px-4 py-2.5">
          <Plus size={18} className="text-amber-500 flex-shrink-0" />
          <input
            ref={quickAddRef}
            type="text"
            value={quickAddText}
            onChange={e => setQuickAddText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); quickAdd(); } }}
            placeholder={isRTL ? '\u0623\u0636\u0641 \u0645\u0647\u0645\u0629 \u062c\u062f\u064a\u062f\u0629...' : 'Add a new task...'}
            className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none"
            dir={isRTL ? 'rtl' : 'ltr'}
          />
          {quickAddText && (
            <button onClick={quickAdd} className="p-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors">
              <Plus size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Task Editor Modal */}
      {editingTask && (
        <TaskEditor
          task={editingTask}
          lists={lists}
          isRTL={isRTL}
          onSave={saveTask}
          onDelete={deleteTask}
          onTogglePin={togglePin}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

function TaskEditor({
  task, lists, isRTL, onSave, onDelete, onTogglePin, onClose,
}: {
  task: TaskItem;
  lists: string[];
  isRTL: boolean;
  onSave: (task: TaskItem) => void;
  onDelete: (id: string, title?: string) => void;
  onTogglePin: (id: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<TaskItem>({ ...task });
  const [newCheckItem, setNewCheckItem] = useState('');
  const [addingSubUnder, setAddingSubUnder] = useState<string | null>(null);
  const [subText, setSubText] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [newTag, setNewTag] = useState('');
  const subDragIdRef = useRef<string | null>(null);

  const update = (fields: Partial<TaskItem>) => setForm(prev => ({ ...prev, ...fields }));
  const colors = getContrastColor(form.color);

  // Recursive helpers (2 levels supported by UI but safe to traverse deeper)
  const mapItems = (items: ChecklistItem[], fn: (i: ChecklistItem) => ChecklistItem | null): ChecklistItem[] => {
    const out: ChecklistItem[] = [];
    for (const it of items) {
      const mapped = fn(it);
      if (mapped === null) continue;
      const children = it.children ? mapItems(it.children, fn) : undefined;
      out.push({ ...mapped, children });
    }
    return out;
  };

  const addCheckItem = () => {
    if (!newCheckItem.trim()) return;
    const item: ChecklistItem = { id: crypto.randomUUID(), text: newCheckItem.trim(), done: false };
    update({ checklist: [...form.checklist, item] });
    setNewCheckItem('');
  };

  const addSubItemUnder = (parentId: string) => {
    if (!subText.trim()) return;
    const newItem: ChecklistItem = { id: crypto.randomUUID(), text: subText.trim(), done: false };
    const addTo = (items: ChecklistItem[], depth = 0): ChecklistItem[] =>
      items.map(it => {
        if (it.id === parentId && depth < 2) {
          return { ...it, children: [...(it.children || []), newItem] };
        }
        if (it.children) return { ...it, children: addTo(it.children, depth + 1) };
        return it;
      });
    update({ checklist: addTo(form.checklist) });
    setSubText('');
    setAddingSubUnder(null);
  };

  const toggleCheckItem = (id: string) => {
    update({ checklist: mapItems(form.checklist, i => i.id === id ? { ...i, done: !i.done } : i) });
  };

  const removeCheckItem = (id: string) => {
    update({ checklist: mapItems(form.checklist, i => i.id === id ? null : i) });
  };

  const toggleCollapse = (id: string) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  // Reorder sub-items via drag within the same siblings level
  const handleSubDragStart = (e: React.DragEvent, id: string) => {
    subDragIdRef.current = id;
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleSubDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = subDragIdRef.current;
    subDragIdRef.current = null;
    if (!sourceId || sourceId === targetId) return;
    // Reorder within the same parent array
    const reorderIn = (items: ChecklistItem[]): { items: ChecklistItem[]; done: boolean } => {
      const sIdx = items.findIndex(i => i.id === sourceId);
      const tIdx = items.findIndex(i => i.id === targetId);
      if (sIdx !== -1 && tIdx !== -1) {
        const copy = [...items];
        const [moved] = copy.splice(sIdx, 1);
        copy.splice(tIdx, 0, moved);
        return { items: copy, done: true };
      }
      let done = false;
      const newItems = items.map(it => {
        if (done || !it.children) return it;
        const r = reorderIn(it.children);
        if (r.done) { done = true; return { ...it, children: r.items }; }
        return it;
      });
      return { items: newItems, done };
    };
    const result = reorderIn(form.checklist);
    if (result.done) update({ checklist: result.items });
  };

  const renderChecklistItems = (items: ChecklistItem[], depth = 0): React.ReactNode => {
    return items.map(item => {
      const hasChildren = item.children && item.children.length > 0;
      const isCollapsed = collapsed[item.id];
      return (
        <div key={item.id} style={{ paddingInlineStart: depth * 16 }}>
          <div
            draggable
            onDragStart={(e) => handleSubDragStart(e, item.id)}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => handleSubDrop(e, item.id)}
            className="flex items-center gap-2 group py-0.5"
          >
            {hasChildren ? (
              <button onClick={() => toggleCollapse(item.id)} className={cn('flex-shrink-0', colors.tertiary)}>
                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </button>
            ) : <span className="w-3" />}
            <button onClick={() => toggleCheckItem(item.id)}>
              {item.done ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} className={colors.tertiary} />}
            </button>
            <span className={cn('text-sm flex-1', colors.primary, item.done && 'line-through opacity-60')}>{item.text}</span>
            {depth < 2 && (
              <button
                onClick={() => { setAddingSubUnder(item.id); setSubText(''); }}
                className={cn('opacity-0 group-hover:opacity-100 transition-opacity text-xs', colors.tertiary, 'hover:text-accent')}
                title={isRTL ? '\u0623\u0636\u0641 \u0639\u0646\u0635\u0631 \u0641\u0631\u0639\u064a' : 'Add sub-item'}
              >
                <Plus size={12} />
              </button>
            )}
            <button onClick={() => removeCheckItem(item.id)} className={cn('opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500', colors.tertiary)}>
              <X size={12} />
            </button>
          </div>
          {addingSubUnder === item.id && (
            <div className="flex items-center gap-2 ps-6 py-1">
              <Plus size={12} className={colors.tertiary} />
              <input
                autoFocus
                type="text"
                value={subText}
                onChange={(e) => setSubText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSubItemUnder(item.id);
                  if (e.key === 'Escape') { setAddingSubUnder(null); setSubText(''); }
                }}
                onBlur={() => { if (!subText) setAddingSubUnder(null); }}
                placeholder={isRTL ? '\u0639\u0646\u0635\u0631 \u0641\u0631\u0639\u064a...' : 'Sub-item...'}
                className={cn('flex-1 text-sm bg-transparent border-b border-border focus:outline-none focus:border-accent', colors.primary)}
              />
            </div>
          )}
          {hasChildren && !isCollapsed && renderChecklistItems(item.children!, depth + 1)}
        </div>
      );
    });
  };

  const addTag = () => {
    if (!newTag.trim() || form.tags.includes(newTag.trim())) return;
    update({ tags: [...form.tags, newTag.trim()] });
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    update({ tags: form.tags.filter(t => t !== tag) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className={cn('bg-surface border border-border rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto', getCardBg(form.color))}
        onClick={e => e.stopPropagation()}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="p-5 space-y-4">
          {/* Title */}
          <input
            type="text"
            value={form.title}
            onChange={e => update({ title: e.target.value })}
            placeholder={isRTL ? '\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0647\u0645\u0629' : 'Task title'}
            className={cn('w-full text-lg font-medium bg-transparent placeholder:text-on-surface-tertiary focus:outline-none', colors.primary)}
          />

          {/* Notes */}
          <textarea
            value={form.notes}
            onChange={e => update({ notes: e.target.value })}
            placeholder={isRTL ? '\u0645\u0644\u0627\u062d\u0638\u0627\u062a...' : 'Notes...'}
            rows={3}
            className={cn('w-full bg-transparent text-sm placeholder:text-on-surface-tertiary focus:outline-none resize-none', colors.primary)}
          />

          {/* Checklist (nested, up to 2 levels) */}
          <div>
            <h4 className={cn('text-xs font-medium mb-2', colors.secondary)}>{isRTL ? '\u0642\u0627\u0626\u0645\u0629 \u0641\u0631\u0639\u064a\u0629' : 'Checklist'}</h4>
            <div className="space-y-0.5 mb-2">
              {renderChecklistItems(form.checklist)}
            </div>
            <div className="flex items-center gap-2">
              <Plus size={14} className={colors.tertiary} />
              <input
                type="text"
                value={newCheckItem}
                onChange={e => setNewCheckItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCheckItem()}
                placeholder={isRTL ? '\u0639\u0646\u0635\u0631 \u062c\u062f\u064a\u062f...' : 'New item...'}
                className={cn('flex-1 text-sm bg-transparent placeholder:text-on-surface-tertiary focus:outline-none', colors.primary)}
              />
            </div>
          </div>

          {/* Due date + time window (R19) */}
          <div className="space-y-2">
            <div className="flex-1">
              <label className="text-xs text-on-surface-secondary mb-1 block">{isRTL ? '\u0627\u0644\u062a\u0627\u0631\u064a\u062e' : 'Due date'}</label>
              <input
                type="date"
                value={form.dueDate || ''}
                onChange={e => update({ dueDate: e.target.value || null })}
                className="w-full bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-on-surface-secondary mb-1 block">{isRTL ? '\u0627\u0644\u0648\u0642\u062a' : 'Time'}</label>
              <input
                type="time"
                value={form.dueTime || ''}
                onChange={e => update({ dueTime: e.target.value || null })}
                className="w-full bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <AllDayAndWindow form={form} update={update} isRTL={isRTL} />
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs text-on-surface-secondary mb-2 block">{isRTL ? '\u0627\u0644\u0623\u0648\u0644\u0648\u064a\u0629' : 'Priority'}</label>
            <div className="flex items-center gap-2">
              {(['none', 'low', 'medium', 'high'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => update({ priority: p })}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs border transition-colors',
                    form.priority === p ? 'border-accent bg-accent/10 text-accent' : 'border-border text-on-surface-tertiary hover:text-on-surface'
                  )}
                >
                  {PRIORITY_CONFIG[p].label[isRTL ? 'ar' : 'en']}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div>
            <label className="text-xs text-on-surface-secondary mb-2 block">{isRTL ? '\u0627\u0644\u0642\u0627\u0626\u0645\u0629' : 'List'}</label>
            <div className="flex items-center gap-2 flex-wrap">
              {lists.map(l => (
                <button
                  key={l}
                  onClick={() => update({ list: l })}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs border transition-colors',
                    form.list === l ? 'border-accent bg-accent/10 text-accent' : 'border-border text-on-surface-tertiary hover:text-on-surface'
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Habit / Today / Cross-workspace — Round 6 */}
          <HabitSection form={form} update={update} isRTL={isRTL} />

          {/* Tags */}
          <div>
            <label className="text-xs text-on-surface-secondary mb-2 block">{isRTL ? '\u0627\u0644\u0648\u0633\u0648\u0645' : 'Tags'}</label>
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {form.tags.map(tag => (
                <span key={tag} className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs', colors.muted, colors.secondary)}>
                  {tag}
                  <button onClick={() => removeTag(tag)}><X size={10} /></button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Tag size={14} className="text-on-surface-tertiary" />
              <input
                type="text"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder={isRTL ? '\u0648\u0633\u0645 \u062c\u062f\u064a\u062f...' : 'New tag...'}
                className="flex-1 text-sm bg-transparent text-on-surface placeholder:text-on-surface-tertiary focus:outline-none"
              />
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="text-xs text-on-surface-secondary mb-2 block">{isRTL ? '\u0627\u0644\u0644\u0648\u0646' : 'Color'}</label>
            <div className="flex items-center gap-2">
              {CARD_COLORS.map(c => (
                <button
                  key={c.id}
                  onClick={() => update({ color: c.id })}
                  className={cn(
                    'w-7 h-7 rounded-full border-2 transition-colors',
                    c.bg,
                    form.color === c.id ? 'border-accent ring-2 ring-accent/20' : 'border-border'
                  )}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { onTogglePin(form.id); onClose(); }}
              className="p-2 rounded-lg text-on-surface-tertiary hover:text-on-surface hover:bg-surface-secondary transition-colors"
              title={form.pinned ? (isRTL ? '\u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u062a\u062b\u0628\u064a\u062a' : 'Unpin') : (isRTL ? '\u062a\u062b\u0628\u064a\u062a' : 'Pin')}
            >
              {form.pinned ? <PinOff size={16} /> : <Pin size={16} />}
            </button>
            <button
              onClick={() => { if (confirm(isRTL ? '\u0646\u0642\u0644 \u0644\u0644\u0645\u062d\u0630\u0648\u0641\u0627\u062a\u061f' : 'Move to trash?')) onDelete(form.id, form.title); }}
              className="p-2 rounded-lg text-on-surface-tertiary hover:text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-sm text-on-surface-secondary hover:bg-surface-secondary transition-colors"
            >
              {isRTL ? '\u0625\u0644\u063a\u0627\u0621' : 'Cancel'}
            </button>
            <button
              onClick={() => onSave(form)}
              className="px-4 py-1.5 rounded-lg text-sm bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              {isRTL ? '\u062d\u0641\u0638' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Round 6 — Habit editor section ────────────────────────────────
function HabitSection({
  form, update, isRTL,
}: {
  form: TaskItem;
  update: (fields: Partial<TaskItem>) => void;
  isRTL: boolean;
}) {
  const dayNames = isRTL
    ? ['أحد', 'إثن', 'ثلا', 'أرب', 'خمس', 'جمع', 'سبت']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const freq = form.habitFrequency ?? 'daily';
  const days = form.habitDays ?? [];

  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    update({ habitDays: next });
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          role="switch"
          aria-checked={!!form.isHabit}
          checked={!!form.isHabit}
          onChange={(e) => update({ isHabit: e.target.checked })}
          className="accent-accent h-4 w-4"
        />
        <span className="text-sm text-on-surface font-medium">
          {isRTL ? 'عادة متكررة' : 'Recurring habit'}
        </span>
      </label>

      {form.isHabit && (
        <div className="rounded-[var(--radius-lg)] border border-accent/20 bg-accent/5 p-3 space-y-3">
          <div>
            <label className="text-[11px] text-on-surface-tertiary uppercase tracking-wider mb-1 block">
              {isRTL ? 'التكرار' : 'Frequency'}
            </label>
            <div className="flex gap-1 flex-wrap">
              {([
                { id: 'daily' as const, labelAr: 'يومياً', labelEn: 'Daily' },
                { id: 'skip-weekends' as const, labelAr: 'بدون عطلة', labelEn: 'Skip weekends' },
                { id: 'weekly' as const, labelAr: 'أسبوعي', labelEn: 'Weekly' },
                { id: 'custom' as const, labelAr: 'مخصّص', labelEn: 'Custom' },
              ]).map((f) => (
                <button
                  key={f.id}
                  onClick={() => update({ habitFrequency: f.id })}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs border transition-colors',
                    freq === f.id
                      ? 'bg-accent text-on-accent border-accent'
                      : 'bg-surface border-border text-on-surface-secondary hover:bg-surface-secondary',
                  )}
                >
                  {isRTL ? f.labelAr : f.labelEn}
                </button>
              ))}
            </div>
          </div>

          {(freq === 'weekly' || freq === 'custom') && (
            <div>
              <label className="text-[11px] text-on-surface-tertiary uppercase tracking-wider mb-1 block">
                {isRTL ? 'أيام الأسبوع' : 'Days of week'}
              </label>
              <div className="flex gap-1 flex-wrap">
                {dayNames.map((name, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={cn(
                      'w-9 h-9 rounded-full text-[10px] font-semibold transition-colors border',
                      days.includes(i)
                        ? 'bg-accent text-on-accent border-accent'
                        : 'bg-surface border-border text-on-surface-secondary hover:bg-surface-secondary',
                    )}
                    aria-pressed={days.includes(i)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] text-on-surface-tertiary uppercase tracking-wider mb-1 block">
              {isRTL ? `المدة المستهدفة: ${form.durationMinutes ?? 0} دقيقة` : `Target duration: ${form.durationMinutes ?? 0} min`}
            </label>
            <input
              type="range"
              min={0}
              max={180}
              step={5}
              value={form.durationMinutes ?? 0}
              onChange={(e) => update({ durationMinutes: Number(e.target.value) || undefined })}
              className="w-full accent-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-on-surface-tertiary uppercase tracking-wider mb-1 block">
                {isRTL ? 'يبدأ' : 'Starts'}
              </label>
              <input
                type="date"
                value={form.habitStartDate ?? ''}
                onChange={(e) => update({ habitStartDate: e.target.value || null })}
                className="w-full h-8 bg-surface border border-border rounded px-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-on-surface-tertiary uppercase tracking-wider mb-1 block">
                {isRTL ? 'ينتهي' : 'Ends'}
              </label>
              <input
                type="date"
                value={form.habitEndDate ?? ''}
                onChange={(e) => update({ habitEndDate: e.target.value || null })}
                className="w-full h-8 bg-surface border border-border rounded px-2 text-xs"
              />
            </div>
          </div>

          {form.id && (
            <div className="pt-2 border-t border-accent/20">
              <HabitStatsRing habitId={form.id} />
            </div>
          )}
        </div>
      )}

      {/* Quick flags */}
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
          <input
            type="checkbox"
            role="switch"
            aria-checked={!!form.isToday}
            checked={!!form.isToday}
            onChange={(e) => update({ isToday: e.target.checked })}
            className="accent-accent h-4 w-4"
          />
          <span className="text-on-surface">{isRTL ? 'اليوم' : 'Today'}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
          <input
            type="checkbox"
            role="switch"
            aria-checked={!!form.crossWorkspace}
            checked={!!form.crossWorkspace}
            onChange={(e) => update({ crossWorkspace: e.target.checked })}
            className="accent-accent h-4 w-4"
          />
          <span className="text-on-surface">{isRTL ? 'عابرة للغرف' : 'Cross-workspace'}</span>
        </label>
      </div>
    </div>
  );
}

// ── R19 — All-day + start/end time window ─────────────────────────
function AllDayAndWindow({
  form, update, isRTL,
}: {
  form: TaskItem;
  update: (fields: Partial<TaskItem>) => void;
  isRTL: boolean;
}) {
  return (
    <div className="col-span-2 w-full space-y-2 mt-1">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          role="switch"
          aria-checked={!!form.allDay}
          checked={!!form.allDay}
          onChange={(e) => update({
            allDay: e.target.checked,
            startTime: e.target.checked ? null : form.startTime,
            endTime: e.target.checked ? null : form.endTime,
            dueTime: e.target.checked ? null : form.dueTime,
          })}
          className="accent-accent h-4 w-4"
        />
        <span className="text-sm text-on-surface">{isRTL ? 'يوم كامل' : 'All day'}</span>
      </label>
      {!form.allDay && (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs text-on-surface-secondary mb-1 block">
              {isRTL ? 'بداية' : 'Start'}
            </label>
            <input
              type="time"
              value={form.startTime || ''}
              onChange={(e) => update({
                startTime: e.target.value || null,
                dueTime: e.target.value || form.dueTime,
              })}
              className="w-full bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-on-surface-secondary mb-1 block">
              {isRTL ? 'نهاية' : 'End'}
            </label>
            <input
              type="time"
              value={form.endTime || ''}
              onChange={(e) => update({ endTime: e.target.value || null })}
              className="w-full bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── HabitsGrid — dedicated J-9 habits view ───────────────────────────────
function HabitsGrid({
  habits, allTasks, isRTL, onEdit, onComplete, onOpenNew,
}: {
  habits: TaskItem[];
  allTasks: TaskItem[];
  isRTL: boolean;
  onEdit: (t: TaskItem) => void;
  onComplete: (habitId: string) => Promise<void>;
  onOpenNew: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [completing, setCompleting] = useState<string | null>(null);

  const isDoneToday = (habitId: string) => {
    return allTasks.some(t =>
      t.habitTemplateId === habitId &&
      t.scheduledFor === today &&
      t.completed
    );
  };

  if (habits.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-on-surface-tertiary">
        <Flame size={40} className="opacity-30 mb-3" />
        <p className="text-sm">{isRTL ? 'لا عادات بعد' : 'No habits yet'}</p>
        <button onClick={onOpenNew}
          className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-on-accent text-sm hover:opacity-90">
          <Plus size={14} /> {isRTL ? 'أضف عادة' : 'Add habit'}
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {habits.map(habit => {
        const done = isDoneToday(habit.id);
        return (
          <div key={habit.id}
            className={cn(
              'rounded-xl border bg-surface-secondary p-4 space-y-3 transition-all',
              done ? 'border-success/40' : 'border-border'
            )}>
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-on-surface">{habit.title}</p>
                {habit.habitFrequency && (
                  <p className="text-[11px] text-on-surface-tertiary mt-0.5 capitalize">
                    {habit.habitFrequency === 'daily' ? (isRTL ? 'يومياً' : 'Daily') :
                     habit.habitFrequency === 'skip-weekends' ? (isRTL ? 'بدون عطلة' : 'Skip weekends') :
                     habit.habitFrequency === 'weekly' ? (isRTL ? 'أسبوعي' : 'Weekly') :
                     (isRTL ? 'مخصّص' : 'Custom')}
                  </p>
                )}
              </div>
              <button onClick={() => onEdit(habit)}
                className="text-[11px] text-on-surface-tertiary hover:text-accent px-2 py-1 rounded border border-border hover:border-accent/30">
                {isRTL ? 'تعديل' : 'Edit'}
              </button>
            </div>

            {/* Stats ring + heatmap from existing HabitStatsRing */}
            {habit.id && <HabitStatsRing habitId={habit.id} />}

            {/* Complete today */}
            <button
              disabled={completing === habit.id}
              onClick={async () => {
                setCompleting(habit.id);
                try { await onComplete(habit.id); } finally { setCompleting(null); }
              }}
              className={cn(
                'w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2',
                done
                  ? 'bg-success/15 text-success cursor-default'
                  : 'bg-surface-tertiary hover:bg-success/10 hover:text-success text-on-surface-secondary'
              )}
            >
              {completing === habit.id
                ? <Loader2 size={14} className="animate-spin" />
                : done
                  ? <><span>✓</span> {isRTL ? 'منجز اليوم' : 'Done today'} 🎉</>
                  : <>{isRTL ? 'أكمل اليوم' : 'Complete today'} <Flame size={14} /></>
              }
            </button>
          </div>
        );
      })}
    </div>
  );
}
