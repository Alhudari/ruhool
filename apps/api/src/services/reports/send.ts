/**
 * Send orchestrator — one function that takes a report definition and
 * runs the full pipeline: compose content, email it, log a run record.
 * Used by the scheduler, the "send now" route, and the chat tool.
 */
import crypto from 'node:crypto';
import type { ReportRunRecord } from '../../store/types.js';
import { composeReport, type ReportComposerDeps } from './compose.js';
import { sendViaResend } from './mailer.js';
import { computeNextRunAt } from './schedule.js';

export interface SendReportDeps extends ReportComposerDeps {
  saveStore: () => void;
  auditLog?: (entry: { action: string; source: string; meta?: Record<string, unknown> }) => void;
  /** Optional — invoked when a scheduled send fails so the user sees
   *  the problem without opening the settings page. */
  onFailure?: (input: { reportName: string; reportId: string; error: string; triggeredBy: string }) => void;
}

export interface SendReportResult {
  runId: string;
  status: 'sent' | 'failed' | 'preview';
  error?: string;
  subject?: string;
  html?: string;
  /** R14-#15 — raw markdown body. Populated only when called with
   *  `{ preview: true }` so text-export consumers don't need to
   *  round-trip through HTML parsing. */
  bodyMarkdown?: string;
}

export async function sendReport(
  deps: SendReportDeps,
  reportId: string,
  triggeredBy: ReportRunRecord['triggeredBy'],
  opts: { preview?: boolean } = {},
): Promise<SendReportResult> {
  const store = deps.getStore();
  if (!store.reports) store.reports = [];
  if (!store.reportRuns) store.reportRuns = [];
  const report = store.reports.find((r) => r.id === reportId);
  if (!report) throw new Error(`Report not found: ${reportId}`);

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const recipients = report.recipients.length > 0
    ? report.recipients
    : (store.resend?.defaultRecipient ? [store.resend.defaultRecipient] : []);

  const run: ReportRunRecord = {
    id: runId,
    reportId,
    triggeredBy,
    status: 'composing',
    startedAt,
    recipients,
  };
  store.reportRuns.push(run);
  deps.saveStore();

  try {
    const composed = await composeReport(deps, report);
    run.subject = composed.subject;
    run.bodySnippet = composed.bodyMarkdown.slice(0, 800);
    // R15-#17: retain the full HTML so `/api/reports/runs/:id/resend`
    // can re-mail without a second LLM call.
    run.html = composed.html;
    run.htmlBytes = composed.html.length;
    run.tokensIn = composed.tokensIn;
    run.tokensOut = composed.tokensOut;
    run.costUsd = composed.costUsd;

    if (opts.preview) {
      run.status = 'sent';  // previews don't hit Resend, but we mark the compose run OK
      run.finishedAt = new Date().toISOString();
      deps.saveStore();
      return { runId, status: 'preview', subject: composed.subject, html: composed.html, bodyMarkdown: composed.bodyMarkdown };
    }

    // R16 — write to the in-platform inbox FIRST, before attempting
    // Resend. This way Abdullah always has a readable copy inside
    // Ruhool, even if Resend isn't configured or fails permanently.
    const inboxItem = {
      id: crypto.randomUUID(),
      reportId: report.id,
      runId,
      subject: composed.subject,
      html: composed.html,
      bodyMarkdown: composed.bodyMarkdown,
      from: report.signedBy,
      sentAt: new Date().toISOString(),
      read: false,
    };
    if (!store.reportInbox) store.reportInbox = [];
    store.reportInbox.push(inboxItem);

    const apiKey = store.resend?.apiKey;
    const fromEmail = store.resend?.fromEmail;
    const resendConfigured = !!apiKey && !!fromEmail && recipients.length > 0;

    // No Resend configured → still count as successfully delivered
    // (to the inbox). Skip the entire mailer block.
    if (!resendConfigured) {
      run.status = 'sent';
      run.finishedAt = new Date().toISOString();
      report.lastSentAt = run.finishedAt;
      report.lastError = null;
      report.lastRunId = runId;
      if (triggeredBy === 'schedule') {
        report.nextRunAt = computeNextRunAt(report.schedule, new Date());
      }
      report.updatedAt = new Date().toISOString();
      deps.saveStore();
      deps.logger.info(`[reports] delivered to inbox (Resend not configured) — "${report.name}"`);
      return { runId, status: 'sent', subject: composed.subject };
    }

    run.status = 'sending';
    deps.saveStore();

    // Retry with exponential backoff. Defaults: 30s → 60s → 120s
    // (3.5min ceiling). Tunable via `store.resend.retryDelays` — useful
    // for CI (set to `[100, 100, 100]`) or aggressive recovery setups.
    // Guards against transient Resend outages (502/503/rate-limit)
    // without retry-storming on permanent failures (400/401/403
    // bubble up immediately).
    const defaultDelays = [30_000, 60_000, 120_000];
    const configured = store.resend?.retryDelays;
    const delays = Array.isArray(configured) && configured.every((v) => typeof v === 'number' && v >= 0)
      ? configured
      : defaultDelays;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        await sendViaResend({
          apiKey,
          from: fromEmail,
          to: recipients,
          subject: composed.subject,
          html: composed.html,
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const msg = lastErr.message;
        // Fast-fail on clearly non-transient codes.
        if (/\b4(0[01234]|09|22)\b/.test(msg)) break;
        if (attempt === delays.length) break;
        deps.logger.warn({ err }, `[reports] send attempt ${attempt + 1} failed; retrying in ${delays[attempt] / 1000}s`);
        await new Promise<void>((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
    if (lastErr) throw lastErr;

    run.status = 'sent';
    run.finishedAt = new Date().toISOString();
    report.lastSentAt = run.finishedAt;
    report.lastError = null;
    report.lastRunId = runId;

    // Advance schedule on successful scheduled sends.
    if (triggeredBy === 'schedule') {
      report.nextRunAt = computeNextRunAt(report.schedule, new Date());
    }
    report.updatedAt = new Date().toISOString();

    deps.auditLog?.({
      action: 'reports.sent',
      source: triggeredBy === 'schedule' ? 'worker:reports' : 'platform:user',
      meta: { reportId, runId, subject: composed.subject, recipients, triggeredBy },
    });
    deps.saveStore();
    deps.logger.info(`[reports] sent "${report.name}" → ${recipients.join(', ')}`);
    return { runId, status: 'sent', subject: composed.subject };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    run.status = 'failed';
    run.error = msg;
    run.finishedAt = new Date().toISOString();
    report.lastError = msg;
    report.updatedAt = new Date().toISOString();
    // Even on failure, advance schedule so we don't retry-storm.
    if (triggeredBy === 'schedule') {
      report.nextRunAt = computeNextRunAt(report.schedule, new Date());
    }
    deps.saveStore();
    deps.logger.warn({ err }, `[reports] send failed for "${report.name}"`);
    try {
      deps.onFailure?.({ reportName: report.name, reportId: report.id, error: msg, triggeredBy });
    } catch { /* notifier errors shouldn't mask the real one */ }
    return { runId, status: 'failed', error: msg };
  }
}
