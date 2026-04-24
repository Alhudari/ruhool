import type { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import type { StoreData, TaskItem } from '../store/types.js';
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchUserEmail,
  listTaskLists,
  listTasks,
  createTask as gCreate,
  patchTask as gPatch,
  type GoogleOAuthConfig,
} from '../services/google-tasks.js';
import { auditLog } from '../services/audit-log.js';
import { runGoogleTasksSyncNow } from '../services/google-tasks-trigger.js';

export interface GoogleTasksRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  logger?: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void };
}

interface GoogleTasksConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  connected?: boolean;
  accountEmail?: string;
  listId?: string;
  listTitle?: string;
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  lastSyncAt?: string | null;
  lastError?: string | null;
  syncEnabled?: boolean;
  oauthState?: string;
}

const configUpdateSchema = z.object({
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().url().optional(),
  listId: z.string().optional(),
  syncEnabled: z.boolean().optional(),
});

function getCfg(store: StoreData): GoogleTasksConfig {
  const s = store as unknown as { googleTasks?: GoogleTasksConfig };
  if (!s.googleTasks) s.googleTasks = {};
  return s.googleTasks;
}

function maskKey(v: string | undefined): string {
  if (!v) return '';
  return `••••${v.slice(-4)}`;
}

async function ensureAccessToken(cfg: GoogleTasksConfig): Promise<string> {
  if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) {
    throw new Error('Google Tasks not connected');
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

export function registerGoogleTasksRoutes(app: Hono, deps: GoogleTasksRoutesDeps): void {
  const { getStore, saveStore } = deps;

  // Public config view — never leaks the secret or the refresh token.
  app.get('/api/google-tasks/config', (c) => {
    const cfg = getCfg(getStore());
    return c.json({
      hasClientId: !!cfg.clientId,
      hasClientSecret: !!cfg.clientSecret,
      clientIdMasked: maskKey(cfg.clientId),
      redirectUri: cfg.redirectUri ?? '',
      connected: !!cfg.refreshToken,
      accountEmail: cfg.accountEmail ?? null,
      listId: cfg.listId ?? null,
      listTitle: cfg.listTitle ?? null,
      syncEnabled: !!cfg.syncEnabled,
      lastSyncAt: cfg.lastSyncAt ?? null,
      lastError: cfg.lastError ?? null,
    });
  });

  // Save OAuth client config (user pastes their Cloud Console values).
  app.put('/api/google-tasks/config', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = configUpdateSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const cfg = getCfg(getStore());
    if (parsed.data.clientId !== undefined) cfg.clientId = parsed.data.clientId.trim() || undefined;
    if (parsed.data.clientSecret !== undefined) cfg.clientSecret = parsed.data.clientSecret.trim() || undefined;
    if (parsed.data.redirectUri !== undefined) cfg.redirectUri = parsed.data.redirectUri.trim() || undefined;
    if (parsed.data.listId !== undefined) cfg.listId = parsed.data.listId || undefined;
    if (parsed.data.syncEnabled !== undefined) cfg.syncEnabled = parsed.data.syncEnabled;
    saveStore();
    auditLog({
      action: 'google-tasks.config-changed',
      source: 'platform:user',
      meta: {
        hasClient: !!cfg.clientId,
        hasSecret: !!cfg.clientSecret,
        keyEnding: cfg.clientId?.slice(-4),
        syncEnabled: cfg.syncEnabled,
      },
    });
    return c.json({ ok: true });
  });

  // Start OAuth — returns the URL the client should navigate to.
  app.post('/api/google-tasks/oauth/start', (c) => {
    const cfg = getCfg(getStore());
    if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
      return c.json({ error: 'OAuth client not configured — set clientId/secret/redirectUri first' }, 400);
    }
    const state = crypto.randomBytes(16).toString('hex');
    cfg.oauthState = state;
    saveStore();
    const url = buildAuthUrl(
      { clientId: cfg.clientId, clientSecret: cfg.clientSecret, redirectUri: cfg.redirectUri },
      state,
    );
    return c.json({ url });
  });

  // OAuth callback — Google redirects here with ?code&state.
  app.get('/api/google-tasks/oauth/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const cfg = getCfg(getStore());
    if (!code || !state) return c.text('missing code/state', 400);
    if (state !== cfg.oauthState) return c.text('state mismatch — retry', 400);
    if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) return c.text('OAuth not configured', 400);
    try {
      const tokens = await exchangeCodeForTokens(
        { clientId: cfg.clientId, clientSecret: cfg.clientSecret, redirectUri: cfg.redirectUri },
        code,
      );
      cfg.refreshToken = tokens.refreshToken;
      cfg.accessToken = tokens.accessToken;
      cfg.accessTokenExpiresAt = tokens.expiresAt;
      cfg.oauthState = undefined;
      try { cfg.accountEmail = await fetchUserEmail(tokens.accessToken); } catch { /* best-effort */ }
      saveStore();
      auditLog({
        action: 'google-tasks.connected',
        source: 'platform:user',
        meta: { email: cfg.accountEmail ?? 'unknown' },
      });
      // Redirect back to the web UI settings page (runs on :3000, not the
      // API origin) so the user sees the connection confirmation.
      const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:3000';
      return c.redirect(`${webOrigin}/settings?gt=connected`);
    } catch (err) {
      cfg.lastError = err instanceof Error ? err.message : String(err);
      saveStore();
      return c.text(`OAuth exchange failed: ${cfg.lastError}`, 500);
    }
  });

  app.post('/api/google-tasks/disconnect', (c) => {
    const cfg = getCfg(getStore());
    cfg.refreshToken = undefined;
    cfg.accessToken = undefined;
    cfg.accessTokenExpiresAt = undefined;
    cfg.accountEmail = undefined;
    cfg.listId = undefined;
    cfg.listTitle = undefined;
    cfg.syncEnabled = false;
    cfg.lastSyncAt = null;
    cfg.lastError = null;
    saveStore();
    auditLog({ action: 'google-tasks.disconnected', source: 'platform:user' });
    return c.json({ ok: true });
  });

  app.get('/api/google-tasks/lists', async (c) => {
    try {
      const cfg = getCfg(getStore());
      const token = await ensureAccessToken(cfg);
      saveStore();
      const lists = await listTaskLists(token);
      return c.json({ lists });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // Fast tick — lightweight push+pull, invoked by the frontend on a
  // 30-second loop while the tab is visible, plus on visibilitychange
  // and window focus. Uses the trigger so concurrent ticks collapse
  // and in-flight work isn't duplicated.
  app.post('/api/google-tasks/sync/tick', async (c) => {
    const cfg = getCfg(getStore());
    if (!cfg.syncEnabled || !cfg.refreshToken || !cfg.listId) {
      return c.json({ skipped: true, reason: 'not connected or disabled' });
    }
    try {
      await runGoogleTasksSyncNow();
      return c.json({ ok: true, lastSyncAt: cfg.lastSyncAt, lastError: cfg.lastError ?? null });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // Sync now — push every Ruhool task into the chosen Google list.
  // This is intentionally Push-only in the first cut; pull is a separate
  // endpoint that falls back to last-write-wins.
  app.post('/api/google-tasks/sync/push', async (c) => {
    const store = getStore();
    const cfg = getCfg(store);
    if (!cfg.syncEnabled) return c.json({ error: 'sync disabled' }, 400);
    if (!cfg.listId) return c.json({ error: 'no target list selected' }, 400);
    try {
      const token = await ensureAccessToken(cfg);
      saveStore();
      const tasks = (store.tasks ?? []).filter((t) => !t.isHabit);
      let created = 0;
      let updated = 0;
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
        } catch (err) {
          cfg.lastError = err instanceof Error ? err.message : String(err);
        }
      }
      cfg.lastSyncAt = new Date().toISOString();
      cfg.lastError = cfg.lastError;
      saveStore();
      auditLog({
        action: 'google-tasks.push.ok',
        source: 'worker:google-tasks',
        meta: { created, updated, listId: cfg.listId },
      });
      return c.json({ ok: true, created, updated, lastSyncAt: cfg.lastSyncAt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      cfg.lastError = msg;
      saveStore();
      return c.json({ error: msg }, 500);
    }
  });

  // Pull — bring Google Tasks changes into Ruhool.
  app.post('/api/google-tasks/sync/pull', async (c) => {
    const store = getStore();
    const cfg = getCfg(store);
    if (!cfg.listId) return c.json({ error: 'no list selected' }, 400);
    try {
      const token = await ensureAccessToken(cfg);
      saveStore();
      const since = cfg.lastSyncAt ?? undefined;
      const remote = await listTasks(token, cfg.listId, { updatedMin: since, showCompleted: true });
      const byExternalId = new Map<string, TaskItem>();
      for (const t of store.tasks ?? []) {
        if (t.externalId) byExternalId.set(t.externalId, t);
      }
      let pulled = 0;
      let conflicts = 0;
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
        // Conflict detection: local changed after remote's last known update.
        const localUpdatedMs = new Date(local.updatedAt).getTime();
        const remoteUpdatedMs = new Date(gt.updated).getTime();
        const lastKnownMs = local.externalUpdatedAt ? new Date(local.externalUpdatedAt).getTime() : 0;
        if (localUpdatedMs > lastKnownMs && remoteUpdatedMs > lastKnownMs) {
          conflicts += 1;
          local.metadata = { ...(local.metadata || {}), googleTasksConflict: true };
          continue;
        }
        // Accept remote.
        local.title = gt.title;
        local.notes = gt.notes ?? '';
        local.completed = gt.status === 'completed';
        local.completedAt = gt.completed ?? null;
        local.dueDate = gt.due ? gt.due.slice(0, 10) : null;
        local.updatedAt = now;
        local.externalUpdatedAt = gt.updated;
      }
      cfg.lastSyncAt = now;
      saveStore();
      auditLog({
        action: 'google-tasks.pull.ok',
        source: 'worker:google-tasks',
        meta: { pulled, conflicts, listId: cfg.listId },
      });
      return c.json({ ok: true, pulled, conflicts, lastSyncAt: cfg.lastSyncAt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      cfg.lastError = msg;
      saveStore();
      return c.json({ error: msg }, 500);
    }
  });
}
