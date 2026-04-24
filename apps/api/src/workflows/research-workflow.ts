import { proxyActivities } from '@temporalio/workflow';

/**
 * ARC-02: durable research workflow for الباحث (Al-Bahith).
 *
 * Activities are implemented in `../workers/temporal-activities.ts` and proxied
 * here via Temporal's deterministic runtime. The workflow orchestrates:
 *   search → summarize → store.
 *
 * If Temporal is disabled (no TEMPORAL_ADDRESS), this file is never imported
 * at runtime. The workflow function is only invoked by a Temporal client.
 */

// Activity proxy signatures (resolved by the worker at registration).
export interface ResearchActivities {
  searchSources(query: string): Promise<string[]>;
  summarizeSources(sources: string[]): Promise<string>;
  storeResearchResult(input: {
    query: string;
    summary: string;
    sources: string[];
    requestId?: string;
  }): Promise<string>;
}

const activities = proxyActivities<ResearchActivities>({
  startToCloseTimeout: '10 minutes',
  retry: { maximumAttempts: 3 },
});

export interface ResearchWorkflowInput {
  query: string;
  requestId?: string;
}

export interface ResearchWorkflowResult {
  summary: string;
  sources: string[];
  artifactId: string;
}

export async function researchWorkflow(
  input: ResearchWorkflowInput
): Promise<ResearchWorkflowResult> {
  const sources = await activities.searchSources(input.query);
  const summary = await activities.summarizeSources(sources);
  const artifactId = await activities.storeResearchResult({
    query: input.query,
    summary,
    sources,
    requestId: input.requestId,
  });
  return { summary, sources, artifactId };
}
