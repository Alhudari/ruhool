'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckSquare, Plus, ChevronRight, ChevronLeft, Loader2, Check,
  X, ChevronDown, Trash2, GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface TaskItem {
  id: string;
  title: string;
  notes?: string;
  completed: boolean;
  priority?: string;
  parentId?: string | null;
  list?: string;
  createdAt: string;
}

const STORAGE_KEY = 'ruhool-task-sidebar-open';
const EXPANDED_KEY = 'ruhool-task-sidebar-expanded';

function loadOpen(): boolean {
  if (typeof window === 'undefined') return true;
  try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch { return true; }
}

function loadExpanded(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

export function TaskSidebar() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [open, setOpen] = useState(loadOpen);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  // For adding subtasks inline:
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null);
  const [childTitle, setChildTitle] = useState('');

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, open ? '1' : '0'); } catch {} }, [open]);
  useEffect(() => { try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(expanded))); } catch {} }, [expanded]);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<TaskItem[]>('/api/tasks?archived=false')
      .then((d) => setTasks(d.filter((t) => !t.completed)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const toggleComplete = async (task: TaskItem) => {
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...task, completed: !task.completed }),
      });
      load();
    } catch {}
  };

  const addTask = async (parentId: string | null = null, title: string = newTitle) => {
    const t = title.trim();
    if (!t) return;
    setAdding(true);
    try {
      await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: t, list: 'الدكتوراه', parentId }),
      });
      if (parentId) {
        setChildTitle('');
        setAddingChildOf(null);
        // Auto-expand the parent so user sees what was added
        setExpanded((p) => new Set([...p, parentId]));
      } else {
        setNewTitle('');
      }
      load();
    } catch {}
    setAdding(false);
  };

  const deleteTask = async (id: string) => {
    if (!confirm(isRTL ? 'حذف المهمة؟' : 'Delete task?')) return;
    try {
      await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
      load();
    } catch {}
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Build hierarchy
  const childrenOf = (parentId: string | null) => tasks.filter((t) => (t.parentId ?? null) === parentId);
  const topLevel = childrenOf(null);

  const totalCount = tasks.length;

  // Recursive renderer for any depth of subtasks
  const renderTask = (task: TaskItem, depth: number) => {
    const subs = childrenOf(task.id);
    const isExpanded = expanded.has(task.id);
    const hasSubs = subs.length > 0;
    const completedSubs = subs.filter((s) => s.completed).length;
    const isAddingChild = addingChildOf === task.id;

    return (
      <div key={task.id}>
        <div
          className="flex items-start gap-1.5 px-2 py-1.5 hover:bg-sidebar-hover group"
          style={{ [isRTL ? 'paddingRight' : 'paddingLeft']: `${0.5 + depth * 1}rem` }}
        >
          {/* Expand caret (only if has subs OR is currently being added under) */}
          {hasSubs ? (
            <button
              onClick={() => toggleExpand(task.id)}
              className="p-0.5 rounded text-on-surface-tertiary hover:text-on-surface shrink-0 mt-0.5"
            >
              {isExpanded
                ? <ChevronDown className="h-3 w-3" />
                : (isRTL ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
            </button>
          ) : <span className="w-4 shrink-0" />}

          <button
            onClick={() => toggleComplete(task)}
            className={cn(
              'h-4 w-4 mt-0.5 shrink-0 rounded border flex items-center justify-center text-[10px] transition-colors',
              task.completed ? 'bg-success border-success text-white' : 'border-border hover:border-accent'
            )}
          >
            {task.completed && <Check className="h-3 w-3" />}
          </button>

          <div className="flex-1 min-w-0">
            <p className={cn(
              'text-xs leading-snug',
              task.completed ? 'line-through text-on-surface-tertiary' : 'text-on-surface'
            )}>{task.title}</p>
            {hasSubs && (
              <p className="text-[10px] text-on-surface-tertiary mt-0.5">
                {completedSubs}/{subs.length} {isRTL ? 'مكتمل' : 'done'}
              </p>
            )}
          </div>

          {/* Hover actions */}
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => { setAddingChildOf(task.id); setExpanded((p) => new Set([...p, task.id])); }}
              title={isRTL ? 'إضافة مهمة فرعية' : 'Add subtask'}
              className="p-0.5 rounded text-on-surface-tertiary hover:text-accent"
            >
              <GitBranch className="h-3 w-3" />
            </button>
            <button
              onClick={() => deleteTask(task.id)}
              title={isRTL ? 'حذف' : 'Delete'}
              className="p-0.5 rounded text-on-surface-tertiary hover:text-error"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Add-child input */}
        {isAddingChild && (
          <div
            className="flex items-center gap-1 px-2 py-1.5"
            style={{ [isRTL ? 'paddingRight' : 'paddingLeft']: `${1.5 + depth * 1}rem` }}
          >
            <span className="text-on-surface-tertiary opacity-50">↳</span>
            <input
              value={childTitle}
              onChange={(e) => setChildTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addTask(task.id, childTitle);
                if (e.key === 'Escape') { setAddingChildOf(null); setChildTitle(''); }
              }}
              placeholder={isRTL ? 'مهمة فرعية...' : 'Subtask...'}
              autoFocus
              className="flex-1 bg-surface border border-accent rounded px-2 py-1 text-[11px] text-on-surface focus:outline-none"
            />
            <button onClick={() => addTask(task.id, childTitle)} disabled={!childTitle.trim()} className="px-1.5 rounded bg-accent text-on-accent disabled:opacity-50">
              <Plus className="h-3 w-3" />
            </button>
            <button onClick={() => { setAddingChildOf(null); setChildTitle(''); }} className="p-1 text-on-surface-tertiary">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Children (recursive) */}
        {hasSubs && isExpanded && (
          <div className="border-s border-border" style={{ [isRTL ? 'marginRight' : 'marginLeft']: `${0.5 + depth * 1}rem` }}>
            {subs.map((s) => renderTask(s, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title={isRTL ? 'فتح المهام' : 'Open tasks'}
          className={cn(
            'hidden md:flex h-full w-8 items-center justify-center bg-sidebar hover:bg-sidebar-hover border-border text-on-surface-tertiary hover:text-accent transition-colors',
            isRTL ? 'border-r' : 'border-l'
          )}
        >
          {isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      )}

      <aside
        className={cn(
          'hidden md:flex h-full flex-col bg-sidebar border-border transition-all overflow-hidden',
          isRTL ? 'border-r' : 'border-l',
          open ? 'w-80' : 'w-0',
        )}
      >
        {open && <>
          <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
            <CheckSquare className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-on-surface flex-1">
              {isRTL ? 'المهام النشطة' : 'Active Tasks'}
            </h2>
            <span className="text-[11px] text-on-surface-tertiary">{totalCount}</span>
            <button
              onClick={() => setOpen(false)}
              title={isRTL ? 'طي' : 'Collapse'}
              className="p-1 rounded text-on-surface-tertiary hover:text-on-surface hover:bg-sidebar-hover"
            >
              {isRTL ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="p-3 border-b border-border">
            <div className="flex gap-1">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addTask(null); }}
                placeholder={isRTL ? 'مهمة جديدة...' : 'New task...'}
                className="flex-1 bg-surface border border-border rounded px-2 py-1.5 text-xs text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => addTask(null)}
                disabled={!newTitle.trim() || adding}
                className="px-2 rounded bg-accent text-on-accent disabled:opacity-50"
              >
                {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </button>
            </div>
            <p className="text-[10px] text-on-surface-tertiary mt-1.5 px-1">
              {isRTL ? 'مرّر فوق مهمة لإضافة فرع منها' : 'Hover a task to add a subtask'}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-on-surface-tertiary" />
              </div>
            ) : topLevel.length === 0 ? (
              <p className="text-xs text-on-surface-tertiary text-center py-8 px-4">
                {isRTL ? 'لا توجد مهام نشطة' : 'No active tasks'}
              </p>
            ) : (
              topLevel.map((t) => renderTask(t, 0))
            )}
          </div>
          <div className="px-4 py-2 border-t border-border">
            <a href="/tasks" className="text-[11px] text-on-surface-tertiary hover:text-accent">
              {isRTL ? '— عرض كل المهام →' : '— Open full tasks page →'}
            </a>
          </div>
        </>}
      </aside>
    </>
  );
}
