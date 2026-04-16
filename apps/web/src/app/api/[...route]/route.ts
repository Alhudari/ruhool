/**
 * Catch-all API route handler.
 *
 * Development: proxies to the local Hono API server (localhost:3001)
 * Production:  handles core endpoints directly via Supabase
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const LOCAL_API = process.env.RUHOOL_API_URL || 'http://127.0.0.1:3001';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─── Supabase client (singleton) ───
let _sb: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_sb) {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    _sb = createClient(url, key);
  }
  return _sb;
}

// ─── App State (JSON store in Supabase) ───
async function getAppState(): Promise<Record<string, any>> {
  const sb = getSupabase();
  const { data } = await sb.from('app_state').select('data').eq('id', 'main').single();
  return data?.data || {};
}

async function saveAppState(state: unknown) {
  const sb = getSupabase();
  await sb.from('app_state').update({ data: state, updated_at: new Date().toISOString() }).eq('id', 'main');
}

// ─── Route matching with dynamic segments ───
type Handler = (req: NextRequest, params: Record<string, string>) => Promise<NextResponse>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

function route(method: string, path: string, handler: Handler): Route {
  const paramNames: string[] = [];
  const pattern = path.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  return { method, pattern: new RegExp(`^${pattern}$`), paramNames, handler };
}

const routes: Route[] = [
  // Health
  route('GET', '/api/health', async () =>
    NextResponse.json({ status: 'ok', mode: 'vercel', timestamp: new Date().toISOString() })
  ),

  // ─── Providers ───
  route('GET', '/api/providers', async () => {
    const state = await getAppState();
    return NextResponse.json(state.providers || []);
  }),

  route('POST', '/api/providers', async (req) => {
    const body = await req.json();
    const state = await getAppState();
    if (!state.providers) state.providers = [];
    const provider = {
      ...body,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      enabled: true,
      status: 'untested',
    };
    state.providers.push(provider);
    await saveAppState(state);
    return NextResponse.json(provider, { status: 201 });
  }),

  route('PUT', '/api/providers/:id', async (req, params) => {
    const body = await req.json();
    const state = await getAppState();
    if (!state.providers) state.providers = [];
    const idx = state.providers.findIndex((p: any) => p.id === params.id);
    if (idx === -1) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    state.providers[idx] = { ...state.providers[idx], ...body, updatedAt: new Date().toISOString() };
    await saveAppState(state);
    return NextResponse.json(state.providers[idx]);
  }),

  route('DELETE', '/api/providers/:id', async (_, params) => {
    const state = await getAppState();
    if (!state.providers) state.providers = [];
    state.providers = state.providers.filter((p: any) => p.id !== params.id);
    await saveAppState(state);
    return NextResponse.json({ ok: true });
  }),

  route('POST', '/api/providers/:id/test', async (_, params) => {
    const state = await getAppState();
    const provider = (state.providers || []).find((p: any) => p.id === params.id);
    if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

    try {
      if (provider.type === 'anthropic' && provider.apiKey) {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: provider.apiKey });
        await client.messages.create({
          model: 'claude-sonnet-4-5-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'ping' }],
        });
      }
      provider.status = 'connected';
      provider.lastTestedAt = new Date().toISOString();
      await saveAppState(state);
      return NextResponse.json({ ok: true, status: 'connected' });
    } catch (err: any) {
      provider.status = 'error';
      await saveAppState(state);
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
  }),

  // ─── Settings / API Keys ───
  route('GET', '/api/settings/api-keys', async () => {
    const state = await getAppState();
    const keys = state.apiKeys || {};
    // Return masked keys
    const masked: Record<string, string> = {};
    for (const [k, v] of Object.entries(keys)) {
      masked[k] = v ? `${(v as string).slice(0, 8)}...` : '';
    }
    return NextResponse.json(masked);
  }),

  route('PUT', '/api/settings/api-keys', async (req) => {
    const body = await req.json();
    const state = await getAppState();
    if (!state.apiKeys) state.apiKeys = {};
    Object.assign(state.apiKeys, body);
    await saveAppState(state);
    return NextResponse.json({ ok: true });
  }),

  route('DELETE', '/api/settings/api-keys/:field', async (_, params) => {
    const state = await getAppState();
    if (state.apiKeys) delete state.apiKeys[params.field];
    await saveAppState(state);
    return NextResponse.json({ ok: true });
  }),

  route('GET', '/api/settings/api-keys/capabilities', async () => {
    return NextResponse.json({});
  }),

  route('POST', '/api/settings/api-keys/:field/check', async () => {
    return NextResponse.json({ ok: true, capabilities: {} });
  }),

  route('GET', '/api/settings/cost-tier', async () => {
    const state = await getAppState();
    return NextResponse.json({ tier: state.costTier || 'standard' });
  }),

  route('PUT', '/api/settings/cost-tier', async (req) => {
    const body = await req.json();
    const state = await getAppState();
    state.costTier = body.tier;
    await saveAppState(state);
    return NextResponse.json({ ok: true });
  }),

  // ─── General Settings ───
  route('GET', '/api/settings', async () => {
    const state = await getAppState();
    return NextResponse.json(state.settings || {});
  }),

  route('GET', '/api/settings/privacy', async () => {
    const state = await getAppState();
    return NextResponse.json({ privacyMode: state.privacyMode || 'standard' });
  }),

  route('PUT', '/api/settings/privacy', async (req) => {
    const body = await req.json();
    const state = await getAppState();
    state.privacyMode = body.privacyMode;
    await saveAppState(state);
    return NextResponse.json({ ok: true });
  }),

  route('GET', '/api/settings/notifications', async () => {
    const state = await getAppState();
    return NextResponse.json(state.notificationSettings || {});
  }),

  route('PUT', '/api/settings/notifications', async (req) => {
    const body = await req.json();
    const state = await getAppState();
    state.notificationSettings = body;
    await saveAppState(state);
    return NextResponse.json({ ok: true });
  }),

  // ─── Agents ───
  route('GET', '/api/agents', async () => {
    const sb = getSupabase();
    const { data } = await sb.from('agents').select('*').order('created_at', { ascending: false });
    return NextResponse.json(data || []);
  }),

  route('GET', '/api/custom-agents', async () => {
    const state = await getAppState();
    return NextResponse.json(state.customAgents || []);
  }),

  // ─── Conversations ───
  route('GET', '/api/conversations', async () => {
    const state = await getAppState();
    return NextResponse.json(state.conversations || []);
  }),

  // ─── Tasks ───
  route('GET', '/api/tasks', async () => {
    const state = await getAppState();
    return NextResponse.json({ tasks: state.tasks || [], taskLists: state.taskLists || [] });
  }),

  // ─── Activity, Usage, Notifications ───
  route('GET', '/api/activity', async () => {
    const state = await getAppState();
    return NextResponse.json(state.activityLog || []);
  }),

  route('GET', '/api/usage', async () => {
    const state = await getAppState();
    return NextResponse.json(state.usage || []);
  }),

  route('GET', '/api/notifications', async () => {
    const state = await getAppState();
    return NextResponse.json(state.notifications || []);
  }),

  // ─── Workflows ───
  route('GET', '/api/workflows', async () => {
    const state = await getAppState();
    return NextResponse.json(state.workflows || []);
  }),

  // ─── Prompts ───
  route('GET', '/api/prompts', async () => {
    const state = await getAppState();
    return NextResponse.json(state.prompts || []);
  }),

  // ─── Chat — streaming via Anthropic SDK ───
  route('POST', '/api/chat', async (req) => {
    const body = await req.json();
    const state = await getAppState();
    const provider = (state.providers || []).find((p: any) => p.type === 'anthropic' && p.enabled && p.apiKey);

    if (!provider?.apiKey) {
      return NextResponse.json({ error: 'No API provider configured. Add one in Settings → Providers.' }, { status: 400 });
    }

    const messages = (body.messages || []).filter((m: any) => m.content && m.content.trim());
    if (messages.length === 0) {
      return NextResponse.json({ error: 'At least one message is required.' }, { status: 400 });
    }

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: provider.apiKey });

    const stream = await client.messages.stream({
      model: body.model || provider.defaultModel || 'claude-sonnet-4-5-20250514',
      max_tokens: body.maxTokens || 4096,
      system: body.systemPrompt || undefined,
      messages: messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(`event: text\ndata: ${JSON.stringify({ content: event.delta.text })}\n\n`));
            }
          }
          const finalMessage = await stream.finalMessage();
          controller.enqueue(encoder.encode(`event: usage\ndata: ${JSON.stringify({
            usage: {
              inputTokens: finalMessage.usage.input_tokens,
              outputTokens: finalMessage.usage.output_tokens,
              cachedTokens: (finalMessage.usage as any).cache_read_input_tokens || 0,
            }
          })}\n\n`));
          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
        } catch (err: any) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`));
        }
        controller.close();
      },
    });

    return new NextResponse(readable, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  }),
];

// ─── Proxy to local API (development) ───
async function proxyToLocal(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const targetUrl = `${LOCAL_API}${url.pathname}${url.search}`;
  try {
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => { if (k !== 'host' && k !== 'connection') headers[k] = v; });
    const res = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined,
    });
    const responseHeaders = new Headers();
    res.headers.forEach((v, k) => responseHeaders.set(k, v));
    if (res.headers.get('content-type')?.includes('text/event-stream')) {
      return new NextResponse(res.body, { status: res.status, headers: responseHeaders });
    }
    const body = await res.text();
    return new NextResponse(body, { status: res.status, headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: 'API server not reachable. Start it with: pnpm dev' }, { status: 502 });
  }
}

// ─── Route dispatcher ───
async function handleRequest(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (!IS_PRODUCTION) return proxyToLocal(req);

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const match = path.match(r.pattern);
    if (match) {
      const params: Record<string, string> = {};
      r.paramNames.forEach((name, i) => { params[name] = match[i + 1]; });
      try {
        return await r.handler(req, params);
      } catch (err: any) {
        console.error(`[api] ${req.method} ${path} error:`, err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
      }
    }
  }

  // Return empty arrays/objects for unknown GET endpoints (prevents UI crashes)
  if (req.method === 'GET') {
    return NextResponse.json([]);
  }

  return NextResponse.json({ error: 'Not found', path }, { status: 404 });
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
export const maxDuration = 60;
