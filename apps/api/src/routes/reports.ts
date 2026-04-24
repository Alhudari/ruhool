/**
 * Reports CRUD + send-now + preview routes.
 */
import type { Hono } from 'hono';
import crypto from 'node:crypto';
import { z } from 'zod';
import type { ReportDefinition, ReportSchedule } from '../store/types.js';
import { computeNextRunAt } from '../services/reports/schedule.js';
import { sendReport, type SendReportDeps } from '../services/reports/send.js';
import { sendViaResend } from '../services/reports/mailer.js';
import { BUILTIN_SYSTEM_PROMPTS } from '../state/builtin-prompts.js';
import { rateLimit } from '../middleware/rate-limit.js';

// R14-#14 — bucket size 6, refill 1/10s → average ~6 burst + 6/min
// sustained. Protects the Resend free-tier quota (3000/month) from
// runaway clients while leaving plenty of room for legitimate manual
// sends + scheduler ticks.
const reportsSendLimit = rateLimit({ capacity: 6, refillPerSec: 0.1 });

export interface ReportsRoutesDeps extends SendReportDeps {}

/** Known agent IDs — a signedBy not in this set is flagged as orphan. */
function isKnownAgent(agentId: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTIN_SYSTEM_PROMPTS, agentId)
    && typeof BUILTIN_SYSTEM_PROMPTS[agentId] === 'string';
}

const scheduleSchema: z.ZodType<ReportSchedule> = z.union([
  z.object({ type: z.literal('daily'),   hour: z.number().min(0).max(23), minute: z.number().min(0).max(59), timezone: z.string() }),
  z.object({ type: z.literal('weekly'),  dayOfWeek: z.number().min(0).max(6), hour: z.number().min(0).max(23), minute: z.number().min(0).max(59), timezone: z.string() }),
  z.object({ type: z.literal('monthly'), dayOfMonth: z.number().min(1).max(31), hour: z.number().min(0).max(23), minute: z.number().min(0).max(59), timezone: z.string() }),
  z.object({ type: z.literal('once'),    at: z.string() }),
  z.object({ type: z.literal('manual') }),
]);

const createSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  signedBy: z.string().min(1),
  schedule: scheduleSchema,
  recipients: z.array(z.string().email()).default([]),
  language: z.enum(['ar', 'en']).optional(),
  visibility: z.enum(['owner', 'shared']).optional(),
  sharedWith: z.array(z.string().email()).optional(),
  enabled: z.boolean().default(true),
  includeContext: z.object({
    tasks: z.boolean().optional(),
    dispatches: z.boolean().optional(),
    changelog: z.boolean().optional(),
    agentQuotes: z.boolean().optional(),
    zotero: z.boolean().optional(),
    vault: z.boolean().optional(),
    meetings: z.boolean().optional(),
    budget: z.boolean().optional(),
  }).optional(),
  sections: z.array(z.object({
    signedBy: z.string().min(1),
    title: z.string().min(1),
    prompt: z.string().min(1),
  })).optional(),
  feedback: z.array(z.object({
    id: z.string(),
    text: z.string().min(1),
    source: z.enum(['chat', 'settings', 'auto']),
    addedBy: z.string().optional(),
    createdAt: z.string(),
    active: z.boolean(),
  })).optional(),
});

const updateSchema = createSchema.partial();

const resendConfigSchema = z.object({
  apiKey: z.string().optional(),
  fromEmail: z.string().optional(),
  defaultRecipient: z.string().email().optional(),
});

function maskKey(k?: string): string | null {
  if (!k) return null;
  return `••••${k.slice(-4)}`;
}

