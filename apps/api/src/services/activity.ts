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

// Canonical Arabic display names — post trait-based rename (2026-04-23).
// Single source of truth; UI/prompts/logs all import from here. Old
// camel-herd names (عبدان/شواشة/رمّانة/الصفرا/الدبسا/الكرييتف/السياق/رمّان)
// are retired — any remaining references in the codebase are bugs.
export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  manager: 'الراعي',
  doctor: 'الدكتور',
  research: 'الباحث',
  'reading-helper': 'المُلخِّص',
  'writing-critic': 'الناقد',
  comparator: 'المُقارِن',
  architect: 'المصمم',
  'content-creator': 'السارد',
  creative: 'المبدع',
  'tasks-agent': 'مهام',
  analyst: 'المحلل',
  munazzim: 'المنظّم',
  mushakhkhis: 'المشخّص',
  fatin: 'الفطين',
  playmaker: 'المُمرر',
  clippy: 'Clippy',
  'research-companion': 'الخوي',
  mudawwin: 'المُدوِّن',
  sayyaq: 'الكاتب',
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
