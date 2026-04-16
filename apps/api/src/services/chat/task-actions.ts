/**
 * Task action parser + executor. Extracted from index.ts (REL-01 stage 2d).
 *
 * Parses [TASK:*] / [NOTE:*] markers from assistant output and mutates the
 * store accordingly. All store/logger/task-queue interactions go through the
 * injected deps so there's no module-level state.
 */
import crypto from 'node:crypto';
import type {
  StoreData,
  TaskItem,
  KeepNote,
  ChecklistItemApi,
  ActivityRecord,
} from '../../store/types.js';

export type TaskAction =
  | { type: 'create'; data: Partial<TaskItem> }
  | { type: 'update'; id: string; data: Partial<TaskItem> }
  | { type: 'delete'; id: string }
  | { type: 'archive'; id: string }
  | { type: 'complete'; id: string }
  | { type: 'complete_all' }
  | { type: 'delete_all' }
  | { type: 'archive_all' }
  | { type: 'subtask'; id: string; data: { text: string; parentIdx?: number } }
  | { type: 'note_create'; data: Partial<KeepNote> }
  | { type: 'note_update'; id: string; data: Partial<KeepNote> }
  | { type: 'note_delete'; id: string };

export interface TaskActionsDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  logActivity: (
    type: ActivityRecord['type'],
    action: string,
    details: string,
    opts?: { agentId?: string; metadata?: Record<string, unknown>; requestId?: string | null },
  ) => ActivityRecord | void;
}

export interface TaskActionsApi {
  parse: (response: string) => TaskAction[];
  execute: (actions: TaskAction[]) => TaskItem[];
}

export function parseTaskActions(response: string): TaskAction[] {
  const actions: TaskAction[] = [];

  const createMatches = response.matchAll(/\[TASK:CREATE\]\s*(\{[\s\S]*?\})/g);
  for (const match of createMatches) {
    try { actions.push({ type: 'create', data: JSON.parse(match[1]) }); } catch { /* skip */ }
  }

  const updateMatches = response.matchAll(/\[TASK:UPDATE:([^\]]+)\]\s*(\{[\s\S]*?\})/g);
  for (const match of updateMatches) {
    try { actions.push({ type: 'update', id: match[1], data: JSON.parse(match[2]) }); } catch { /* skip */ }
  }

  const deleteMatches = response.matchAll(/\[TASK:DELETE:([^\]]+)\]/g);
  for (const match of deleteMatches) actions.push({ type: 'delete', id: match[1] });

  const archiveMatches = response.matchAll(/\[TASK:ARCHIVE:([^\]]+)\]/g);
  for (const match of archiveMatches) actions.push({ type: 'archive', id: match[1] });

  const completeMatches = response.matchAll(/\[TASK:COMPLETE:([^\]]+)\]/g);
  for (const match of completeMatches) actions.push({ type: 'complete', id: match[1] });

  if (/\[TASK:COMPLETE_ALL\]/.test(response)) actions.push({ type: 'complete_all' });
  if (/\[TASK:DELETE_ALL\]/.test(response)) actions.push({ type: 'delete_all' });
  if (/\[TASK:ARCHIVE_ALL\]/.test(response)) actions.push({ type: 'archive_all' });

  const subtaskMatches = response.matchAll(/\[TASK:SUBTASK:([^\]]+)\]\s*(\{[\s\S]*?\})/g);
  for (const match of subtaskMatches) {
    try { actions.push({ type: 'subtask', id: match[1], data: JSON.parse(match[2]) }); } catch { /* skip */ }
  }

  const noteCreateMatches = response.matchAll(/\[NOTE:CREATE\]\s*(\{[\s\S]*?\})/g);
  for (const match of noteCreateMatches) {
    try { actions.push({ type: 'note_create', data: JSON.parse(match[1]) }); } catch { /* skip */ }
  }

  const noteUpdateMatches = response.matchAll(/\[NOTE:UPDATE:([^\]]+)\]\s*(\{[\s\S]*?\})/g);
  for (const match of noteUpdateMatches) {
    try { actions.push({ type: 'note_update', id: match[1], data: JSON.parse(match[2]) }); } catch { /* skip */ }
  }

  const noteDeleteMatches = response.matchAll(/\[NOTE:DELETE:([^\]]+)\]/g);
  for (const match of noteDeleteMatches) actions.push({ type: 'note_delete', id: match[1] });

  return actions;
}

