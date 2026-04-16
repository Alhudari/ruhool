/**
 * Activity logging service. Extracted from index.ts (REL-01 stage 2d).
 *
 * Uses `state/activity-channel` for fan-out to SSE subscribers. Takes
 * `store` via factory deps so no hidden module-level singletons are needed
 * here. (The store itself is a singleton inside `store/index.ts`.)
 */
import crypto from 'node:crypto';
import type { ActivityRecord, StoreData } from '../store/types.js';
import { broadcastActivity } from '../state/activity-channel.js';

export const MAX_ACTIVITY_RECORDS = 500;

export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  manager: 'الراعي', research: 'عبدان', 'reading-helper': 'شواشة',
  'writing-critic': 'الصفرا', comparator: 'رمّانة', architect: 'المصمم',
  'content-creator': 'الدبسا',
  creative: '\u0627\u0644\u0643\u0631\u064a\u064a\u062a\u0641',
  'tasks-agent': '\u0645\u0647\u0627\u0645',
  analyst: 'المحلل',
  munazzim: 'المنظّم',
  mushakhkhis: 'المشخّص',
  fatin: 'الفطين',
  playmaker: 'المُمرر',
  clippy: 'Clippy',
};

export interface LogActivityDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

export interface LogActivityOpts {
  agentId?: string;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}

export function createLogActivity(deps: LogActivityDeps) {
  return function logActivity(
    type: ActivityRecord['type'],
    action: string,
    details: string,
    opts?: LogActivityOpts
  ): ActivityRecord {
    const store = deps.getStore();
    if (!store.activityLog) store.activityLog = [];
    const record: ActivityRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      action,
      details,
      agentId: opts?.agentId,
      agentName: opts?.agentId ? (AGENT_DISPLAY_NAMES[opts.agentId] || opts.agentId) : undefined,
      metadata: opts?.metadata,
      requestId: opts?.requestId ?? null,
    };
    store.activityLog.push(record);
    if (store.activityLog.length > MAX_ACTIVITY_RECORDS) {
      store.activityLog = store.activityLog.slice(-MAX_ACTIVITY_RECORDS);
    }
    broadcastActivity(record);
    return record;
  };
}
