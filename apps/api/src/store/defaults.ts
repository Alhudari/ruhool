// Store bootstrap / defaults — extracted from index.ts (REL-01 stage 2d final trim).
// Seeds empty arrays, Experiments category, built-in tags, prompt overrides.

import type { StoreData } from './types.js';
import { DEFAULT_MIND_BLOCK, DEFAULT_AGENT_INTEGRATIONS } from '@ruhool/core';

export const EXPERIMENTS_CATEGORY_ID = 'builtin:experiments';

export interface StoreDefaultsResult {
  store: StoreData;
  overridesRestored: number;
}

export function applyStoreDefaults(
  store: StoreData,
  opts: {
    saveStore: () => void;
    builtinSystemPrompts: Record<string, string>;
  },
): StoreDefaultsResult {
  if (!store.customAgents) store.customAgents = [];
  if (!store.memories) store.memories = [];
  if (!store.papers) store.papers = [];
  if (!store.notes) store.notes = [];
  if (!store.workflows) store.workflows = [];
  if (!store.tools) store.tools = [];
  if (!store.activityLog) store.activityLog = [];
  if (!store.libraryCategories) store.libraryCategories = [];
  if (!store.libraryTags) store.libraryTags = [];
  if (!store.libraryItemMeta) store.libraryItemMeta = {};
  if (!store.readingSessions) store.readingSessions = [];
  if (!store.pageAnalyses) store.pageAnalyses = [];
  if (!store.agentNameOverrides) store.agentNameOverrides = {};
  if (!store.shwashaSettings) {
    store.shwashaSettings = {
      mindBlock: DEFAULT_MIND_BLOCK,
      agentIntegrations: DEFAULT_AGENT_INTEGRATIONS,
      defaultLanguage: 'en',
    };
  }

  if (!store.libraryCategories!.find((c) => c.id === EXPERIMENTS_CATEGORY_ID)) {
    store.libraryCategories!.push({
      id: EXPERIMENTS_CATEGORY_ID,
      name: { ar: '\u062a\u062c\u0627\u0631\u0628', en: 'Experiments' },
      parentId: null,
      color: '#f59e0b',
      builtin: true,
    });
  }

  if (!store.libraryTags!.length) {
    const seedTags: Array<{ ar: string; en: string }> = [
      { ar: '\u0641\u064a\u062f\u064a\u0648', en: 'Video' },
      { ar: '\u0635\u0648\u062a', en: 'Audio' },
      { ar: '\u0627\u0646\u0645\u064a\u0634\u0646', en: 'Animation' },
      { ar: '\u0635\u0648\u0631 \u0641\u0639\u0644\u064a\u0629', en: 'Real images' },
      { ar: '\u0641\u064a\u062f\u064a\u0648 \u0641\u0639\u0644\u064a', en: 'Real video' },
    ];
    for (const t of seedTags) {
      store.libraryTags!.push({
        id: `builtin:${t.en.toLowerCase().replace(/\s+/g, '-')}`,
        name: t,
        builtin: true,
      });
    }
    opts.saveStore();
  }

  // B-5: backfill retry fields for existing AgentTaskRecords
  for (const t of (store.agentTasks ?? [])) {
    if (t.retryCount === undefined) t.retryCount = 0;
    if (t.maxRetries === undefined) t.maxRetries = 3;
    if (t.nextRetryAt === undefined) t.nextRetryAt = null;
    if (t.timeoutMs === undefined) t.timeoutMs = null;
    if (t.lastError === undefined) t.lastError = null;
    if (t.idempotencyKey === undefined) t.idempotencyKey = null;
  }

  let overridesRestored = 0;
  const overrides = store.promptOverrides;
  if (overrides) {
    for (const [agentId, prompt] of Object.entries(overrides)) {
      if (prompt) opts.builtinSystemPrompts[agentId] = prompt;
    }
    overridesRestored = Object.keys(overrides).length;
  }

  return { store, overridesRestored };
}
