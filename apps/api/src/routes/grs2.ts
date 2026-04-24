/**
 * GRS2 — Monthly PhD supervision report system (University of Birmingham).
 *
 * Progress stages:
 *   not_started (0%) → submitted (25%) → supervisor_approved (75%)
 *   → student_confirmed (75%, confirmation step) → university_approved (100%)
 */
import crypto from 'node:crypto';
import type { Hono } from 'hono';
import type { StoreData, Grs2Record } from '../store/types.js';

export interface Grs2RoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

function getProgressFromStatus(
  status: Grs2Record['status'],
): number {
  switch (status) {
    case 'not_started': return 0;
    case 'submitted': return 25;
    case 'supervisor_approved': return 75;
    case 'student_confirmed': return 75;
    case 'university_approved': return 100;
    default: return 0;
  }
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function daysUntilMonthEnd(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const diffMs = lastDay.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getRecords(store: StoreData): Grs2Record[] {
  if (!store.grs2Records) store.grs2Records = [];
  return store.grs2Records;
}

function findRecord(store: StoreData, month: string): Grs2Record | undefined {
  return getRecords(store).find((r) => r.month === month);
}

function createRecord(store: StoreData, month: string): Grs2Record {
  const rec: Grs2Record = {
    id: crypto.randomUUID(),
    month,
    status: 'not_started',
    progress: 0,
  };
  getRecords(store).push(rec);
  return rec;
}

export function registerGrs2Routes(app: Hono, deps: Grs2RoutesDeps): void {
  const { getStore, saveStore } = deps;

  // ── List all records, sorted by month desc ──────────────────────────
  app.get('/api/grs2', (c) => {
    const store = getStore();
    const records = [...getRecords(store)].sort((a, b) =>
      b.month.localeCompare(a.month),
    );
    return c.json(records);
  });

  // ── Reminders ───────────────────────────────────────────────────────
  app.get('/api/grs2/reminders', (c) => {
    const store = getStore();
    const month = currentMonth();
    const rec = findRecord(store, month);
    const days = daysUntilMonthEnd();

    const needsGrs2 = !rec || rec.status === 'not_started';
    const urgentFollowUp =
      days <= 7 &&
      !!rec &&
      rec.status !== 'supervisor_approved' &&
      rec.status !== 'student_confirmed' &&
      rec.status !== 'university_approved';

    return c.json({
      needsGrs2,
      urgentFollowUp,
      currentMonth: month,
      daysUntilMonthEnd: days,
    });
  });

  // ── Get or create record for current month ──────────────────────────
  app.get('/api/grs2/current', (c) => {
    const store = getStore();
    const month = currentMonth();
    let rec = findRecord(store, month);
    if (!rec) {
      rec = createRecord(store, month);
      saveStore();
    }
    return c.json(rec);
  });

  // ── Create record for specific month ───────────────────────────────
  app.post('/api/grs2', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ month: string; content?: string }>().catch(() => ({}) as never);
    if (!body.month) return c.json({ error: 'month required (YYYY-MM)' }, 400);
    if (findRecord(store, body.month)) {
      return c.json({ error: `Record for ${body.month} already exists` }, 409);
    }
    const rec = createRecord(store, body.month);
    if (body.content) rec.content = body.content;
    saveStore();
    return c.json(rec, 201);
  });

  // ── Update record ──────────────────────────────────────────────────
  app.patch('/api/grs2/:month', async (c) => {
    const store = getStore();
    const rec = findRecord(store, c.req.param('month'));
    if (!rec) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<Partial<Pick<Grs2Record, 'content' | 'supervisorResponse' | 'status'>>>().catch(() => ({}) as never);
    if (body.content !== undefined) rec.content = body.content;
    if (body.supervisorResponse !== undefined) rec.supervisorResponse = body.supervisorResponse;
    if (body.status !== undefined) {
      rec.status = body.status;
      rec.progress = getProgressFromStatus(body.status);
    }
    saveStore();
    return c.json(rec);
  });

  // ── Submit ─────────────────────────────────────────────────────────
  app.post('/api/grs2/:month/submit', async (c) => {
    const store = getStore();
    const rec = findRecord(store, c.req.param('month'));
    if (!rec) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<{ content?: string }>().catch(() => ({}) as never);
    if (body.content !== undefined) rec.content = body.content;
    rec.status = 'submitted';
    rec.progress = getProgressFromStatus('submitted');
    rec.submittedAt = new Date().toISOString();
    saveStore();
    return c.json(rec);
  });

  // ── Supervisor approve ─────────────────────────────────────────────
  app.post('/api/grs2/:month/supervisor-approve', async (c) => {
    const store = getStore();
    const rec = findRecord(store, c.req.param('month'));
    if (!rec) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<{ supervisorResponse?: string }>().catch(() => ({}) as never);
    if (body.supervisorResponse !== undefined) rec.supervisorResponse = body.supervisorResponse;
    rec.status = 'supervisor_approved';
    rec.progress = getProgressFromStatus('supervisor_approved');
    rec.supervisorApprovedAt = new Date().toISOString();
    saveStore();
    return c.json(rec);
  });

  // ── Student confirm ────────────────────────────────────────────────
  app.post('/api/grs2/:month/student-confirm', (c) => {
    const store = getStore();
    const rec = findRecord(store, c.req.param('month'));
    if (!rec) return c.json({ error: 'Not found' }, 404);
    rec.status = 'student_confirmed';
    rec.progress = getProgressFromStatus('student_confirmed'); // stays 75
    rec.studentConfirmedAt = new Date().toISOString();
    saveStore();
    return c.json(rec);
  });

  // ── University approve ─────────────────────────────────────────────
  app.post('/api/grs2/:month/university-approve', (c) => {
    const store = getStore();
    const rec = findRecord(store, c.req.param('month'));
    if (!rec) return c.json({ error: 'Not found' }, 404);
    rec.status = 'university_approved';
    rec.progress = getProgressFromStatus('university_approved');
    rec.universityApprovedAt = new Date().toISOString();
    saveStore();
    return c.json(rec);
  });
}
