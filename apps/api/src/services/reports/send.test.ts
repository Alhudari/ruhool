/**
 * sendReport integration — mocks the mailer and provider so we can
 * exercise the orchestrator end-to-end without hitting Resend or an
 * LLM. Covers happy path, missing config, no recipients, compose
 * failure, mailer failure, and preview mode.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoreData, ReportDefinition } from '../../store/types.js';

// Hoisted mock holders so the factory can read them.
const mockSendViaResend = vi.fn();
vi.mock('./mailer.js', () => ({
  sendViaResend: (...args: unknown[]) => mockSendViaResend(...args),
}));

// We'll import sendReport *after* the mock is wired.
async function importSend() {
  return (await import('./send.js')).sendReport;
}

function makeStore(over: Partial<StoreData> = {}): StoreData {
  return {
    reports: [],
    reportRuns: [],
    resend: undefined,
    ...over,
  } as unknown as StoreData;
}

const baseReport = (o: Partial<ReportDefinition> = {}): ReportDefinition => ({
  id: 'rep-1',
  name: 'daily',
  prompt: 'write a short daily report',
  signedBy: 'architect',
  schedule: { type: 'daily', hour: 22, minute: 0, timezone: 'Asia/Kuwait' },
  recipients: ['owner@example.com'],
  enabled: true,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
  ...o,
});

const makeDeps = (store: StoreData, over: Record<string, unknown> = {}) => ({
  getStore: () => store,
  saveStore: vi.fn(),
  callProvider: vi.fn().mockResolvedValue({
    text: '# التقرير اليومي\nأهلاً يا عبدالله.\n\n## الإنجاز\n- نقطة واحدة',
    tokensIn: 100, tokensOut: 80, costUsd: 0.001,
  }),
  logger: { info: vi.fn(), warn: vi.fn() },
  auditLog: vi.fn(),
  ...over,
});

beforeEach(() => {
  mockSendViaResend.mockReset();
  mockSendViaResend.mockResolvedValue({ id: 'msg-123' });
});

describe('sendReport — happy path', () => {
  it('composes, mails, records a run, advances nextRunAt on success', async () => {
    const sendReport = await importSend();
    const report = baseReport();
    const store = makeStore({
      reports: [report],
      resend: { apiKey: 'k', fromEmail: 'bot@x.com', defaultRecipient: 'owner@example.com' },
    } as unknown as Partial<StoreData>);
    const deps = makeDeps(store);

    const result = await sendReport(deps, 'rep-1', 'schedule');

    expect(result.status).toBe('sent');
    expect(result.subject).toBe('التقرير اليومي');
    expect(mockSendViaResend).toHaveBeenCalledTimes(1);
    expect(mockSendViaResend).toHaveBeenCalledWith(expect.objectContaining({
      to: ['owner@example.com'],
      from: 'bot@x.com',
      subject: 'التقرير اليومي',
    }));
    // Run record saved and marked sent.
    expect(store.reportRuns).toHaveLength(1);
    expect(store.reportRuns![0].status).toBe('sent');
    expect(store.reportRuns![0].subject).toBe('التقرير اليومي');
    // Report bookkeeping.
    expect(report.lastSentAt).toBeTruthy();
    expect(report.lastError).toBeNull();
    expect(report.nextRunAt).toBeTruthy();
    expect(deps.auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'reports.sent' }));
  });
});

describe('sendReport — preview', () => {
  it('returns html without calling the mailer', async () => {
    const sendReport = await importSend();
    const report = baseReport();
    const store = makeStore({ reports: [report] } as Partial<StoreData>);
    const deps = makeDeps(store);

    const result = await sendReport(deps, 'rep-1', 'manual', { preview: true });
    expect(result.status).toBe('preview');
    expect(result.html).toContain('التقرير اليومي');
    // R15-#15: preview must include the raw markdown body so text-export
    // consumers don't need to round-trip through HTML parsing.
    expect(result.bodyMarkdown).toBeTruthy();
    expect(result.bodyMarkdown).toContain('أهلاً يا عبدالله');
    expect(mockSendViaResend).not.toHaveBeenCalled();
  });
});

describe('sendReport — error paths', () => {
  it('fails when report not found', async () => {
    const sendReport = await importSend();
    const store = makeStore();
    const deps = makeDeps(store);
    await expect(sendReport(deps, 'ghost', 'manual')).rejects.toThrow(/not found/);
  });

  // R16 — previous contract was "hard fail without Resend". New
  // contract: always write to the in-platform inbox; only attempt
  // mail when Resend is configured AND recipients exist. So "no
  // Resend" is now a successful delivery (to inbox).
  it('still delivers to inbox when Resend config is missing (R16)', async () => {
    const sendReport = await importSend();
    const report = baseReport();
    const store = makeStore({ reports: [report] } as Partial<StoreData>);
    const deps = makeDeps(store);
    const result = await sendReport(deps, 'rep-1', 'manual');
    expect(result.status).toBe('sent');
    expect(store.reportInbox).toHaveLength(1);
    expect(store.reportInbox![0].subject).toBe(result.subject);
    expect(mockSendViaResend).not.toHaveBeenCalled();
  });

  it('delivers to inbox when recipients empty and no defaultRecipient (R16)', async () => {
    const sendReport = await importSend();
    const report = baseReport({ recipients: [] });
    const store = makeStore({
      reports: [report],
      resend: { apiKey: 'k', fromEmail: 'bot@x.com' }, // no defaultRecipient
    } as unknown as Partial<StoreData>);
    const deps = makeDeps(store);
    const result = await sendReport(deps, 'rep-1', 'manual');
    expect(result.status).toBe('sent');
    expect(store.reportInbox).toHaveLength(1);
    expect(mockSendViaResend).not.toHaveBeenCalled();
  });

  it('retries transient mailer errors using configured retryDelays (R14-#5)', async () => {
    // Two 5xx attempts, then success. Use [1, 1] ms delays so the
    // test runs in <100ms instead of 1.5min.
    mockSendViaResend
      .mockRejectedValueOnce(new Error('Resend 503 service unavailable'))
      .mockRejectedValueOnce(new Error('Resend 502 bad gateway'))
      .mockResolvedValueOnce({ id: 'msg-retry-ok' });
    const sendReport = await importSend();
    const report = baseReport();
    const store = makeStore({
      reports: [report],
      resend: { apiKey: 'k', fromEmail: 'bot@x.com', defaultRecipient: 'o@x.com', retryDelays: [1, 1] },
    } as unknown as Partial<StoreData>);
    const deps = makeDeps(store);
    const result = await sendReport(deps, 'rep-1', 'manual');
    expect(result.status).toBe('sent');
    expect(mockSendViaResend).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry non-transient (4xx) mailer errors — fast-fails', async () => {
    mockSendViaResend.mockRejectedValueOnce(new Error('Resend 403 domain unverified'));
    const sendReport = await importSend();
    const report = baseReport();
    const store = makeStore({
      reports: [report],
      resend: { apiKey: 'k', fromEmail: 'bot@x.com', defaultRecipient: 'o@x.com', retryDelays: [1, 1] },
    } as unknown as Partial<StoreData>);
    const deps = makeDeps(store);
    const result = await sendReport(deps, 'rep-1', 'manual');
    expect(result.status).toBe('failed');
    // Exactly one attempt — the 4xx regex fast-fails without retry.
    expect(mockSendViaResend).toHaveBeenCalledTimes(1);
  });

  it('surfaces mailer errors to run + report.lastError', async () => {
    mockSendViaResend.mockRejectedValueOnce(new Error('Resend 403: domain unverified'));
    const sendReport = await importSend();
    const report = baseReport();
    const store = makeStore({
      reports: [report],
      resend: { apiKey: 'k', fromEmail: 'bot@x.com', defaultRecipient: 'owner@example.com' },
    } as unknown as Partial<StoreData>);
    const deps = makeDeps(store);

    const result = await sendReport(deps, 'rep-1', 'schedule');
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/domain unverified/);
    expect(report.lastError).toMatch(/domain unverified/);
    // Scheduled failures still advance nextRunAt to avoid retry storms.
    expect(report.nextRunAt).toBeTruthy();
  });

  it('surfaces provider/compose errors cleanly (after retries exhausted)', async () => {
    const sendReport = await importSend();
    const report = baseReport();
    // Tight retry delays so the test runs in <100ms despite the new
    // R14-#6 compose retry (default [5s, 10s] would time out vitest).
    const store = makeStore({
      reports: [report],
      resend: { apiKey: 'k', fromEmail: 'bot@x.com', composeRetryDelays: [1, 1] },
    } as unknown as Partial<StoreData>);
    const deps = makeDeps(store, {
      callProvider: vi.fn().mockRejectedValue(new Error('LLM quota exceeded')),
    });
    const result = await sendReport(deps, 'rep-1', 'manual');
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/quota/);
    expect(mockSendViaResend).not.toHaveBeenCalled();
  });
});