export function createTaskActions(deps: TaskActionsDeps): TaskActionsApi {
  const { getStore, saveStore, logActivity } = deps;

  function execute(actions: TaskAction[]): TaskItem[] {
    const store = getStore();
    if (!store.tasks) store.tasks = [];
    if (!store.keepNotes) store.keepNotes = [];
    if (!store.taskLists) store.taskLists = ['\u0639\u0627\u0645', '\u0627\u0644\u062f\u0643\u062a\u0648\u0631\u0627\u0647', '\u062c\u0645\u0639\u064a\u0629 \u0627\u0644\u0645\u0647\u0646\u062f\u0633\u064a\u0646', '\u0627\u0644\u0645\u062d\u062a\u0648\u0649', '\u0627\u0644\u0645\u0634\u0627\u0631\u064a\u0639'];
    const created: TaskItem[] = [];

    for (const action of actions) {
      if (action.type === 'create') {
        const now = new Date().toISOString();
        const task: TaskItem = {
          id: crypto.randomUUID(),
          title: action.data.title || '',
          notes: action.data.notes || '',
          completed: false,
          priority: action.data.priority || 'none',
          dueDate: action.data.dueDate || null,
          dueTime: action.data.dueTime || null,
          list: action.data.list || '\u0639\u0627\u0645',
          tags: action.data.tags || [],
          color: action.data.color || 'none',
          pinned: action.data.pinned || false,
          checklist: action.data.checklist || [],
          reminder: action.data.reminder || null,
          order: action.data.order ?? store.tasks.length,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        };
        store.tasks.push(task);
        created.push(task);
        logActivity('task', `Task created: ${task.title}`, task.notes || '', { agentId: 'tasks-agent', metadata: { taskId: task.id } });
      } else if (action.type === 'update') {
        const task = store.tasks.find(t => t.id === action.id);
        if (task) {
          Object.assign(task, action.data, { updatedAt: new Date().toISOString() });
          if (action.data.completed && !task.completedAt) task.completedAt = new Date().toISOString();
          if (action.data.completed === false) task.completedAt = null;
          logActivity('task', `Task updated: ${task.title}`, '', { agentId: 'tasks-agent', metadata: { taskId: task.id } });
        }
      } else if (action.type === 'delete') {
        const idx = store.tasks.findIndex(t => t.id === action.id);
        if (idx !== -1) {
          const deleted = store.tasks[idx];
          store.tasks.splice(idx, 1);
          logActivity('task', `Task deleted: ${deleted.title}`, '', { agentId: 'tasks-agent', metadata: { taskId: deleted.id } });
        }
      } else if (action.type === 'complete') {
        const task = store.tasks.find(t => t.id === action.id);
        if (task) {
          task.completed = true;
          task.completedAt = new Date().toISOString();
          task.updatedAt = new Date().toISOString();
          logActivity('task', `Task completed: ${task.title}`, '', { agentId: 'tasks-agent', metadata: { taskId: task.id } });
        }
      } else if (action.type === 'archive') {
        const task = store.tasks.find(t => t.id === action.id) as TaskItem & { archived?: boolean } | undefined;
        if (task) {
          task.archived = true;
          task.updatedAt = new Date().toISOString();
          logActivity('task', `Task archived: ${task.title}`, '', { agentId: 'tasks-agent', metadata: { taskId: task.id } });
        }
      } else if (action.type === 'complete_all') {
        const now = new Date().toISOString();
        let count = 0;
        for (const task of store.tasks) {
          if (!task.completed && !(task as TaskItem & { archived?: boolean }).archived) {
            task.completed = true;
            task.completedAt = now;
            task.updatedAt = now;
            count++;
          }
        }
        logActivity('task', `${count} tasks completed`, '', { agentId: 'tasks-agent' });
      } else if (action.type === 'delete_all') {
        const before = store.tasks.length;
        store.tasks = store.tasks.filter(t => !t.completed);
        logActivity('task', `${before - store.tasks.length} completed tasks deleted`, '', { agentId: 'tasks-agent' });
      } else if (action.type === 'archive_all') {
        const now = new Date().toISOString();
        let count = 0;
        for (const task of store.tasks) {
          const t = task as TaskItem & { archived?: boolean };
          if (task.completed && !t.archived) {
            t.archived = true;
            task.updatedAt = now;
            count++;
          }
        }
        logActivity('task', `${count} tasks archived`, '', { agentId: 'tasks-agent' });
      } else if (action.type === 'subtask') {
        const task = store.tasks.find(t => t.id === action.id);
        if (task) {
          const newItem: ChecklistItemApi = { id: crypto.randomUUID(), text: action.data.text, done: false };
          if (action.data.parentIdx !== undefined && task.checklist[action.data.parentIdx]) {
            const parent = task.checklist[action.data.parentIdx];
            if (!parent.children) parent.children = [];
            parent.children.push(newItem);
          } else {
            task.checklist.push(newItem);
          }
          task.updatedAt = new Date().toISOString();
          logActivity('task', `Sub-item added to: ${task.title}`, action.data.text, { agentId: 'tasks-agent', metadata: { taskId: task.id } });
        }
      } else if (action.type === 'note_create') {
        const now = new Date().toISOString();
        const note: KeepNote = {
          id: crypto.randomUUID(),
          title: action.data.title || '',
          content: action.data.content || '',
          type: action.data.type || 'text',
          items: action.data.items || [],
          color: action.data.color || 'none',
          pinned: action.data.pinned || false,
          archived: action.data.archived || false,
          labels: action.data.labels || [],
          reminders: action.data.reminders || [],
          images: action.data.images || [],
          order: action.data.order ?? store.keepNotes.length,
          createdAt: now,
          updatedAt: now,
        };
        store.keepNotes.push(note);
        logActivity('task', `Keep note created: ${note.title || '(untitled)'}`, '', { agentId: 'tasks-agent', metadata: { noteId: note.id } });
      } else if (action.type === 'note_update') {
        const note = store.keepNotes.find(n => n.id === action.id);
        if (note) {
          Object.assign(note, action.data, { updatedAt: new Date().toISOString() });
          logActivity('task', `Keep note updated: ${note.title || '(untitled)'}`, '', { agentId: 'tasks-agent', metadata: { noteId: note.id } });
        }
      } else if (action.type === 'note_delete') {
        const idx = store.keepNotes.findIndex(n => n.id === action.id);
        if (idx !== -1) {
          const deleted = store.keepNotes[idx];
          store.keepNotes.splice(idx, 1);
          logActivity('task', `Keep note deleted: ${deleted.title || '(untitled)'}`, '', { agentId: 'tasks-agent', metadata: { noteId: deleted.id } });
        }
      }
    }

    if (actions.length > 0) saveStore();
    // Persist changes to disk
    if (actions.length > 0) saveStore();
    return created;
  }

  return { parse: parseTaskActions, execute };
}
