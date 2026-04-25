'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  CheckSquare, Plus, ChevronRight, ChevronLeft, Loader2, Check,
  X, ChevronDown, Trash2, GitBranch, StickyNote, RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface QuickNote {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

// ─── LocalStorage helpers ────────────────────────────────────────────────────

const STORAGE_KEY = 'ruhool-task-sidebar-open';
const EXPANDED_KEY = 'ruhool-task-sidebar-expanded';
const NOTES_OPEN_KEY = 'ruhool-task-sidebar-notes-open';

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

function loadNotesOpen(): boolean {
  if (typeof window === 'undefined') return true;
  try { return localStorage.getItem(NOTES_OPEN_KEY) !== '0'; } catch { return true; }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TaskSidebar() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  // ── sidebar open/close ──
  const [open, setOpen] = useState(loadOpen);

  // ── task state ──
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null);
  const [childTitle, setChildTitle] = useState('');

  // ── completion animation ──
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set());
  const undoTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── quick notes state ──
  const [notesOpen, setNotesOpen] = useState(loadNotesOpen);
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);

  // ── persist preferences ──
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, open ? '1' : '0'); } catch {} }, [open]);
  useEffect(() => { try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(expanded))); } catch {} }, [expanded]);
  useEffect(() => { try { localStorage.setItem(NOTES_OPEN_KEY, notesOpen ? '1' : '0'); } catch {} }, [notesOpen]);

  // cleanup timers on unmount
  useEffect(() => {
    const timers = undoTimers.current;
    return () => { timers.forEach(clearTimeout); };
  }, []);

  // ── load tasks ──
  const loadTasks = useCallback(() => {
    setLoading(true);
    apiFetch<TaskItem[]>('/api/tasks?archived=false')
      .then((d) => setTasks(d.filter((t) => !t.completed)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTasks();
    const id = setInterval(loadTasks, 30_000);
    return () => clearInterval(id);
  }, [loadTasks]);

  // ── load quick notes ──
  const loadNotes = useCallback(() => {
    apiFetch<QuickNote[]>('/api/keep-notes?archived=false')
      .then((d) => setNotes(d))
      .catch(() => {});
  }, []);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  // ─── Task actions ────────────────────────────────────────────────────────

  const toggleComplete = async (task: TaskItem) => {
    const completing = !task.completed;
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...task, completed: completing }),
      });

      if (completing) {
        // Optimistically remove from list and track for undo
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
        setJustCompleted((prev) => new Set([...prev, task.id]));

        const timer = setTimeout(() => {
          setJustCompleted((prev) => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
          undoTimers.current.delete(task.id);
        }, 5_000);

        undoTimers.current.set(task.id, timer);
      } else {
        loadTasks();
      }
    } catch {}
  };

  const undoComplete = async (taskId: string) => {
    // Clear the undo timer
    const timer = undoTimers.current.get(taskId);
    if (timer) { clearTimeout(timer); undoTimers.current.delete(taskId); }
    setJustCompleted((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });

    try {
      await apiFetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: false, completedAt: null }),
      });
      loadTasks();
    } catch {}
  };

  const addTask = async (
    parentId: string | null = null,
    title: string = newTitle,
    list = 'الدكتوراه',
  ) => {
    const t = title.trim();
    if (!t) return;
    setAdding(true);
    try {
      await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: t, list, parentId }),
      });
      if (parentId) {
        setChildTitle('');
        setAddingChildOf(null);
        setExpanded((p) => new Set([...p, parentId]));
      } else if (list === 'Quick') {
        setQuickTaskTitle('');
      } else {
        setNewTitle('');
      }
      loadTasks();
    } catch {}
    setAdding(false);
  };

  const deleteTask = async (id: string) => {
    if (!confirm(isRTL ? 'حذف المهمة؟' : 'Delete task?')) return;
    try {
      await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
      loadTasks();
    } catch {}
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ─── Quick note actions ──────────────────────────────────────────────────

  const saveNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      await apiFetch('/api/keep-notes', {
        method: 'POST',
        body: JSON.stringify({ title: text, content: text, type: 'text' }),
      });
      setNoteText('');
      loadNotes();
    } catch {}
    setSavingNote(false);
  };

  const deleteNote = async (id: string) => {
    try {
      await apiFetch(`/api/keep-notes/${id}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {}
  };

  // ─── Hierarchy helpers ───────────────────────────────────────────────────

  const childrenOf = (parentId: string | null) =>
    tasks.filter((t) => (t.parentId ?? null) === parentId);

  const quickTasks = tasks.filter((t) => t.list === 'Quick');
  const regularTopLevel = childrenOf(null).filter((t) => t.list !== 'Quick');
  const totalCount = tasks.length;

  // ─── Undo banner (shown when justCompleted is non-empty) ─────────────────

  const justCompletedArray = Array.from(justCompleted);

  // ─── Task renderer ───────────────────────────────────────────────────────

  const renderTask = (task: TaskItem, depth: number) => {
    const subs = childrenOf(task.id);
    const isExpanded = expanded.has(task.id);
    const hasSubs = subs.length > 0;
    const completedSubs = subs.filter((s) => s.completed).length;
    const isAddingChild = addingChildOf === task.id;
    const isQuick = task.list === 'Quick';

    return (
      <div key={task.id}>
        <div
          className="flex items-start gap-1.5 px-2 py-1.5 hover:bg-sidebar-hover group"
          style={{ [isRTL ? 'paddingRight' : 'paddingLeft']: `${0.5 + depth * 1}rem` }}
        >
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
              'h-4 w-4 mt-0.5 shrink-0 rounded border flex items-center justify-center text-[10px] transition-all duration-300',
              task.completed
                ? 'bg-success border-success text-white scale-110'
                : isQuick
                  ? 'border-amber-400 hover:border-amber-500'
                  : 'border-border hover:border-accent',
            )}
          >
            {task.completed && <Check className="h-3 w-3 animate-in zoom-in-50 duration-200" />}
          </button>

          <div className="flex-1 min-w-0">
            <p className={cn(
              'text-xs leading-snug transition-all duration-300',
              task.completed
                ? 'line-through text-on-surface-tertiary'
                : isQuick
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-on-surface',
            )}>
              {task.title}
            </p>
            {hasSubs && (
              <p className="text-[10px] text-on-surface-tertiary mt-0.5">
                {completedSubs}/{subs.length} {isRTL ? 'مكتمل' : 'done'}
              </p>
            )}
          </div>

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

        {hasSubs && isExpanded && (
          <div className="border-s border-border" style={{ [isRTL ? 'marginRight' : 'marginLeft']: `${0.5 + depth * 1}rem` }}>
            {subs.map((s) => renderTask(s, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // ─── Undo banner items ───────────────────────────────────────────────────
  // We keep a snapshot of titles so we can show them in the undo bar
  const completedTitlesRef = useRef<Map<string, string>>(new Map());
  // Capture titles when tasks complete
  const handleComplete = (task: TaskItem) => {
    completedTitlesRef.current.set(task.id, task.title);
    toggleComplete(task);
  };

  // ─── Notes display ───────────────────────────────────────────────────────
  const visibleNotes = showAllNotes ? notes : notes.slice(0, 5);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title={isRTL ? 'فتح المهام' : 'Open tasks'}
          className={cn(
            'hidden md:flex h-full w-8 items-center justify-center bg-sidebar hover:bg-sidebar-hover border-border text-on-surface-tertiary hover:text-accent transition-colors',
            isRTL ? 'border-r' : 'border-l',
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
        {open && (
          <>
            {/* ── Header ── */}
            <div className="flex items-center gap-2 px-4 h-14 border-b border-border shrink-0">
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

            {/* ── Quick task input ── */}
            <div className="px-3 pt-2.5 pb-1 border-b border-border shrink-0">
              <div className="flex gap-1">
                <input
                  value={quickTaskTitle}
                  onChange={(e) => setQuickTaskTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTask(null, quickTaskTitle, 'Quick'); }}
                  placeholder={isRTL ? 'مهمة سريعة...' : 'Quick task...'}
                  className="flex-1 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300 placeholder:text-amber-400 focus:outline-none focus:border-amber-400 dark:focus:border-amber-600"
                />
                <button
                  onClick={() => addTask(null, quickTaskTitle, 'Quick')}
                  disabled={!quickTaskTitle.trim() || adding}
                  className="px-2 rounded bg-amber-400 dark:bg-amber-600 text-white disabled:opacity-50 hover:bg-amber-500 dark:hover:bg-amber-500 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* ── Regular task input ── */}
            <div className="px-3 pt-2 pb-2.5 border-b border-border shrink-0">
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

            {/* ── Undo bar ── */}
            {justCompletedArray.length > 0 && (
              <div className="shrink-0 bg-success/10 border-b border-success/20 px-3 py-1.5 flex flex-col gap-1">
                {justCompletedArray.map((id) => (
                  <div key={id} className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-success shrink-0" />
                    <span className="flex-1 text-[11px] text-success line-through truncate">
                      {completedTitlesRef.current.get(id) ?? '…'}
                    </span>
                    <button
                      onClick={() => undoComplete(id)}
                      className="flex items-center gap-0.5 text-[11px] text-on-surface-tertiary hover:text-accent shrink-0"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {isRTL ? 'تراجع' : 'Undo'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Task list ── */}
            <div className="flex-1 overflow-y-auto py-1 min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-on-surface-tertiary" />
                </div>
              ) : (
                <>
                  {/* Quick tasks at the top */}
                  {quickTasks.length > 0 && (
                    <div className="mb-1">
                      <p className="px-3 py-1 text-[10px] font-medium text-amber-500 uppercase tracking-wider">
                        {isRTL ? 'سريعة' : 'Quick'}
                      </p>
                      {quickTasks.map((t) => renderTask(t, 0))}
                      <div className="mx-3 border-b border-border/50 my-1" />
                    </div>
                  )}

                  {/* Regular tasks */}
                  {regularTopLevel.length === 0 && quickTasks.length === 0 ? (
                    <p className="text-xs text-on-surface-tertiary text-center py-8 px-4">
                      {isRTL ? 'لا توجد مهام نشطة' : 'No active tasks'}
                    </p>
                  ) : (
                    regularTopLevel.map((t) => {
                      // wrap renderTask to capture title on complete
                      const subs = childrenOf(t.id);
                      const isExpanded = expanded.has(t.id);
                      const hasSubs = subs.length > 0;
                      const completedSubs = subs.filter((s) => s.completed).length;
                      const isAddingChild = addingChildOf === t.id;

                      return (
                        <div key={t.id}>
                          <div
                            className="flex items-start gap-1.5 px-2 py-1.5 hover:bg-sidebar-hover group"
                            style={{ [isRTL ? 'paddingRight' : 'paddingLeft']: '0.5rem' }}
                          >
                            {hasSubs ? (
                              <button
                                onClick={() => toggleExpand(t.id)}
                                className="p-0.5 rounded text-on-surface-tertiary hover:text-on-surface shrink-0 mt-0.5"
                              >
                                {isExpanded
                                  ? <ChevronDown className="h-3 w-3" />
                                  : (isRTL ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
                              </button>
                            ) : <span className="w-4 shrink-0" />}

                            <button
                              onClick={() => handleComplete(t)}
                              className={cn(
                                'h-4 w-4 mt-0.5 shrink-0 rounded border flex items-center justify-center text-[10px] transition-all duration-300',
                                t.completed
                                  ? 'bg-success border-success text-white scale-110'
                                  : 'border-border hover:border-accent',
                              )}
                            >
                              {t.completed && <Check className="h-3 w-3" />}
                            </button>

                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                'text-xs leading-snug transition-all duration-300',
                                t.completed ? 'line-through text-on-surface-tertiary' : 'text-on-surface',
                              )}>
                                {t.title}
                              </p>
                              {hasSubs && (
                                <p className="text-[10px] text-on-surface-tertiary mt-0.5">
                                  {completedSubs}/{subs.length} {isRTL ? 'مكتمل' : 'done'}
                                </p>
                              )}
                            </div>

                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
                              <button
                                onClick={() => { setAddingChildOf(t.id); setExpanded((p) => new Set([...p, t.id])); }}
                                title={isRTL ? 'إضافة مهمة فرعية' : 'Add subtask'}
                                className="p-0.5 rounded text-on-surface-tertiary hover:text-accent"
                              >
                                <GitBranch className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => deleteTask(t.id)}
                                title={isRTL ? 'حذف' : 'Delete'}
                                className="p-0.5 rounded text-on-surface-tertiary hover:text-error"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>

                          {isAddingChild && (
                            <div className="flex items-center gap-1 px-2 py-1.5" style={{ [isRTL ? 'paddingRight' : 'paddingLeft']: '1.5rem' }}>
                              <span className="text-on-surface-tertiary opacity-50">↳</span>
                              <input
                                value={childTitle}
                                onChange={(e) => setChildTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') addTask(t.id, childTitle);
                                  if (e.key === 'Escape') { setAddingChildOf(null); setChildTitle(''); }
                                }}
                                placeholder={isRTL ? 'مهمة فرعية...' : 'Subtask...'}
                                autoFocus
                                className="flex-1 bg-surface border border-accent rounded px-2 py-1 text-[11px] text-on-surface focus:outline-none"
                              />
                              <button onClick={() => addTask(t.id, childTitle)} disabled={!childTitle.trim()} className="px-1.5 rounded bg-accent text-on-accent disabled:opacity-50">
                                <Plus className="h-3 w-3" />
                              </button>
                              <button onClick={() => { setAddingChildOf(null); setChildTitle(''); }} className="p-1 text-on-surface-tertiary">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          )}

                          {hasSubs && isExpanded && (
                            <div className="border-s border-border" style={{ [isRTL ? 'marginRight' : 'marginLeft']: '0.5rem' }}>
                              {subs.map((s) => renderTask(s, 1))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>

            {/* ── Footer link ── */}
            <div className="px-4 py-2 border-t border-border shrink-0">
              <a href="/tasks" className="text-[11px] text-on-surface-tertiary hover:text-accent">
                {isRTL ? '— عرض كل المهام →' : '— Open full tasks page →'}
              </a>
            </div>

            {/* ── Quick Notes section ── */}
            <div className="border-t border-border shrink-0">
              {/* Section header */}
              <button
                onClick={() => setNotesOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-sidebar-hover transition-colors"
              >
                <StickyNote className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="text-xs font-semibold text-on-surface flex-1 text-start">
                  {isRTL ? 'ملاحظات سريعة' : 'Quick Notes'}
                </span>
                {notes.length > 0 && (
                  <span className="text-[10px] text-on-surface-tertiary">{notes.length}</span>
                )}
                {notesOpen
                  ? <ChevronDown className="h-3 w-3 text-on-surface-tertiary" />
                  : (isRTL ? <ChevronRight className="h-3 w-3 text-on-surface-tertiary" /> : <ChevronLeft className="h-3 w-3 text-on-surface-tertiary rotate-180" />)}
              </button>

              {notesOpen && (
                <div className="px-3 pb-3">
                  {/* Notes list */}
                  {visibleNotes.length > 0 && (
                    <ul className="mb-2 space-y-1 max-h-44 overflow-y-auto">
                      {visibleNotes.map((note) => (
                        <li
                          key={note.id}
                          className="flex items-start gap-1.5 group bg-surface rounded px-2 py-1.5"
                        >
                          <p className="flex-1 text-[11px] text-on-surface leading-snug break-words min-w-0">
                            {note.title}
                          </p>
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            <button
                              onClick={() => deleteNote(note.id)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-on-surface-tertiary hover:text-error transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                            <span className="text-[9px] text-on-surface-tertiary whitespace-nowrap">
                              {new Date(note.createdAt).toLocaleDateString(isRTL ? 'ar' : 'en', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Show all / show less */}
                  {notes.length > 5 && (
                    <button
                      onClick={() => setShowAllNotes((v) => !v)}
                      className="text-[10px] text-accent hover:underline mb-2 block"
                    >
                      {showAllNotes
                        ? (isRTL ? 'عرض أقل' : 'Show less')
                        : (isRTL ? `عرض الكل (${notes.length})` : `Show all (${notes.length})`)}
                    </button>
                  )}

                  {/* Note input */}
                  <div className="flex flex-col gap-1">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          saveNote();
                        }
                      }}
                      placeholder={isRTL ? 'فكرة عابرة... (Enter للحفظ)' : 'Fleeting thought... (Enter to save)'}
                      rows={2}
                      className="w-full bg-surface border border-border rounded px-2 py-1.5 text-[11px] text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:border-accent resize-none"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={saveNote}
                        disabled={!noteText.trim() || savingNote}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-accent text-on-accent text-[11px] disabled:opacity-50 hover:opacity-90 transition-opacity"
                      >
                        {savingNote
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Plus className="h-3 w-3" />}
                        {isRTL ? 'حفظ' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
