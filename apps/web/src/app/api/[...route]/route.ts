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

// ─── Supabase client ───
function getSupabase() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

// ─── App State (JSON store in Supabase) ───
async function getAppState() {
  const sb = getSupabase();
  const { data } = await sb.from('app_state').select('data').eq('id', 'main').single();
  return data?.data || {};
}

async function saveAppState(state: unknown) {
  const sb = getSupabase();
  await sb.from('app_state').update({ data: state, updated_at: new Date().toISOString() }).eq('id', 'main');
}

// ─── Core API handlers (production) ───
type Handler = (req: NextRequest, path: string) => Promise<NextResponse>;

const handlers: Record<string, Handler> = {
  'GET:/api/health': async () => {
    return NextResponse.json({ status: 'ok', mode: 'vercel', timestamp: new Date().toISOString() });
  },

  'GET:/api/providers': async () => {
    const state = await getAppState();
    return NextResponse.json(state.providers || []);
  },

  'POST:/api/providers': async (req) => {
    const body = await req.json();
    const state = await getAppState();
    if (!state.providers) state.providers = [];
    const provider = { ...body, id: crypto.randomUUID(), createdAt: new Date().toISOString(), enabled: true, status: 'untested' };
    state.providers.push(provider);
    await saveAppState(state);
    return NextResponse.json(provider, { status: 201 });
  },

  'GET:/api/agents': async () => {
    const sb = getSupabase();
    const { data } = await sb.from('agents').select('*').order('created_at', { ascending: false });
    return NextResponse.json(data || []);
  },

  'GET:/api/conversations': async () => {
    const state = await getAppState();
    return NextResponse.json(state.conversations || []);
  },

  'GET:/api/tasks': async () => {
    const state = await getAppState();
    return NextResponse.json({ tasks: state.tasks || [], taskLists: state.taskLists || [] });
  },

  'GET:/api/activity': async () => {
    const state = await getAppState();
    return NextResponse.json(state.activityLog || []);
  },

  'GET:/api/usage': async () => {
    const state = await getAppState();
    return NextResponse.json(state.usage || []);
  },

  'GET:/api/notifications': async () => {
    const state = await getAppState();
    return NextResponse.json(state.notifications || []);
  },

  'GET:/api/settings': async () => {
    const state = await getAppState();
    return NextResponse.json(state.settings || {});
  },

  'GET:/api/workflows': async () => {
    const state = await getAppState();
    return NextResponse.json(state.workflows || []);
  },

  'GET:/api/custom-agents': async () => {
    const state = await getAppState();
    return NextResponse.json(state.customAgents || []);
  },

  'POST:/api/chat': async (req) => {
    const body = await req.json();
    const state = await getAppState();
    const provider = (state.providers || []).find((p: any) => p.type === 'anthropic' && p.enabled && p.apiKey);

    if (!provider?.apiKey) {
      return NextResponse.json({ error: 'No API provider configured. Add one in Settings.' }, { status: 400 });
    }

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: provider.apiKey });

    const stream = await client.messages.stream({
      model: body.model || 'claude-sonnet-4-5-20250514',
      max_tokens: body.maxTokens || 4096,
      system: body.systemPrompt || '',
      messages: (body.messages || []).map((m: any) => ({
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
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  },
};

// ─── Proxy to local API (development) ───
async function proxyToLocal(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const targetUrl = `${LOCAL_API}${url.pathname}${url.search}`;

  try {
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      if (k !== 'host' && k !== 'connection') headers[k] = v;
    });

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

  if (!IS_PRODUCTION) {
    return proxyToLocal(req);
  }

  const key = `${req.method}:${path}`;
  const handler = handlers[key];
  if (handler) {
    try {
      return await handler(req, path);
    } catch (err: any) {
      console.error(`[api] ${key} error:`, err);
      return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Not found', path }, { status: 404 });
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
export const maxDuration = 60;
