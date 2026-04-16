/**
 * Usage (token/cost) repository — dual-mode.
 * Append-only; rows are never updated, so writes just insert.
 */
import { getRepoDb } from './db.js';
import { logger } from '../../server/logging.js';

export interface UsageRecord {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  agentId?: string | null;
  workflowId?: string | null;
  conversationId?: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  inputCostUsd?: number;
  outputCostUsd?: number;
  totalCostUsd: number;
  durationMs?: number;
  success?: boolean;
  error?: string | null;
}

export interface JsonUsageStoreLike {
  usage: UsageRecord[];
}

export async function appendUsage(json: JsonUsageStoreLike, rec: UsageRecord): Promise<void> {
  json.usage.push(rec);
  const db = getRepoDb();
  if (!db) return;
  try {
    const { apiUsage } = await import('@ruhool/db');
    await db.insert(apiUsage).values({
      id: rec.id,
      timestamp: new Date(rec.timestamp),
      provider: rec.provider,
      model: rec.model,
      agentId: rec.agentId ?? null,
      workflowId: rec.workflowId ?? null,
      conversationId: rec.conversationId ?? null,
      inputTokens: rec.inputTokens,
      outputTokens: rec.outputTokens,
      cachedTokens: rec.cachedTokens ?? 0,
      inputCostUsd: rec.inputCostUsd ?? 0,
      outputCostUsd: rec.outputCostUsd ?? 0,
      totalCostUsd: rec.totalCostUsd,
      durationMs: rec.durationMs ?? 0,
      success: rec.success ?? true,
      error: rec.error ?? null,
    });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, '[usage.repo] DB insert failed (JSON OK)');
  }
}

export async function listRecentUsage(json: JsonUsageStoreLike, limit = 100): Promise<UsageRecord[]> {
  const db = getRepoDb();
  if (!db) {
    return [...json.usage].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
  }
  try {
    const { apiUsage } = await import('@ruhool/db');
    const { desc } = await import('drizzle-orm');
    const rows = await db.select().from(apiUsage).orderBy(desc(apiUsage.timestamp)).limit(limit);
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp.toISOString(),
      provider: r.provider,
      model: r.model,
      agentId: r.agentId,
      workflowId: r.workflowId,
      conversationId: r.conversationId,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cachedTokens: r.cachedTokens,
      inputCostUsd: r.inputCostUsd,
      outputCostUsd: r.outputCostUsd,
      totalCostUsd: r.totalCostUsd,
      durationMs: r.durationMs,
      success: r.success,
      error: r.error,
    }));
  } catch {
    return [...json.usage].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
  }
}
