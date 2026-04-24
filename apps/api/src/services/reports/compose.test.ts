import { describe, it, expect, vi } from 'vitest';
import { composeReport, type ReportComposerDeps } from './compose.js';
import type { StoreData, ReportDefinition, ReportRunRecord } from '../../store/types.js';

const makeStore = (over: Partial<StoreData> = {}): StoreData => ({
  tasks: [],
  messages: [],
  activityLog: [],
  reports: [],
  reportRuns: [],
  ...over,
} as unknown as StoreData);

const baseReport = (o: Partial<ReportDefinition> = {}): ReportDefinition => ({
  id: 'rep-1',
  name: 'daily',
  prompt: 'produce a daily report',
  signedBy: 'architect',
  schedule: { type: 'daily', hour: 22, minute: 0, timezone: 'Asia/Kuwait' },
  recipients: [],
  enabled: true,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
  ...o,
});

describe('composeReport — single-agent', () => {
  it('returns subject, html, and raw markdown', async () => {
    const store = makeStore();
    const callProvider = vi.fn().mockResolvedValue({
      text: '# يوم حافل\nمرحباً عبدالله.\n\n## الإنجاز\n- شي',
      tokensIn: 100, tokensOut: 80, costUsd: 0.001,
    });
    const deps: ReportComposerDeps = {
      getStore: () => store, callProvider,
      logger: { info: vi.fn(), warn: vi.fn() },
    };

    const out = await composeReport(deps, baseReport());
    expect(out.subject).toBe('يوم حافل');
    expect(out.html).toContain('<svg');   // charts embedded
    expect(out.bodyMarkdown).toContain('مرحباً عبدالله');
    expect(callProvider).toHaveBeenCalledTimes(1);
  });

  it('injects active feedback into the system prompt', async () => {
    const store = makeStore();
    const callProvider = vi.fn().mockResolvedValue({ text: '# t\nbody', tokensIn: 0, tokensOut: 0, costUsd: 0 });
    const report = baseReport({
      feedback: [
        { id: 'f1', text: 'اجعله أقصر', source: 'chat', createdAt: '2026-04-02T00:00:00Z', active: true },
        { id: 'f2', text: 'قد مات', source: 'chat', createdAt: '2026-04-02T00:00:00Z', active: false },
      ],
    });
    await composeReport({ getStore: () => store, callProvider, logger: { info: vi.fn(), warn: vi.fn() } }, report);
    const call = callProvider.mock.calls[0][0];
    // The active feedback must land in the prompt; the inactive one must not.
    expect(call.user).toContain('اجعله أقصر');
    expect(call.user).not.toContain('قد مات');
  });

  it('injects last-3 sent bodySnippets for memory', async () => {
    const runs: ReportRunRecord[] = [
      { id: 'r1', reportId: 'rep-1', triggeredBy: 'schedule', status: 'sent',
        subject: 'يوم الإثنين', bodySnippet: 'تكلّمت عن البحث',
        startedAt: '2026-04-10T00:00:00Z', recipients: [] },
      { id: 'r2', reportId: 'rep-1', triggeredBy: 'schedule', status: 'sent',
        subject: 'يوم الثلاثاء', bodySnippet: 'تكلّمت عن المراجعة',
        startedAt: '2026-04-11T00:00:00Z', recipients: [] },
      { id: 'r-other', reportId: 'different', triggeredBy: 'schedule', status: 'sent',
        subject: 'not mine', bodySnippet: 'ignore me',
        startedAt: '2026-04-12T00:00:00Z', recipients: [] },
    ];
    const store = makeStore({ reportRuns: runs });
    const callProvider = vi.fn().mockResolvedValue({ text: '# t\nbody', tokensIn: 0, tokensOut: 0, costUsd: 0 });
    await composeReport({ getStore: () => store, callProvider, logger: { info: vi.fn(), warn: vi.fn() } }, baseReport());
    const call = callProvider.mock.calls[0][0];
    expect(call.user).toContain('تكلّمت عن البحث');
    expect(call.user).toContain('تكلّمت عن المراجعة');
    // Other report's runs must not leak across.
    expect(call.user).not.toContain('ignore me');
    expect(call.user).toContain('avoid verbatim repetition');
  });

  it('omits charts when tasks context is disabled', async () => {
    const store = makeStore();
    const callProvider = vi.fn().mockResolvedValue({ text: '# t\nbody', tokensIn: 0, tokensOut: 0, costUsd: 0 });
    const out = await composeReport(
      { getStore: () => store, callProvider, logger: { info: vi.fn(), warn: vi.fn() } },
      baseReport({ includeContext: { tasks: false } }),
    );
    expect(out.html).not.toContain('<svg');
  });
});

