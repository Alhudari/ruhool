/**
 * F-017: Store retention / compaction
 *
 * The platform persists everything to a single JSON file. Without retention,
 * messages, usage, agentRuns[].events, reportRuns, reportInbox, and agentTasks
 * grow unbounded, slowing every save.
 *
 * Caps are conservative — sized for 6-12 months of personal-use traffic.
 */
import type { StoreData } from './types.js';

const RETENTION_CAPS = {
  messages: 5_000,         // per-conversation only kept; oldest archived
  usage: 10_000,
  reportRuns: 1_000,
  reportInbox: 500,
  agentTasks: 1_000,       // includes deleted (for grep)
  agentRunsPerRun: 500,    // events per run
  activityLog: 1_000,      // already capped at 500 in some paths; align here
};

function trimByDate<T extends { createdAt?: string; timestamp?: string }>(
  arr: T[],
  cap: number,
): T[] {
  if (arr.length <= cap) return arr;
  // Sort newest-first by createdAt or timestamp; keep the most recent `cap` items
  const sorted = [...arr].sort((a, b) => {
    const aT = (a.createdAt ?? a.timestamp ?? '');
    const bT = (b.createdAt ?? b.timestamp ?? '');
    return bT.localeCompare(aT);
  });
  return sorted.slice(0, cap);
}

export interface CompactionStats {
  messagesRemoved: number;
  usageRemoved: number;
  reportRunsRemoved: number;
  reportInboxRemoved: number;
  agentTasksRemoved: number;
  eventsRemoved: number;
  activityLogRemoved: number;
}

/**
 * Apply retention caps to the in-memory store. Returns how many records were dropped.
 * Caller is responsible for calling saveStore() afterward.
 */
export function compactStore(store: StoreData): CompactionStats {
  const stats: CompactionStats = {
    messagesRemoved: 0,
    usageRemoved: 0,
    reportRunsRemoved: 0,
    reportInboxRemoved: 0,
    agentTasksRemoved: 0,
    eventsRemoved: 0,
    activityLogRemoved: 0,
  };

  if (store.messages && store.messages.length > RETENTION_CAPS.messages) {
    const before = store.messages.length;
    store.messages = trimByDate(store.messages, RETENTION_CAPS.messages);
    stats.messagesRemoved = before - store.messages.length;
  }

  if (store.usage && store.usage.length > RETENTION_CAPS.usage) {
    const before = store.usage.length;
    store.usage = trimByDate(store.usage, RETENTION_CAPS.usage);
    stats.usageRemoved = before - store.usage.length;
  }

  if (store.reportRuns && store.reportRuns.length > RETENTION_CAPS.reportRuns) {
    const before = store.reportRuns.length;
    type RunWithDate = (typeof store.reportRuns)[number] & { createdAt?: string; startedAt?: string };
    store.reportRuns = trimByDate(
      store.reportRuns.map((r): RunWithDate => ({ ...r, createdAt: (r as RunWithDate).startedAt })),
      RETENTION_CAPS.reportRuns,
    );
    stats.reportRunsRemoved = before - store.reportRuns.length;
  }

  if (store.reportInbox && store.reportInbox.length > RETENTION_CAPS.reportInbox) {
    const before = store.reportInbox.length;
    type InboxWithDate = (typeof store.reportInbox)[number] & { createdAt?: string };
    store.reportInbox = trimByDate(
      store.reportInbox.map((i): InboxWithDate => ({ ...i, createdAt: (i as InboxWithDate & { sentAt?: string }).sentAt })),
      RETENTION_CAPS.reportInbox,
    );
    stats.reportInboxRemoved = before - store.reportInbox.length;
  }

  if (store.agentTasks && store.agentTasks.length > RETENTION_CAPS.agentTasks) {
    const before = store.agentTasks.length;
    store.agentTasks = trimByDate(store.agentTasks, RETENTION_CAPS.agentTasks);
    stats.agentTasksRemoved = before - store.agentTasks.length;
  }

  if (store.activityLog && store.activityLog.length > RETENTION_CAPS.activityLog) {
    const before = store.activityLog.length;
    store.activityLog = trimByDate(store.activityLog, RETENTION_CAPS.activityLog);
    stats.activityLogRemoved = before - store.activityLog.length;
  }

  // Trim events arrays per AgentRun
  if (store.agentRuns) {
    for (const run of store.agentRuns) {
      if (run.events && run.events.length > RETENTION_CAPS.agentRunsPerRun) {
        const before = run.events.length;
        run.events = run.events.slice(-RETENTION_CAPS.agentRunsPerRun);
        stats.eventsRemoved += before - run.events.length;
      }
    }
  }

  return stats;
}
