/**
 * Workflow steps repository — Phase 2 dual-mode.
 */
import { getRepoDb } from './db.js';
import { logger } from '../../server/logging.js';
import type { StoreData, WorkflowStepRecord } from '../types.js';

function ensureArray(store: StoreData): WorkflowStepRecord[] {
  if (!store.workflowSteps) store.workflowSteps = [];
  return store.workflowSteps;
}

export async function createStep(
  store: StoreData,
  rec: WorkflowStepRecord
): Promise<WorkflowStepRecord> {
  ensureArray(store).push(rec);
  const db = getRepoDb();
  if (db) {
    try {
      const { workflowSteps } = await import('@ruhool/db');
      await db.insert(workflowSteps).values(recordToRow(rec));
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : err },
        '[workflow-steps.repo] DB insert failed (JSON OK)'
      );
    }
  }
  return rec;
}

export async function getStep(
  store: StoreData,
  id: string
): Promise<WorkflowStepRecord | null> {
  const db = getRepoDb();
  if (!db) return ensureArray(store).find((s) => s.id === id) || null;
  try {
    const { workflowSteps } = await import('@ruhool/db');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(workflowSteps).where(eq(workflowSteps.id, id)).limit(1);
    return rows[0] ? rowToRecord(rows[0]) : null;
  } catch {
    return ensureArray(store).find((s) => s.id === id) || null;
  }
}

export async function listStepsForRun(
  store: StoreData,
  runId: string
): Promise<WorkflowStepRecord[]> {
  const all = ensureArray(store).filter((s) => s.runId === runId);
  return all.sort((a, b) => a.stepIndex - b.stepIndex);
}

export async function updateStep(
  store: StoreData,
  id: string,
  patch: Partial<WorkflowStepRecord>
): Promise<WorkflowStepRecord | null> {
  const arr = ensureArray(store);
  const idx = arr.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  arr[idx] = { ...arr[idx], ...patch, updatedAt: new Date().toISOString() };
  const merged = arr[idx];
  const db = getRepoDb();
  if (db) {
    try {
      const { workflowSteps } = await import('@ruhool/db');
      const { eq } = await import('drizzle-orm');
      await db.update(workflowSteps).set(recordToRow(merged)).where(eq(workflowSteps.id, id));
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : err },
        '[workflow-steps.repo] DB update failed (JSON OK)'
      );
    }
  }
  return merged;
}

// ─── mappers ───

interface DbRow {
  id: string;
  runId: string;
  stepIndex: number;
  specialist: string;
  task: string;
  expectedOutput: string | null;
  status: WorkflowStepRecord['status'];
  startedAt: Date | null;
  completedAt: Date | null;
  input: Record<string, unknown> | null;
  output: string | null;
  artifacts: WorkflowStepRecord['artifacts'];
  usage: WorkflowStepRecord['usage'];
  durationMs: number | null;
  timeoutMs: number | null;
  attemptCount: number | null;
  maxAttempts: number | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function rowToRecord(r: DbRow): WorkflowStepRecord {
  return {
    id: r.id,
    runId: r.runId,
    stepIndex: r.stepIndex,
    specialist: r.specialist,
    task: r.task,
    expectedOutput: r.expectedOutput,
    status: r.status,
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    input: r.input,
    output: r.output,
    artifacts: r.artifacts,
    usage: r.usage,
    durationMs: r.durationMs,
    timeoutMs: r.timeoutMs,
    attemptCount: r.attemptCount,
    maxAttempts: r.maxAttempts,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function recordToRow(r: WorkflowStepRecord) {
  return {
    id: r.id,
    runId: r.runId,
    stepIndex: r.stepIndex,
    specialist: r.specialist,
    task: r.task,
    expectedOutput: r.expectedOutput ?? null,
    status: r.status,
    startedAt: r.startedAt ? new Date(r.startedAt) : null,
    completedAt: r.completedAt ? new Date(r.completedAt) : null,
    input: r.input ?? null,
    output: r.output ?? null,
    artifacts: r.artifacts ?? null,
    usage: r.usage ?? null,
    durationMs: r.durationMs ?? null,
    timeoutMs: r.timeoutMs ?? null,
    attemptCount: r.attemptCount ?? null,
    maxAttempts: r.maxAttempts ?? null,
    error: r.error ?? null,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  };
}
