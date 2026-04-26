/**
 * Phase F regression: prove `/api/al-mulakhkhis/*` actually re-dispatches to
 * the legacy `/api/shwasha/*` handlers. The first attempt at this used a Hono
 * middleware that mutated `c.req.raw` — which silently no-op'd because Hono
 * computes the matched route before middleware fires. The fix uses
 * `app.all('/api/al-mulakhkhis/*', ...)` and re-enters via `app.fetch()`.
 *
 * If this test ever fails, every Al-Mulakhkhis frontend call returns 404 and
 * the reading helper is broken end-to-end.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

function makeApp() {
  const app = new Hono();
  // Mount the alias the same way registerAllRoutes does.
  app.all('/api/al-mulakhkhis/*', async (c) => {
    const url = new URL(c.req.url);
    url.pathname = url.pathname.replace(/^\/api\/al-mulakhkhis(\/|$)/, '/api/shwasha$1');
    const rewritten = new Request(url.toString(), c.req.raw);
    return app.fetch(rewritten, c.env);
  });
  // Stand in for any /api/shwasha/* handler.
  app.get('/api/shwasha/ping', (c) => c.json({ via: 'shwasha', ok: true }));
  app.post('/api/shwasha/echo', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json({ via: 'shwasha', body });
  });
  app.get('/api/shwasha/hello/:name', (c) => c.json({ name: c.req.param('name') }));
  return app;
}

describe('al-mulakhkhis path alias', () => {
  it('GET /api/al-mulakhkhis/ping returns shwasha handler response', async () => {
    const app = makeApp();
    const res = await app.request('/api/al-mulakhkhis/ping');
    expect(res.status).toBe(200);
    const body = await res.json() as { via: string; ok: boolean };
    expect(body).toEqual({ via: 'shwasha', ok: true });
  });

  it('POST /api/al-mulakhkhis/echo forwards body', async () => {
    const app = makeApp();
    const res = await app.request('/api/al-mulakhkhis/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { via: string; body: { hello: string } };
    expect(body.body).toEqual({ hello: 'world' });
  });

  it('preserves dynamic path params', async () => {
    const app = makeApp();
    const res = await app.request('/api/al-mulakhkhis/hello/abdullah');
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string };
    expect(body.name).toBe('abdullah');
  });

  it('returns 404 when underlying shwasha handler does not exist', async () => {
    const app = makeApp();
    const res = await app.request('/api/al-mulakhkhis/nonexistent-endpoint');
    expect(res.status).toBe(404);
  });

  it('preserves query strings', async () => {
    const app = new Hono();
    app.all('/api/al-mulakhkhis/*', async (c) => {
      const url = new URL(c.req.url);
      url.pathname = url.pathname.replace(/^\/api\/al-mulakhkhis(\/|$)/, '/api/shwasha$1');
      const rewritten = new Request(url.toString(), c.req.raw);
      return app.fetch(rewritten, c.env);
    });
    app.get('/api/shwasha/q', (c) => c.json({ q: c.req.query('q') }));

    const res = await app.request('/api/al-mulakhkhis/q?q=test123');
    expect(res.status).toBe(200);
    const body = await res.json() as { q: string };
    expect(body.q).toBe('test123');
  });
});
