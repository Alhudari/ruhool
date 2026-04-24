/**
 * System reset — wipes per-area data so user can start fresh.
 *
 *   POST /api/system/reset
 *     Body: { scopes?: ('memory'|'conversations'|'tasks'|'inbox'|'tour-feedback'|'all')[] }
 *     Default: ['all']
 *     Behind delete approval. Does NOT touch Obsidian vault.
 */
import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';
import { isDeleteApproved, consumeOneTimeApproval } from './delete-approvals.js';
import { auditLog } from '../services/audit-log.js';

interface Deps {
  getStore: () => StoreData;
  saveStore: () => void;
}

export function registerSystemResetRoutes(app: Hono, { getStore, saveStore }: Deps): void {

  app.post('/api/system/reset', async (c) => {
    const body = await c.req.json<{ scopes?: string[]; force?: boolean }>().catch(() => ({ scopes: undefined, force: false }));
    const scopes = body.scopes ?? ['all'];
    const all = scopes.includes('all');

    const store = getStore();
    if (!body.force) {
      if (!isDeleteApproved(store)) {
        return c.json({ requiresApproval: true, hint: 'Grant delete approval first or pass force:true' }, 403);
      }
      consumeOneTimeApproval(store);
    }

    const cleared: Record<string, number> = {};
    const s = store as unknown as Record<string, unknown>;

    if (all || scopes.includes('memory')) {
      const before = ((s.companionMemory as unknown[]) ?? []).length;
      s.companionMemory = [];
      cleared.memory = before;
    }
    if (all || scopes.includes('conversations')) {
      const before = (store.conversations ?? []).length;
      const beforeMsgs = (store.messages ?? []).length;
      store.conversations = [];
      store.messages = [];
      cleared.conversations = before;
      cleared.messages = beforeMsgs;
    }
    if (all || scopes.includes('tasks')) {
      const before = (store.tasks ?? []).length;
      store.tasks = [];
      cleared.tasks = before;
    }
    if (all || scopes.includes('inbox')) {
      const before = ((s.inboxItems as unknown[]) ?? []).length;
      s.inboxItems = [];
      cleared.inbox = before;
    }
    if (all || scopes.includes('tour-feedback')) {
      const before = ((s.clippyTourFeedback as unknown[]) ?? []).length;
      s.clippyTourFeedback = [];
      cleared['tour-feedback'] = before;
    }
    if (all || scopes.includes('reading-sessions')) {
      const before = (store.readingSessions ?? []).length;
      store.readingSessions = [];
      cleared['reading-sessions'] = before;
    }
    if (all || scopes.includes('meeting-sessions')) {
      const before = ((s.meetingSessions as unknown[]) ?? []).length;
      s.meetingSessions = [];
      cleared['meeting-sessions'] = before;
    }
    if (all || scopes.includes('activity-log')) {
      const before = (store.activityLog ?? []).length;
      store.activityLog = [];
      cleared['activity-log'] = before;
    }

    saveStore();
    await auditLog({ action: 'system.reset', source: 'platform:user', meta: { scopes, cleared } });

    return c.json({ ok: true, cleared, scopes });
  });
}
