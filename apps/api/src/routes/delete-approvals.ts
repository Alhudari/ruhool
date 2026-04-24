/**
 * Delete approvals — destructive vault operations require user consent.
 * User can grant approval for a time window (default 60 minutes) so they're
 * not interrupted during heavy work.
 *
 * Usage from any destructive route:
 *   const ok = await checkDeleteApproval(store);
 *   if (!ok) return c.json({ requiresApproval: true }, 403);
 */
import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';

interface Deps {
  getStore: () => StoreData;
  saveStore: () => void;
}

export interface DeleteApproval {
  enabled: boolean;        // currently active?
  expiresAt: string | null; // ISO timestamp; null if disabled
  scope: 'all-deletes' | 'phd-only' | 'one-time';
  grantedAt: string;
}

// Module-level helper: check if delete is currently approved.
export function isDeleteApproved(store: StoreData): boolean {
  const a = (store as unknown as { deleteApproval?: DeleteApproval }).deleteApproval;
  if (!a || !a.enabled || !a.expiresAt) return false;
  return new Date(a.expiresAt).getTime() > Date.now();
}

export function consumeOneTimeApproval(store: StoreData): void {
  const a = (store as unknown as { deleteApproval?: DeleteApproval }).deleteApproval;
  if (a?.scope === 'one-time') {
    a.enabled = false;
    a.expiresAt = null;
  }
}

export function registerDeleteApprovalRoutes(app: Hono, { getStore, saveStore }: Deps): void {

  app.get('/api/vault/delete-approval', (c) => {
    const store = getStore();
    const a = (store as unknown as { deleteApproval?: DeleteApproval }).deleteApproval;
    if (!a) return c.json({ enabled: false, expiresAt: null, scope: null });
    // Auto-expire stale approval
    const stillValid = a.expiresAt && new Date(a.expiresAt).getTime() > Date.now();
    return c.json({
      enabled: a.enabled && !!stillValid,
      expiresAt: stillValid ? a.expiresAt : null,
      scope: a.scope,
      grantedAt: a.grantedAt,
      remainingMinutes: stillValid ? Math.round((new Date(a.expiresAt!).getTime() - Date.now()) / 60_000) : 0,
    });
  });

  // Grant approval for X minutes (default 60). Pass minutes:0 + scope:'one-time' for single-use.
  app.post('/api/vault/delete-approval', async (c) => {
    const body = await c.req.json<{ minutes?: number; scope?: 'all-deletes' | 'phd-only' | 'one-time' }>();
    const minutes = body.minutes ?? 60;
    const scope = body.scope ?? 'all-deletes';
    const now = new Date();
    const expires = scope === 'one-time' ? null : new Date(now.getTime() + minutes * 60_000);
    const approval: DeleteApproval = {
      enabled: true,
      expiresAt: expires ? expires.toISOString() : new Date(now.getTime() + 5 * 60_000).toISOString(),
      scope,
      grantedAt: now.toISOString(),
    };
    (getStore() as unknown as { deleteApproval: DeleteApproval }).deleteApproval = approval;
    saveStore();
    return c.json(approval);
  });

  // Revoke immediately
  app.delete('/api/vault/delete-approval', (c) => {
    const store = getStore();
    delete (store as unknown as { deleteApproval?: DeleteApproval }).deleteApproval;
    saveStore();
    return c.json({ ok: true });
  });
}
