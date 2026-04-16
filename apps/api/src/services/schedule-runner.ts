// Schedule runner — extracted from index.ts (REL-01 stage 2d final trim).
// Executes a ScheduleRecord via the anthropic provider + per-agent prompt.

import type { ScheduleRecord, StoreData } from '../store/types.js';
import { computeNextRun } from '../routes/schedules.js';

export interface ScheduleRunnerDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  getProvider: () => {
    chat: (params: { model: string; systemPrompt?: string; messages: Array<{ role: string; content: string }>; maxTokens?: number }) => AsyncIterable<{ type: string; content?: string }>;
  } | null;
  systemPrompts: {
    manager: string;
    research: string;
    readingHelper: string;
    writingCritic: string;
    contentCreator: string;
  };
  logActivity: (...args: unknown[]) => unknown;
}

export function createScheduleRunner(deps: ScheduleRunnerDeps) {
  const { getStore, saveStore, getProvider, systemPrompts, logActivity } = deps;

  async function runSchedule(schedule: ScheduleRecord) {
    const provider = getProvider();
    if (!provider) {
      schedule.lastResult = 'Error: No provider configured';
      schedule.lastRunAt = new Date().toISOString();
      schedule.nextRunAt = schedule.enabled ? computeNextRun(schedule.cron) : null;
      saveStore();
      return;
    }

    const SCHED_PROMPTS: Record<string, string> = {
      manager: systemPrompts.manager,
      research: systemPrompts.research,
      'reading-helper': systemPrompts.readingHelper,
      'writing-critic': systemPrompts.writingCritic,
      'content-creator': systemPrompts.contentCreator,
    };
    let systemPrompt = SCHED_PROMPTS[schedule.agentId] || '';
    if (!systemPrompt) {
      const custom = getStore().customAgents.find((a) => a.id === schedule.agentId);
      if (custom) systemPrompt = custom.systemPrompt;
    }

    try {
      let result = '';
      for await (const chunk of provider.chat({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: schedule.prompt }],
        systemPrompt,
        maxTokens: 2048,
      })) {
        if (chunk.type === 'text') result += chunk.content;
      }
      schedule.lastResult = result;
      schedule.lastRunAt = new Date().toISOString();
      schedule.nextRunAt = schedule.enabled ? computeNextRun(schedule.cron) : null;
      saveStore();
      logActivity('system', 'Schedule executed', `${schedule.name.en} ran successfully`, {
        agentId: schedule.agentId, metadata: { scheduleId: schedule.id },
      } as unknown);
    } catch (err) {
      schedule.lastResult = `Error: ${err instanceof Error ? err.message : 'Unknown'}`;
      schedule.lastRunAt = new Date().toISOString();
      schedule.nextRunAt = schedule.enabled ? computeNextRun(schedule.cron) : null;
      saveStore();
    }
  }

  return { runSchedule };
}
