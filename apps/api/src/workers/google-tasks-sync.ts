/**
 * Google Tasks periodic sync worker.
 *
 * Every 15 minutes (configurable): if the user enabled sync + connected
 * a Google account + picked a target list, perform push then pull.
 *
 * The worker is cheap to run — zero work when sync is disabled. Errors
 * are swallowed and recorded on `store.googleTasks.lastError`; the next
 * tick retries.
 */
import type { StoreData, TaskItem } from '../store/types.js';
import {
  refreshAccessToken,
  listTasks,
  createTask as gCreate,
  patchTask as gPatch,
  type GoogleOAuthConfig,
  type GoogleTask,
} from '../services/google-tasks.js';
import crypto from 'node:crypto';

export interface GoogleSyncDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  logger: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void };
  auditLog?: (entry: { action: string; source: string; meta?: Record<string, unknown> }) => void;
}

interface GoogleTasksConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  accountEmail?: string;
  listId?: string;
  syncEnabled?: boolean;
  lastSyncAt?: string | null;
  lastError?: string | null;
}

async function ensureAccessToken(cfg: GoogleTasksConfig): Promise<string> {
  if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) {
    throw new Error('not connected');
  }
  if (cfg.accessToken && cfg.accessTokenExpiresAt && cfg.accessTokenExpiresAt > Date.now()) {
    return cfg.accessToken;
  }
  const oauthCfg: GoogleOAuthConfig = {
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUri: cfg.redirectUri ?? '',
  };
  const refreshed = await refreshAccessToken(oauthCfg, cfg.refreshToken);
  cfg.accessToken = refreshed.accessToken;
  cfg.accessTokenExpiresAt = refreshed.expiresAt;
  return refreshed.accessToken;
}

export async function runSyncTick(deps: GoogleSyncDeps): Promise<void> {
  const store = deps.getStore();
  const cfg = (store as unknown as { googleTasks?: GoogleTasksConfig }).googleTasks;
  if (!cfg || !cfg.syncEnabled || !cfg.listId || !cfg.refreshToken) return;

  try {
    const token = await ensureAccessToken(cfg);
    // Push: iterate non-habit tasks, create/patch based on externalId.
    let created = 0;
    let updated = 0;
    const tasks = (store.tasks ?? []).filter((t) => !t.isHabit);
    for (const t of tasks) {
      try {
        const payload = {
          title: t.title,
          notes: t.notes || undefined,
          due: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
          status: t.completed ? 'completed' as const : 'needsAction' as const,
        };
        if (t.externalId && t.externalProvider === 'google-tasks') {
          await gPatch(token, cfg.listId, t.externalId, payload);
          t.externalUpdatedAt = new Date().toISOString();
          updated += 1;
        } else {
          const remote = await gCreate(token, cfg.listId, payload);
          t.externalId = remote.id;
          t.externalProvider = 'google-tasks';
          t.externalUpdatedAt = remote.updated;
          created += 1;
        }
      } catch { /* keep going */ }
    }

    // Pull: remote → local since last sync.
    const since = cfg.lastSyncAt ?? undefined;
    const remote: GoogleTask[] = await listTasks(token, cfg.listId, { updatedMin: since, showCompleted: true });
    const byExternalId = new Map<string, TaskItem>();
    for (const t of store.tasks ?? []) {
      if (t.externalId) byExternalId.set(t.externalId, t);
    }
    let pulled = 0;
    const now = new Date().toISOString();
    for (const gt of remote) {
      const local = byExternalId.get(gt.id);
      if (!local) {
        const row: TaskItem = {
          id: crypto.randomUUID(),
          title: gt.title,
          notes: gt.notes ?? '',
          completed: gt.status === 'completed',
          priority: 'none',
          dueDate: gt.due ? gt.due.slice(0, 10) : null,
          dueTime: null,
          list: 'Google Tasks',
          tags: [],
          color: '',
          pinned: false,
          checklist: [],
          reminder: null,
          createdAt: now,
          updatedAt: now,
          completedAt: gt.completed ?? null,
          workspaceId: 'life',
          externalId: gt.id,
          externalProvider: 'google-tasks',
          externalUpdatedAt: gt.updated,
        };
        if (!store.tasks) store.tasks = [];
        store.tasks.push(row);
        pulled += 1;
        continue;
      }
      // Last-write-wins merge (conflict handling is in the explicit pull endpoint).
      local.title = gt.title;
      local.notes = gt.notes ?? '';
      local.completed = gt.status === 'completed';
      local.completedAt = gt.completed ?? null;
      local.dueDate = gt.due ? gt.due.slice(0, 10) : null;
      local.updatedAt = now;
      local.externalUpdatedAt = gt.updated;
    }

    cfg.lastSyncAt = now;
    cfg.lastError = null;
    deps.saveStore();
    deps.logger.info(`[google-tasks] tick ok — created=${created} updated=${updated} pulled=${pulled}`);
    deps.auditLog?.({
      action: 'google-tasks.tick.ok',
      source: 'worker:google-tasks',
      meta: { created, updated, pulled, listId: cfg.listId },
    });
  } catch (err) {
    cfg.lastError = err instanceof Error ? err.message : String(err);
    deps.saveStore();
    deps.logger.warn({ err }, '[google-tasks] tick failed');
  }
}

/**
 * Schedule periodic sync. Returns the NodeJS.Timeout handle so callers
 * can stop it. Default interval 5 min — this is the *backstop* for
 * times when the UI is closed. Active ticks come from
 * services/google-tasks-trigger.ts (debounced on every CRUD) and from
 * the frontend 30s foreground pull loop.
 */
export function startGoogleTasksSyncScheduler(
  deps: GoogleSyncDeps & { intervalMs?: number },
): NodeJS.Timeout {
  const interval = Math.max(deps.intervalMs ?? 5 * 60 * 1000, 60_000);
  // Delay first run to let boot settle.
  setTimeout(() => { void runSyncTick(deps); }, 90_000);
  return setInterval(() => { void runSyncTick(deps); }, interval);
}
