/**
 * Route-level tests for /api/reports. Exercises the resend-config PUT's
 * auto-seed branch and the send endpoint's onFailure wiring via a full
 * Hono test harness.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { StoreData } from '../store/types.js';
import { registerReportsRoutes } from './reports.js';

const mockSendViaResend = vi.fn();
vi.mock('../services/reports/mailer.js', () => ({
  sendViaResend: (...args: unknown[]) => mockSendViaResend(...args),
}));

function setup(initial: Partial<StoreData> = {}) {
  const store: StoreData = {
    reports: [],
    reportRuns: [],
    resend: undefined,
    tasks: [],
    messages: [],
    activityLog: [],
    ...initial,
  } as unknown as StoreData;

  const app = new Hono();
  const saveStore = vi.fn();
  const onFailure = vi.fn();
  const callProvider = vi.fn().mockResolvedValue({
    text: '# t\nbody', tokensIn: 10, tokensOut: 5, costUsd: 0.0001,
  });
  registerReportsRoutes(app, {
    getStore: () => store,
    saveStore,
    callProvider,
    logger: { info: vi.fn(), warn: vi.fn() },
    onFailure,
  });
  return { app, store, saveStore, onFailure, callProvider };
}

beforeEach(() => {
  mockSendViaResend.mockReset();
  mockSendViaResend.mockResolvedValue({ id: 'msg-1' });
});

describe('PUT /api/reports/resend-config — auto-seed', () => {
  it('seeds a default disabled report the first time all three fields land together', async () => {
    const { app, store } = setup();
    const res = await app.request('/api/reports/resend-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiKey: 're_abc',
        fromEmail: 'Ruhool <bot@x.com>',
        defaultRecipient: 'me@example.com',
      }),
    });
    expect(res.status).toBe(200);
    const j = await res.json() as { autoSeeded: boolean };
    expect(j.autoSeeded).toBe(true);
    expect(store.reports).toHaveLength(1);
    const r = store.reports![0];
    expect(r.enabled).toBe(false); // opt-in
    expect(r.signedBy).toBe('architect');
    expect(r.schedule.type).toBe('daily');
    expect(r.nextRunAt).toBeTruthy();
  });

  it('does NOT auto-seed when reports already exist', async () => {
    const { app, store } = setup({
      reports: [{
        id: 'x', name: 'existing', prompt: 'p', signedBy: 'manager',
        schedule: { type: 'manual' }, recipients: [], enabled: true,
        createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z',
      }] as StoreData['reports'],
    });
    await app.request('/api/reports/resend-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiKey: 're_abc', fromEmail: 'bot@x.com', defaultRecipient: 'me@example.com',
      }),
    });
    expect(store.reports).toHaveLength(1);
    expect(store.reports![0].name).toBe('existing');
  });

  it('does NOT auto-seed on incremental save (only one field at a time)', async () => {
    const { app, store } = setup();
    await app.request('/api/reports/resend-config', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 're_abc' }),
    });
    await app.request('/api/reports/resend-config', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fromEmail: 'bot@x.com' }),
    });
    // Only after the third PUT completes the triad should we seed.
    expect(store.reports).toHaveLength(0);
    await app.request('/api/reports/resend-config', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ defaultRecipient: 'me@example.com' }),
    });
    expect(store.reports).toHaveLength(1);
  });
});

describe('POST /api/reports/:id/send — onFailure hook', () => {
  it('invokes onFailure when mailer throws', async () => {
    mockSendViaResend.mockRejectedValueOnce(new Error('Resend 403 unverified'));
    const { app, store, onFailure } = setup({
      reports: [{
        id: 'rep-1', name: 'daily', prompt: 'p', signedBy: 'architect',
        schedule: { type: 'daily', hour: 22, minute: 0, timezone: 'Asia/Kuwait' },
        recipients: ['me@example.com'], enabled: true,
        createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z',
      }] as StoreData['reports'],
      resend: { apiKey: 'k', fromEmail: 'bot@x.com' },
    });

    const res = await app.request('/api/reports/rep-1/send', { method: 'POST' });
    const j = await res.json() as { status: string; error?: string };
    expect(j.status).toBe('failed');
    expect(j.error).toMatch(/unverified/);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({
      reportName: 'daily',
      reportId: 'rep-1',
      error: expect.stringMatching(/unverified/),
      triggeredBy: 'manual',
    }));
    // Ensure store reflects the failure state.
    expect(store.reports![0].lastError).toMatch(/unverified/);
  });

  it('rate-limits after capacity (6) is exhausted (R14-#14)', async () => {
    const { app } = setup({
      reports: [{
        id: 'rep-rl', name: 'rl', prompt: 'p', signedBy: 'architect',
        schedule: { type: 'daily', hour: 22, minute: 0, timezone: 'Asia/Kuwait' },
        recipients: ['me@example.com'], enabled: true,
        createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z',
      }] as StoreData['reports'],
      resend: { apiKey: 'k', fromEmail: 'bot@x.com' },
    });
    // Unique IP isolates this test's bucket from neighbors.
    const ip = `10.0.0.${Math.floor(Math.random() * 200) + 50}`;
    const results: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const res = await app.request('/api/reports/rep-rl/send', {
        method: 'POST',
        headers: { 'x-forwarded-for': ip },
      });
      results.push(res.status);
    }
    // Bucket capacity is 6 — first 6 should pass through (2xx/5xx),
    // then subsequent requests must return 429 before reaching handler.
    const limited = results.filter((s) => s === 429);
    expect(limited.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT invoke onFailure on success', async () => {
    const { app, onFailure } = setup({
      reports: [{
        id: 'rep-1', name: 'daily', prompt: 'p', signedBy: 'architect',
        schedule: { type: 'daily', hour: 22, minute: 0, timezone: 'Asia/Kuwait' },
        recipients: ['me@example.com'], enabled: true,
        createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z',
      }] as StoreData['reports'],
      resend: { apiKey: 'k', fromEmail: 'bot@x.com' },
    });
    await app.request('/api/reports/rep-1/send', { method: 'POST' });
    expect(onFailure).not.toHaveBeenCalled();
  });
});
