import type { Hono } from 'hono';
import type { StoreData, ActivityRecord, ApprovalRecord } from '../store/types.js';

export interface ApprovalsRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  logActivity: (
    type: ActivityRecord['type'],
    action: string,
    details: string,
    opts?: { agentId?: string; metadata?: Record<string, unknown>; requestId?: string | null }
  ) => ActivityRecord;
  executeApproval: (approval: ApprovalRecord) => { ok: boolean; error?: string };
}

/**
 * Approvals list / approve / reject routes.
 */
export function registerApprovalsRoutes(app: Hono, deps: ApprovalsRoutesDeps): void {
  const { getStore, saveStore, logActivity, executeApproval } = deps;

  app.get('/api/approvals', (c) => {
    const store = getStore();
    if (!store.approvals) store.approvals = [];
    const status = c.req.query('status');
    if (status) {
      return c.json(store.approvals.filter((a) => a.status === status));
    }
    return c.json(store.approvals);
  });

  app.get('/api/approvals/pending', (c) => {
    const store = getStore();
    if (!store.approvals) store.approvals = [];
    return c.json(store.approvals.filter((a) => a.status === 'pending'));
  });

  app.post('/api/approvals/:id/approve', async (c) => {
    const store = getStore();
    if (!store.approvals) store.approvals = [];
    const id = c.req.param('id');
    const approval = store.approvals.find((a) => a.id === id);
    if (!approval) return c.json({ error: 'Approval not found' }, 404);

    // F-009: atomic transition — claim the approval BEFORE executing.
    // Two concurrent approve requests now have a clear winner.
    if (approval.status !== 'pending') return c.json({ error: 'Already resolved' }, 400);
    // Use a sentinel state so concurrent reads see it's no longer claimable.
    (approval as unknown as { status: string }).status = 'approving';
    await saveStore();

    try {
      const result = executeApproval(approval);
      if (!result.ok) {
        // Roll back to pending so user can retry
        approval.status = 'pending';
        await saveStore();
        return c.json({ error: result.error }, 500);
      }

      approval.status = 'approved';
      approval.resolvedAt = new Date().toISOString();
      approval.resolvedBy = 'user';
      logActivity('approval', `Approval approved: ${approval.title.en}`, `Type: ${approval.type}`, { metadata: { approvalId: approval.id, type: approval.type } });
      await saveStore();
      return c.json(approval);
    } catch (err) {
      approval.status = 'pending';
      await saveStore();
      throw err;
    }
  });

  app.post('/api/approvals/:id/reject', async (c) => {
    const store = getStore();
    if (!store.approvals) store.approvals = [];
    const id = c.req.param('id');
    const body = await c.req.json<{ reason?: string }>().catch(() => ({}));
    const approval = store.approvals.find((a) => a.id === id);
    if (!approval) return c.json({ error: 'Approval not found' }, 404);
    if (approval.status !== 'pending') return c.json({ error: 'Already resolved' }, 400);

    approval.status = 'rejected';
    approval.resolvedAt = new Date().toISOString();
    approval.resolvedBy = 'user';
    approval.rejectReason = (body as { reason?: string }).reason || undefined;
    logActivity('approval', `Approval rejected: ${approval.title.en}`, `Reason: ${approval.rejectReason || 'none'}`, { metadata: { approvalId: approval.id, type: approval.type } });
    saveStore();
    return c.json(approval);
  });
}
