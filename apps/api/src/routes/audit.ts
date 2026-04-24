/**
 * Audit log read endpoint — exposes data/audit-log.jsonl entries for the
 * /audit-log UI and Mudawwin's "since last meeting" context.
 *
 *   GET /api/audit-log                  — recent entries (default 200)
 *   GET /api/audit-log?action=note.*    — filter by action prefix
 *   GET /api/audit-log?since=2026-04-01 — entries since that ISO date
 */
import type { Hono } from 'hono';
import { readAuditLog } from '../services/audit-log.js';

export function registerAuditLogRoutes(app: Hono): void {
  app.get('/api/audit-log', async (c) => {
    const limit = Number(c.req.query('limit') ?? 200);
    const action = c.req.query('action');
    const since = c.req.query('since');
    const entries = await readAuditLog({
      limit: Number.isFinite(limit) ? limit : 200,
      action,
      sinceIso: since,
    });
    return c.json({ entries, total: entries.length });
  });
}