describe('composeReport — enriched context sources (R12b)', () => {
  it('injects Zotero block when enabled and papers exist', async () => {
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const store = makeStore({
      papers: [{ title: 'BIM governance in Kuwait', addedAt: since, year: 2026 }],
      zoteroLastRefreshAt: since,
    } as unknown as Partial<StoreData>);
    const callProvider = vi.fn().mockResolvedValue({ text: '# t\nbody', tokensIn: 0, tokensOut: 0, costUsd: 0 });
    await composeReport(
      { getStore: () => store, callProvider, logger: { info: vi.fn(), warn: vi.fn() } },
      baseReport({ includeContext: { zotero: true } }),
    );
    const call = callProvider.mock.calls[0][0];
    expect(call.user).toContain('ZOTERO');
    expect(call.user).toContain('BIM governance in Kuwait');
  });

  it('injects Vault block when enabled and notes exist', async () => {
    const store = makeStore({
      notes: [{ title: 'supervisor meeting notes', updatedAt: new Date().toISOString() }],
    } as unknown as Partial<StoreData>);
    const callProvider = vi.fn().mockResolvedValue({ text: '# t\nbody', tokensIn: 0, tokensOut: 0, costUsd: 0 });
    await composeReport(
      { getStore: () => store, callProvider, logger: { info: vi.fn(), warn: vi.fn() } },
      baseReport({ includeContext: { vault: true } }),
    );
    expect(callProvider.mock.calls[0][0].user).toContain('supervisor meeting notes');
  });

  it('injects Meetings block when enabled', async () => {
    const store = makeStore({
      meetingSessions: [{ title: 'Supervisor sync', startsAt: new Date().toISOString(), summary: 'discussed chapter 4' }],
    } as unknown as Partial<StoreData>);
    const callProvider = vi.fn().mockResolvedValue({ text: '# t\nbody', tokensIn: 0, tokensOut: 0, costUsd: 0 });
    await composeReport(
      { getStore: () => store, callProvider, logger: { info: vi.fn(), warn: vi.fn() } },
      baseReport({ includeContext: { meetings: true } }),
    );
    const user = callProvider.mock.calls[0][0].user;
    expect(user).toContain('MEETINGS');
    expect(user).toContain('Supervisor sync');
    expect(user).toContain('chapter 4');
  });

  it('injects Budget block with spend vs cap', async () => {
    const store = makeStore({
      budget: { monthlyBudget: 100 },
      usage: [{ costUsd: 25.5, createdAt: new Date().toISOString() }],
    } as unknown as Partial<StoreData>);
    const callProvider = vi.fn().mockResolvedValue({ text: '# t\nbody', tokensIn: 0, tokensOut: 0, costUsd: 0 });
    await composeReport(
      { getStore: () => store, callProvider, logger: { info: vi.fn(), warn: vi.fn() } },
      baseReport({ includeContext: { budget: true } }),
    );
    const user = callProvider.mock.calls[0][0].user;
    expect(user).toContain('BUDGET');
    expect(user).toMatch(/\$25\.50 \/ \$100\.00/);
  });

  it('omits enriched blocks when not enabled', async () => {
    const store = makeStore({
      papers: [{ title: 'a', addedAt: new Date().toISOString(), year: 2026 }],
      notes: [{ title: 'b', updatedAt: new Date().toISOString() }],
      meetingSessions: [{ title: 'c', startsAt: new Date().toISOString() }],
    } as unknown as Partial<StoreData>);
    const callProvider = vi.fn().mockResolvedValue({ text: '# t\nbody', tokensIn: 0, tokensOut: 0, costUsd: 0 });
    await composeReport(
      { getStore: () => store, callProvider, logger: { info: vi.fn(), warn: vi.fn() } },
      baseReport(),
    );
    const user = callProvider.mock.calls[0][0].user;
    expect(user).not.toContain('ZOTERO');
    expect(user).not.toContain('MEETINGS');
  });
});

