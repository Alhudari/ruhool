/**
 * Tests for the agent-cards route (R14-#13): verifies env-gated
 * exposure and graceful fallback when the cards file is missing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerAgentCardsRoutes } from './agent-cards.js';

describe('agent-cards route', () => {
  let tmpDir: string;
  const originalEnv = process.env.RUHOOL_PUBLIC_CARDS;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ruhool-cards-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.RUHOOL_PUBLIC_CARDS;
    else process.env.RUHOOL_PUBLIC_CARDS = originalEnv;
  });

  function makeApp(): Hono {
    const app = new Hono();
    registerAgentCardsRoutes(app, { dataRoot: tmpDir });
    return app;
  }

  it('returns 404 when RUHOOL_PUBLIC_CARDS env is unset', async () => {
    delete process.env.RUHOOL_PUBLIC_CARDS;
    fs.writeFileSync(path.join(tmpDir, 'agent-cards.json'), JSON.stringify({ agents: [] }));
    const res = await makeApp().request('/.well-known/agent.json');
    expect(res.status).toBe(404);
  });

  it('returns 404 when env is any value other than exact "true"', async () => {
    process.env.RUHOOL_PUBLIC_CARDS = '1';  // truthy but not 'true'
    fs.writeFileSync(path.join(tmpDir, 'agent-cards.json'), JSON.stringify({ agents: [] }));
    const res = await makeApp().request('/.well-known/agent.json');
    expect(res.status).toBe(404);
  });

  it('returns 200 + JSON + Cache-Control when env=true and file exists', async () => {
    process.env.RUHOOL_PUBLIC_CARDS = 'true';
    const payload = { meta: { platform: 'Ruhool' }, agents: [{ id: 'manager' }] };
    fs.writeFileSync(path.join(tmpDir, 'agent-cards.json'), JSON.stringify(payload));
    const res = await makeApp().request('/.well-known/agent.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age=300');
    const body = await res.json() as { agents: Array<{ id: string }> };
    expect(body.agents[0].id).toBe('manager');
  });

  it('returns 404 with error payload when file missing (env enabled)', async () => {
    process.env.RUHOOL_PUBLIC_CARDS = 'true';
    const res = await makeApp().request('/.well-known/agent.json');
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/missing/);
  });

  it('serves the same payload from /api/agents/cards (alias route)', async () => {
    process.env.RUHOOL_PUBLIC_CARDS = 'true';
    fs.writeFileSync(path.join(tmpDir, 'agent-cards.json'), JSON.stringify({ ok: true }));
    const res = await makeApp().request('/api/agents/cards');
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
