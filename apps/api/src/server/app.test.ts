import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from './app.js';
import { registerHealthRoutes } from '../routes/health.js';

describe('health route', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.RUHOOL_API_TOKEN;
  });
  afterEach(() => {
    process.env.RUHOOL_API_TOKEN = saved;
  });

  it('GET /api/health returns 200 JSON without token', async () => {
    delete process.env.RUHOOL_API_TOKEN;
    const app = createApp();
    registerHealthRoutes(app, { serviceHealth: { redis: false } });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; name: string };
    expect(body.status).toBe('ok');
    expect(body.name).toBe('Ruhool');
  });

  it('GET /api/health is open even with token set', async () => {
    process.env.RUHOOL_API_TOKEN = 'test-token';
    const app = createApp();
    registerHealthRoutes(app, { serviceHealth: {} });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('bearer auth', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.RUHOOL_API_TOKEN;
  });
  afterEach(() => {
    process.env.RUHOOL_API_TOKEN = saved;
  });

  it('returns 401 on /api/* without matching token when token set', async () => {
    process.env.RUHOOL_API_TOKEN = 'secret-xyz';
    const app = createApp();
    registerHealthRoutes(app, { serviceHealth: {} });
    // Use non-health route path (no handler) — auth should still 401 first.
    const res = await app.request('/api/providers');
    expect(res.status).toBe(401);
  });

  it('passes through /api/* with matching bearer', async () => {
    process.env.RUHOOL_API_TOKEN = 'secret-xyz';
    const app = createApp();
    app.get('/api/ping', (c) => c.json({ pong: true }));
    const res = await app.request('/api/ping', {
      headers: { authorization: 'Bearer secret-xyz' },
    });
    expect(res.status).toBe(200);
  });

  it('attaches x-request-id header on response', async () => {
    delete process.env.RUHOOL_API_TOKEN;
    const app = createApp();
    registerHealthRoutes(app, { serviceHealth: {} });
    const res = await app.request('/api/health', {
      headers: { 'x-request-id': 'test-123' },
    });
    expect(res.headers.get('x-request-id')).toBe('test-123');
  });
});
