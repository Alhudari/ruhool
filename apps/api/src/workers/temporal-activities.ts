import crypto from 'node:crypto';
import { logger } from '../server/logging.js';

/**
 * Default implementations of research workflow activities.
 *
 * These are intentionally minimal — real integrations (search provider,
 * LLM summarizer, store write) should be injected by the production bootstrap
 * once Temporal is in use.
 */

export async function searchSources(query: string): Promise<string[]> {
  logger.info({ query }, 'temporal.searchSources');
  // Placeholder: real impl would call a search API.
  return [];
}

export async function summarizeSources(sources: string[]): Promise<string> {
  logger.info({ count: sources.length }, 'temporal.summarizeSources');
  if (sources.length === 0) return 'No sources found.';
  return `Summary of ${sources.length} sources.`;
}

export async function storeResearchResult(input: {
  query: string;
  summary: string;
  sources: string[];
  requestId?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  logger.info(
    { id, query: input.query, requestId: input.requestId },
    'temporal.storeResearchResult'
  );
  return id;
}
