/**
 * Workflow runs repository — Phase 2 dual-mode (Drizzle + Postgres OR JSON fallback).
 *
 * When DATABASE_URL is present, writes go to Postgres via Drizzle; the JSON
 * store is also kept in sync so in-memory consumers stay fresh.
 */
import { getRepoDb } from './db.js';
import { logger } from '../../server/logging.js';
import type { StoreData, WorkflowRunRecord, WorkflowRunStatus } from '../types.js';

function ensureArray(store: StoreData): WorkflowRunRecord[] {
  if (!store.workflowRuns) store.workflowRuns = [];
  return store.workflowRuns;
}

export async function createRun(
  store: StoreData,
  rec: WorkflowRunRecord
): Promise<WorkflowRunRecord> {
  ensureArray(store).push(rec);
  const db = getRepoDb();
  if (db) {
    try {
      const { workflowRuns } = await import('@ruhool/db');
      await db.insert(workflowRuns).values(recordToRow(rec));
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : err },
        '[workflow-runs.repo] DB insert failed (JSON OK)'
      );
    }
  }
  return rec;
}

export async function getRun(
  store: StoreData,
  id: string
): Promise<WorkflowRunRecord | null> {
  const db = getRepoDb();
  if (!db) return ensureArray(store).find((r) => r.id === id) || null;
  try {
    const { workflowRuns } = await import('@ruhool/db');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).limit(1);
    return rows[0] ? rowToRecord(rows[0]) : null;
  } catch {
    return ensureArray(store).find((r) => r.id === id) || null;
  }
}

export async function listRuns(
  store: StoreData,
  opts: { status?: WorkflowRunStatus; limit?: number } = {}
): Promise<WorkflowRunRecord[]> {
  const all = ensureArray(store);
  let filtered = opts.status ? all.filter((r) => r.status === opts.status) : all.slice();
  filtered = filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (opts.limit) filtered = filtered.slice(0, opts.limit);
  return filtered;
}

export async function updateRun(
  store: StoreData,
  id: string,
  patch: Partial<WorkflowRunRecord>
): Promise<WorkflowRunRecord | null> {
  const arr = ensureArray(store);
  const idx = arr.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  arr[idx] = { ...arr[idx], ...patch, updatedAt: new Date().toISOString() };
  const merged = arr[idx];
  const db = getRepoDb();
  if (db) {
    try {
      const { workflowRuns } = await import('@ruhool/db');
      const { eq } = await import('drizzle-orm');
      await db.update(workflowRuns).set(recordToRow(merged)).where(eq(workflowRuns.id, id));
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : err },
        '[workflow-runs.repo] DB update failed (JSON OK)'
      );
    }
  }
  return merged;
}

export async function deleteRun(store: StoreData, id: string): Promise<void> {
  store.workflowRuns = ensureArray(store).filter((r) => r.id !== id);
  const db = getRepoDb();
  if (!db) return;
  try {
    const { workflowRuns } = await import('@ruhool/db');
    const { eq } = await import('drizzle-orm');
    await db.delete(workflowRuns).where(eq(workflowRuns.id, id));
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      '[workflow-runs.repo] DB delete failed (JSON OK)'
    );
  }
}

// ─── mappers ───

interface DbRow {
  id: string;
  title: string;
  createdByConversationId: string | null;
  status: WorkflowRunStatus;
  currentStepIndex: number;
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  totalCostUsd: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

function rowToRecord(r: DbRow): WorkflowRunRecord {
  return {
    id: r.id,
    title: r.title,
    createdByConversationId: r.createdByConversationId,
    status: r.status,
    currentStepIndex: r.currentStepIndex,
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    error: r.error,
    totalCostUsd: r.totalCostUsd,
    metadata: r.metadata ?? undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function recordToRow(r: WorkflowRunRecord) {
  return {
    id: r.id,
    title: r.title,
    createdByConversationId: r.createdByConversationId ?? null,
    status: r.status,
    currentStepIndex: r.currentStepIndex,
    startedAt: r.startedAt ? new Date(r.startedAt) : null,
    completedAt: r.completedAt ? new Date(r.completedAt) : null,
    error: r.error ?? null,
    totalCostUsd: r.totalCostUsd,
    metadata: r.metadata ?? null,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  };
}
