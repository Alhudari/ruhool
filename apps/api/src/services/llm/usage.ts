/**
 * LLM usage accounting — extracted from the god-file (index.ts) as part of
 * REL-01 stage 2b.
 *
 * Pure functions for computing USD cost from token counts + writing usage
 * records through the existing repository. No singletons.
 */
import crypto from 'node:crypto';
import { appendUsage, type UsageRecord as RepoUsageRecord } from '../../store/repositories/usage.repo.js';
import type { StoreData } from '../../store/types.js';

export interface UsageInput {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  /** Estimator bound to the provider (e.g. `provider.estimateCost`). */
  estimateCost: (inputTokens: number, outputTokens: number, model: string) => number;
  durationMs?: number;
  success?: boolean;
  error?: string | null;
  agentId?: string | null;
  workflowId?: string | null;
  conversationId?: string | null;
}

/**
 * Compute USD cost for a given token-usage event.
 */
export function computeCostUsd(input: Omit<UsageInput, 'durationMs' | 'success' | 'error' | 'agentId' | 'workflowId' | 'conversationId'>): number {
  return input.estimateCost(input.inputTokens, input.outputTokens, input.model);
}

/**
 * Record a usage event into the in-memory store + dual-write it to Postgres
 * through the repository layer.
 *
 * The in-memory `store.usage` shape is intentionally narrower than the DB
 * column set for historical compatibility — the repository handles the wider
 * `RepoUsageRecord` shape.
 */
export async function recordUsage(
  store: Pick<StoreData, 'usage'>,
  input: UsageInput,
): Promise<RepoUsageRecord> {
  const totalCostUsd = computeCostUsd(input);
  const rec: RepoUsageRecord = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    provider: input.provider,
    model: input.model,
    agentId: input.agentId ?? null,
    workflowId: input.workflowId ?? null,
    conversationId: input.conversationId ?? null,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cachedTokens: input.cachedTokens ?? 0,
    totalCostUsd,
    durationMs: input.durationMs ?? 0,
    success: input.success ?? true,
    error: input.error ?? null,
  };
  // The repo expects `{ usage: UsageRecord[] }` — `StoreData.usage` has a
  // slightly narrower type, but at runtime the extra optional fields are
  // tolerated on write.
  await appendUsage({ usage: store.usage as unknown as RepoUsageRecord[] }, rec);
  return rec;
}