describe('composeReport — LLM retry on transient errors (R14-#6)', () => {
  it('retries once on transient 5xx then succeeds', async () => {
    const store = makeStore({
      resend: { composeRetryDelays: [1, 1] },
    } as unknown as Partial<StoreData>);
    const callProvider = vi.fn()
      .mockRejectedValueOnce(new Error('Anthropic 503 overloaded'))
      .mockResolvedValueOnce({ text: '# ok\nبعد المحاولة الثانية', tokensIn: 10, tokensOut: 5, costUsd: 0 });
    const out = await composeReport(
      { getStore: () => store, callProvider, logger: { info: vi.fn(), warn: vi.fn() } },
      baseReport(),
    );
    expect(out.subject).toBe('ok');
    expect(callProvider).toHaveBeenCalledTimes(2);
  });

  it('fast-fails on 4xx without retry', async () => {
    const store = makeStore({
      resend: { composeRetryDelays: [1, 1] },
    } as unknown as Partial<StoreData>);
    const callProvider = vi.fn()
      .mockRejectedValueOnce(new Error('Anthropic 401 invalid api key'));
    await expect(composeReport(
      { getStore: () => store, callProvider, logger: { info: vi.fn(), warn: vi.fn() } },
      baseReport(),
    )).rejects.toThrow(/401/);
    expect(callProvider).toHaveBeenCalledTimes(1);
  });

  it('gives up after configured delays exhausted', async () => {
    const store = makeStore({
      resend: { composeRetryDelays: [1, 1] },  // 2 retries → 3 total attempts
    } as unknown as Partial<StoreData>);
    const callProvider = vi.fn().mockRejectedValue(new Error('Anthropic 503 still overloaded'));
    await expect(composeReport(
      { getStore: () => store, callProvider, logger: { info: vi.fn(), warn: vi.fn() } },
      baseReport(),
    )).rejects.toThrow(/overloaded/);
    expect(callProvider).toHaveBeenCalledTimes(3);
  });
});

describe('composeReport — multi-agent sections', () => {
  it('calls provider once per section + once for the editor', async () => {
    const store = makeStore();
    const callProvider = vi.fn()
      .mockResolvedValueOnce({ text: 'قسم الراعي: نشاط الأسبوع', tokensIn: 50, tokensOut: 30, costUsd: 0.0005 })
      .mockResolvedValueOnce({ text: 'قسم الدكتور: صحة وتنظيم', tokensIn: 50, tokensOut: 30, costUsd: 0.0005 })
      .mockResolvedValueOnce({ text: '# التقرير المُجمّع\nتحية عبدالله', tokensIn: 200, tokensOut: 150, costUsd: 0.002 });

    const report = baseReport({
      sections: [
        { signedBy: 'manager', title: 'ملاحظات الدكتوراة', prompt: 'write PhD section' },
        { signedBy: 'doctor', title: 'ملاحظات الحياة', prompt: 'write life section' },
      ],
    });
    const out = await composeReport(
      { getStore: () => store, callProvider, logger: { info: vi.fn(), warn: vi.fn() } },
      report,
    );
    expect(callProvider).toHaveBeenCalledTimes(3);
    expect(out.subject).toBe('التقرير المُجمّع');
    // Editor's prompt must receive the section drafts.
    const editorCall = callProvider.mock.calls[2][0];
    expect(editorCall.user).toContain('قسم الراعي: نشاط الأسبوع');
    expect(editorCall.user).toContain('قسم الدكتور: صحة وتنظيم');
    // Cost aggregates across all three calls.
    expect(out.costUsd).toBeCloseTo(0.003, 4);
  });
});
