/**
 * Background-research task tracker. Extracted from index.ts (REL-01 stage 2d).
 *
 * This is the ephemeral in-memory registry for long-running background
 * research jobs (NOT the `tasks` domain which lives in `store.tasks`).
 * It deliberately does not persist — tasks are recreated on restart from
 * the job queue.
 */
import type { TaskRecord } from '../store/types.js';

export const taskStore: Map<string, TaskRecord> = new Map();

export function updateTask(id: string, updates: Partial<TaskRecord>): void {
  const task = taskStore.get(id);
  if (task) {
    Object.assign(task, updates, { updatedAt: new Date().toISOString() });
  }
}
