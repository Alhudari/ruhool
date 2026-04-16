import type { Hono } from 'hono';
import type { ProviderRecord, StoreData } from '../store/types.js';
import { AnthropicProvider } from '../services/llm/anthropic.js';

export interface ProviderRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  anthropicCache: {
    current: AnthropicProvider | null;
  };
}

/**
 * Providers CRUD + test routes (REL-01 stage 2d).
 *
 * GET  /api/providers
 * POST /api/providers
 * POST /api/providers/:id/test
 * PUT  /api/providers/:id
 */
export function registerProviderRoutes(app: Hono, deps: ProviderRoutesDeps): void {
  const { getStore, saveStore, anthropicCache } = deps;

  app.get('/api/providers', (c) => {
    const store = getStore();
    return c.json(store.providers.map(({ apiKey: _k, ...r }) => r));
  });

  app.post('/api/providers', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ type: string; displayName: string; apiKey?: string; baseUrl?: string; defaultModel?: string }>();
    const rec: ProviderRecord = {
      id: crypto.randomUUID(), type: body.type, displayName: body.displayName,
      apiKey: body.apiKey || null, baseUrl: body.baseUrl || null,
      defaultModel: body.defaultModel || null, enabled: true, status: 'untested',
      lastTestAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    store.providers.push(rec);
    saveStore();
    if (body.type === 'anthropic' && body.apiKey) {
      anthropicCache.current = new AnthropicProvider(body.apiKey, body.baseUrl || undefined);
    }
    const { apiKey: _k, ...safe } = rec;
    return c.json(safe, 201);
  });

  app.post('/api/providers/:id/test', async (c) => {
    const store = getStore();
    const row = store.providers.find((p) => p.id === c.req.param('id'));
    if (!row) return c.json({ error: 'Not found' }, 404);
    if (!row.apiKey) return c.json({ error: 'No API key' }, 400);
    let result: { ok: boolean; message?: string };
    try {
      if (row.type === 'anthropic') {
        const provider = new AnthropicProvider(row.apiKey, row.baseUrl || undefined);
        result = await provider.testConnection();
      } else if (row.type === 'openai') {
        const r = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${row.apiKey}` } });
        result = r.ok ? { ok: true, message: 'OpenAI key valid' } : { ok: false, message: `HTTP ${r.status}: ${(await r.text()).slice(0, 120)}` };
      } else if (row.type === 'google-gemini') {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${row.apiKey}`);
        result = r.ok ? { ok: true, message: 'Gemini key valid' } : { ok: false, message: `HTTP ${r.status}: ${(await r.text()).slice(0, 120)}` };
      } else if (row.type === 'perplexity') {
        const r = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST', headers: { authorization: `Bearer ${row.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
        });
        result = r.ok || r.status === 400 ? { ok: true, message: 'Perplexity key valid' } : { ok: false, message: `HTTP ${r.status}` };
      } else if (row.type === 'ollama') {
        const url = row.baseUrl || 'http://localhost:11434';
        const r = await fetch(`${url.replace(/\/$/, '')}/api/tags`).catch(() => null);
        result = r?.ok ? { ok: true, message: 'Ollama reachable' } : { ok: false, message: 'Cannot reach Ollama server' };
      } else if (row.type === 'xai' || row.type === 'grok') {
        const r = await fetch('https://api.x.ai/v1/models', { headers: { authorization: `Bearer ${row.apiKey}` } });
        result = r.ok ? { ok: true, message: 'xAI key valid' } : { ok: false, message: `HTTP ${r.status}` };
      } else if (row.type === 'mistral') {
        const r = await fetch('https://api.mistral.ai/v1/models', { headers: { authorization: `Bearer ${row.apiKey}` } });
        result = r.ok ? { ok: true, message: 'Mistral key valid' } : { ok: false, message: `HTTP ${r.status}` };
      } else if (row.type === 'deepseek') {
        const r = await fetch('https://api.deepseek.com/v1/models', { headers: { authorization: `Bearer ${row.apiKey}` } });
        result = r.ok ? { ok: true, message: 'DeepSeek key valid' } : { ok: false, message: `HTTP ${r.status}` };
      } else {
        result = { ok: false, message: `Unknown provider type: ${row.type}` };
      }
    } catch (e) {
      result = { ok: false, message: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
    }
    row.status = result.ok ? 'ok' : 'failing';
    row.lastTestAt = new Date().toISOString();
    saveStore();
    return c.json({ ...result, status: row.status });
  });

  app.put('/api/providers/:id', async (c) => {
    const store = getStore();
    const row = store.providers.find((p) => p.id === c.req.param('id'));
    if (!row) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<{ apiKey?: string; baseUrl?: string; defaultModel?: string; enabled?: boolean }>();
    if (body.apiKey !== undefined) row.apiKey = body.apiKey;
    if (body.baseUrl !== undefined) row.baseUrl = body.baseUrl;
    if (body.defaultModel !== undefined) row.defaultModel = body.defaultModel;
    if (body.enabled !== undefined) row.enabled = body.enabled;
    row.updatedAt = new Date().toISOString();
    saveStore();
    if (body.apiKey && row.type === 'anthropic') {
      anthropicCache.current = new AnthropicProvider(body.apiKey, row.baseUrl || undefined);
    }
    const { apiKey: _k, ...safe } = row;
    return c.json(safe);
  });
}
