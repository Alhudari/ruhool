/**
 * Catch-all API route handler.
 *
 * Development: proxies to the local Hono API server (localhost:3001)
 * Production:  handles core endpoints directly via Supabase
 *
 * This lets us deploy to Vercel without a separate API server
 * while keeping full compatibility with the local dev experience.
 */
import { NextRequest, NextResponse } from 'next/server';

const LOCAL_API = process.env.RUHOOL_API_URL || 'http://127.0.0.1:3001';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DB_URL = process.env.DATABASE_URL || '';

// ─── Supabase DB helper ───
async function dbQuery(sql: string, params: unknown[] = []) {
  const postgres = (await import('postgres')).default;
  const client = postgres(DB_URL, {
    ssl: DB_URL.includes('supabase.co') || DB_URL.includes('neon.tech') ? 'require' : false,
    max: 1,
    idle_timeout: 5,
  });
  try {
    return await client.unsafe(sql, params as any[]);
  } finally {
    await client.end();
  }
}

// ─── App State (JSON store in Supabase) ───
async function getAppState() {
  const rows = await dbQuery('SELECT data FROM app_state WHERE id = $1', ['main']);
  return rows.length > 0 ? (rows[0] as any).data || {} : {};
}

async function saveAppState(data: unknown) {
  await dbQuery('UPDATE app_state SET data = $1::jsonb, updated_at = now() WHERE id = $2', [
    JSON.stringify(data), 'main',
  ]);
}

// ─── Core API handlers (production) ───
type Handler = (req: NextRequest, path: string) => Promise<NextResponse>;

const handlers: Record<string, Handler> = {
  // Health check
  'GET:/api/health': async () => {
    return NextResponse.json({ status: 'ok', mode: 'vercel', timestamp: new Date().toISOString() });
  },

  // Providers CRUD
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

  // Agents
  'GET:/api/agents': async () => {
    const rows = await dbQuery('SELECT * FROM agents ORDER BY created_at DESC');
    return NextResponse.json(rows);
  },

  // Conversations
  'GET:/api/conversations': async () => {
    const state = await getAppState();
    return NextResponse.json(state.conversations || []);
  },

  // Tasks
  'GET:/api/tasks': async () => {
    const state = await getAppState();
    return NextResponse.json({ tasks: state.tasks || [], taskLists: state.taskLists || [] });
  },

  // Activity
  'GET:/api/activity': async () => {
    const state = await getAppState();
    return NextResponse.json(state.activityLog || []);
  },

  // Usage
  'GET:/api/usage': async () => {
    const state = await getAppState();
    return NextResponse.json(state.usage || []);
  },

  // Notifications
  'GET:/api/notifications': async () => {
    const state = await getAppState();
    return NextResponse.json(state.notifications || []);
  },

  // Settings
  'GET:/api/settings': async () => {
    const state = await getAppState();
    return NextResponse.json(state.settings || {});
  },

  // Workflows
  'GET:/api/workflows': async () => {
    const state = await getAppState();
    return NextResponse.json(state.workflows || []);
  },

  // Custom agents
  'GET:/api/custom-agents': async () => {
    const state = await getAppState();
    return NextResponse.json(state.customAgents || []);
  },

  // Chat — streaming via Anthropic SDK
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

    // Stream SSE responses
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

  // In development, proxy everything to the local Hono API
  if (!IS_PRODUCTION) {
    return proxyToLocal(req);
  }

  // In production, handle known routes directly
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

  // Fallback for unhandled routes
  return NextResponse.json({ error: 'Not found', path }, { status: 404 });
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;

// Allow streaming responses to run longer
export const maxDuration = 60;
