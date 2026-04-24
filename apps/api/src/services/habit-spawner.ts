import crypto from 'node:crypto';
import type { StoreData, TaskItem } from '../store/types.js';

/**
 * Habit spawn logic. Pure — takes a store, mutates it to create today's
 * instance for every habit whose schedule matches today, and returns the
 * list of created instances.
 *
 * Idempotent: if an instance already exists for today (same
 * `habitTemplateId` + `scheduledFor=today`), no duplicate is created.
 */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isKuwaitWeekendIso(iso: string): boolean {
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay();
  return dow === 5 || dow === 6;  // Fri, Sat
}

export function shouldSpawnForDate(habit: TaskItem, iso: string): boolean {
  if (habit.habitEndDate && iso > habit.habitEndDate) return false;
  if (habit.habitStartDate && iso < habit.habitStartDate) return false;
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay();
  switch (habit.habitFrequency) {
    case 'daily': return true;
    case 'skip-weekends': return !isKuwaitWeekendIso(iso);
    case 'weekly':
    case 'custom': return (habit.habitDays ?? []).includes(dow);
    default: return true;
  }
}

export function spawnHabitsForToday(store: StoreData): TaskItem[] {
  if (!store.tasks) store.tasks = [];
  const today = todayIsoDate();
  const created: TaskItem[] = [];
  const existingTodayByTemplate = new Set(
    store.tasks
      .filter((t) => t.habitTemplateId && t.scheduledFor === today)
      .map((t) => t.habitTemplateId),
  );
  for (const habit of store.tasks) {
    if (!habit.isHabit) continue;
    if (!shouldSpawnForDate(habit, today)) continue;
    if (existingTodayByTemplate.has(habit.id)) continue;
    const now = new Date().toISOString();
    const instance: TaskItem = {
      ...habit,
      id: crypto.randomUUID(),
      completed: false,
      completedAt: null,
      isHabit: false,
      habitTemplateId: habit.id,
      scheduledFor: today,
      isToday: false,
      order: habit.order,
      createdAt: now,
      updatedAt: now,
    };
    store.tasks.push(instance);
    created.push(instance);
  }
  return created;
}