export function registerReportsRoutes(app: Hono, deps: ReportsRoutesDeps): void {
  const { getStore, saveStore } = deps;

  // ─── Resend config ───
  app.get('/api/reports/resend-config', (c) => {
    const store = getStore();
    return c.json({
      hasKey: !!store.resend?.apiKey,
      keyMasked: maskKey(store.resend?.apiKey),
      fromEmail: store.resend?.fromEmail ?? '',
      defaultRecipient: store.resend?.defaultRecipient ?? '',
    });
  });

  app.put('/api/reports/resend-config', async (c) => {
    const store = getStore();
    const raw = await c.req.json().catch(() => null);
    const parsed = resendConfigSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    if (!store.resend) store.resend = {};
    const before = { key: !!store.resend.apiKey, from: !!store.resend.fromEmail, rcp: !!store.resend.defaultRecipient };
    if (parsed.data.apiKey !== undefined) store.resend.apiKey = parsed.data.apiKey.trim() || undefined;
    if (parsed.data.fromEmail !== undefined) store.resend.fromEmail = parsed.data.fromEmail.trim() || undefined;
    if (parsed.data.defaultRecipient !== undefined) store.resend.defaultRecipient = parsed.data.defaultRecipient.trim() || undefined;

    // Auto-seed a default daily CEO report the first time the user
    // completes Resend configuration AND has zero reports. Kept
    // disabled so they still explicitly opt-in by toggling it on.
    const nowComplete = !!store.resend.apiKey && !!store.resend.fromEmail && !!store.resend.defaultRecipient;
    const wasComplete = before.key && before.from && before.rcp;
    if (nowComplete && !wasComplete && (store.reports ?? []).length === 0) {
      if (!store.reports) store.reports = [];
      const now = new Date().toISOString();
      const defaultSchedule = { type: 'daily' as const, hour: 22, minute: 0, timezone: 'Asia/Kuwait' };
      store.reports.push({
        id: crypto.randomUUID(),
        name: 'التقرير اليومي التنفيذي',
        prompt: 'اكتب تقريراً يومياً تنفيذياً مختصراً لعبدالله عن نشاط المنصة خلال الـ 24 ساعة الماضية. ركّز على: الإنجاز، ما يستحق الانتباه، نبضة الوكلاء، وتوصية واحدة لبكرة. اختم بتوقيع "— المعماري ‖ مهندس المنصة".',
        signedBy: 'architect',
        schedule: defaultSchedule,
        recipients: [],
        enabled: false,  // disabled by default — user flips it on
        includeContext: { tasks: true, dispatches: true, changelog: true, agentQuotes: true },
        nextRunAt: computeNextRunAt(defaultSchedule, new Date()),
        createdAt: now,
        updatedAt: now,
      });
    }

    saveStore();
    return c.json({ ok: true, autoSeeded: nowComplete && !wasComplete && (store.reports ?? []).length === 1 });
  });

  // Test the Resend configuration by sending a trivial email to the
  // default recipient. Runs entirely server-side so the user sees
  // delivery failures (bad key, unverified domain, typo'd address)
  // BEFORE scheduling the first real report.
  app.post('/api/reports/resend-config/test', reportsSendLimit, async (c) => {
    const store = getStore();
    const cfg = store.resend ?? {};
    if (!cfg.apiKey) return c.json({ ok: false, error: 'لم يُحفظ Resend API key بعد' }, 400);
    if (!cfg.fromEmail) return c.json({ ok: false, error: 'لم يُحدَّد عنوان المُرسِل (fromEmail)' }, 400);
    const to = cfg.defaultRecipient;
    if (!to) return c.json({ ok: false, error: 'لم يُحدَّد المستلم الافتراضي' }, 400);
    try {
      const html = `<!doctype html><html dir="rtl" lang="ar"><body style="font-family:-apple-system,Segoe UI,Tahoma,Arial,sans-serif;background:#f5f3ee;padding:32px;color:#2a2a2a">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:32px;border-radius:14px;box-shadow:0 2px 18px rgba(0,0,0,.06);">
    <h1 style="margin:0 0 12px;font-size:20px;">اختبار Resend ناجح ✅</h1>
    <p style="line-height:1.8;">أهلاً عبدالله،</p>
    <p style="line-height:1.8;">هذا إيميل تجربة أرسلته لك منصة رُحول للتأكد أن إعداد Resend يعمل. لو وصلك هذا فأنت جاهز لجدولة التقارير الحقيقية.</p>
    <p style="color:#999;font-size:12px;margin-top:28px;">أُرسِل من ${cfg.fromEmail} · ${new Date().toISOString()}</p>
  </div></body></html>`;
      const result = await sendViaResend({
        apiKey: cfg.apiKey, from: cfg.fromEmail, to: [to],
        subject: 'Ruhool · اختبار إعداد التقارير',
        html,
      });
      return c.json({ ok: true, messageId: result.id, sentTo: to });
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // Signer health check — flags reports whose `signedBy` references an
  // agent the platform no longer knows about. The UI uses this to warn
  // the user BEFORE a scheduled run silently fails at compose time.
  app.get('/api/reports/signer-health', (c) => {
    const store = getStore();
    const reports = store.reports ?? [];
    const orphans: Array<{ id: string; name: string; signedBy: string }> = [];
    const orphanSections: Array<{ reportId: string; sectionIdx: number; signedBy: string }> = [];
    for (const r of reports) {
      if (!isKnownAgent(r.signedBy)) orphans.push({ id: r.id, name: r.name, signedBy: r.signedBy });
      (r.sections ?? []).forEach((s, i) => {
        if (!isKnownAgent(s.signedBy)) orphanSections.push({ reportId: r.id, sectionIdx: i, signedBy: s.signedBy });
      });
    }
    return c.json({ orphans, orphanSections });
  });

  // ─── Reports CRUD ───
  app.get('/api/reports', (c) => {
    const store = getStore();
    const all = (store.reports ?? []).slice()
      // R15-#25 — sort by `order` first, then `createdAt` as a
      // tiebreaker for legacy reports without an `order` field.
      .sort((a, b) => {
        const ao = a.order ?? 999_999;
        const bo = b.order ?? 999_999;
        if (ao !== bo) return ao - bo;
        return a.createdAt.localeCompare(b.createdAt);
      });
    // R15-#18 — advisory visibility filter.
    const viewer = c.req.header('x-ruhool-viewer') ?? null;
    if (!viewer) return c.json(all);
    const visible = all.filter((r) => {
      if (!r.visibility || r.visibility === 'owner') return false;
      return (r.sharedWith ?? []).includes(viewer);
    });
    return c.json(visible);
  });

  app.post('/api/reports', async (c) => {
    const store = getStore();
    if (!store.reports) store.reports = [];
    const raw = await c.req.json().catch(() => null);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    if (!isKnownAgent(parsed.data.signedBy)) {
      return c.json({ error: `unknown signer: ${parsed.data.signedBy}` }, 400);
    }
    const now = new Date().toISOString();
    const report: ReportDefinition = {
      id: crypto.randomUUID(),
      ...parsed.data,
      recipients: parsed.data.recipients ?? [],
      enabled: parsed.data.enabled ?? true,
      nextRunAt: computeNextRunAt(parsed.data.schedule, new Date()),
      createdAt: now,
      updatedAt: now,
    };
    store.reports.push(report);
    saveStore();
    return c.json(report, 201);
  });

  app.put('/api/reports/:id', async (c) => {
    const store = getStore();
    if (!store.reports) store.reports = [];
    const id = c.req.param('id');
    const report = store.reports.find((r) => r.id === id);
    if (!report) return c.json({ error: 'not found' }, 404);
    const raw = await c.req.json().catch(() => null);
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    if (parsed.data.signedBy !== undefined && !isKnownAgent(parsed.data.signedBy)) {
      return c.json({ error: `unknown signer: ${parsed.data.signedBy}` }, 400);
    }
    Object.assign(report, parsed.data, { updatedAt: new Date().toISOString() });
    if (parsed.data.schedule) report.nextRunAt = computeNextRunAt(parsed.data.schedule, new Date());
    saveStore();
    return c.json(report);
  });

  app.delete('/api/reports/:id', (c) => {
    const store = getStore();
    if (!store.reports) store.reports = [];
    const id = c.req.param('id');
    const idx = store.reports.findIndex((r) => r.id === id);
    if (idx === -1) return c.json({ error: 'not found' }, 404);
    store.reports.splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });

  app.post('/api/reports/:id/send', reportsSendLimit, async (c) => {
    const id = c.req.param('id');
    try {
      const result = await sendReport(deps, id, 'manual');
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/reports/:id/preview', async (c) => {
    const id = c.req.param('id');
    try {
      const result = await sendReport(deps, id, 'manual', { preview: true });
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // R15-#26 — bulk toggle endpoint. Accepts `{ ids: string[],
  // enabled: boolean }` and flips `enabled` on every matching
  // report in one saveStore() write. Returns count of changes.
  app.put('/api/reports/bulk-toggle', async (c) => {
    const store = getStore();
    if (!store.reports) store.reports = [];
    const raw = await c.req.json().catch(() => null) as { ids?: unknown; enabled?: unknown } | null;
    const ids = Array.isArray(raw?.ids) ? raw.ids.filter((x): x is string => typeof x === 'string') : null;
    const enabled = typeof raw?.enabled === 'boolean' ? raw.enabled : null;
    if (!ids || enabled === null) return c.json({ error: '{ids: string[], enabled: boolean} required'}, 400);
    const now = new Date().toISOString();
    let changed = 0;
    for (const id of ids) {
      const r = store.reports.find((x) => x.id === id);
      if (r && r.enabled !== enabled) { r.enabled = enabled; r.updatedAt = now; changed += 1; }
    }
    if (changed > 0) saveStore();
    return c.json({ changed, enabled });
  });

  // R15-#25 — reorder endpoint. Accepts `{orderedIds: string[]}`
   // and rewrites `report.order` by index. Returns the full list
   // in the new order. Missing ids are tolerated (skipped); any
   // reports not in the list keep their existing `order` (pushed
   // to the bottom in the sort below).
  app.put('/api/reports/reorder', async (c) => {
    const store = getStore();
    if (!store.reports) store.reports = [];
    const raw = await c.req.json().catch(() => null) as { orderedIds?: unknown } | null;
    const ids = Array.isArray(raw?.orderedIds) ? raw.orderedIds.filter((x): x is string => typeof x === 'string') : null;
    if (!ids) return c.json({ error: 'orderedIds (string[]) required' }, 400);
    const now = new Date().toISOString();
    ids.forEach((id, idx) => {
      const r = store.reports!.find((x) => x.id === id);
      if (r) { r.order = idx; r.updatedAt = now; }
    });
    // Anything not in the list gets pushed below; preserves relative
    // order of the unspecified tail.
    const maxIdx = ids.length;
    store.reports
      .filter((r) => !ids.includes(r.id))
      .forEach((r, i) => { r.order = maxIdx + i; });
    saveStore();
    return c.json(store.reports.slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999)));
  });

  app.get('/api/reports/runs', (c) => {
    const store = getStore();
    // R15-#19 — paginated archive. `limit` clamps to 1..200 (avoid
    // accidentally dumping the full run log to the UI). `offset`
    // counts backward from newest (offset=0 → newest page,
    // offset=50 → one page older). Missing/invalid params fall back
    // to the legacy "last 50 newest-first" behavior.
    const all = (store.reportRuns ?? []);
    const total = all.length;
    const rawLimit = parseInt(c.req.query('limit') ?? '50', 10);
    const rawOffset = parseInt(c.req.query('offset') ?? '0', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 50;
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
    // Newest-first: slice from the tail, then reverse the page so the
    // first element is the newest of this page.
    const end = Math.max(0, total - offset);
    const start = Math.max(0, end - limit);
    const page = all.slice(start, end).reverse();
    return c.json({ runs: page, total, offset, limit });
  });

  // R15-#17 — resend the exact HTML from a past successful run,
  // without re-running the LLM. Useful when the LLM output was
  // correct but Resend failed (bad domain, transient 5xx), or when
  // the user just wants to re-email the last report to a new
  // recipient without paying for compose again.
  app.post('/api/reports/runs/:runId/resend', reportsSendLimit, async (c) => {
    const store = getStore();
    const runId = c.req.param('runId');
    const run = (store.reportRuns ?? []).find((r) => r.id === runId);
    if (!run) return c.json({ error: 'run not found' }, 404);
    if (run.status !== 'sent' || !run.html || !run.subject) {
      return c.json({ error: 'run has no retained HTML — only `sent` runs can be re-mailed' }, 400);
    }
    const cfg = store.resend ?? {};
    if (!cfg.apiKey || !cfg.fromEmail) return c.json({ error: 'Resend not configured' }, 400);
    const to = run.recipients && run.recipients.length > 0 ? run.recipients : (cfg.defaultRecipient ? [cfg.defaultRecipient] : []);
    if (to.length === 0) return c.json({ error: 'no recipients' }, 400);
    try {
      const res = await sendViaResend({
        apiKey: cfg.apiKey, from: cfg.fromEmail, to,
        subject: run.subject, html: run.html,
      });
      return c.json({ ok: true, messageId: res.id, resentTo: to });
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
}
