/**
 * Ruhool API — pure proxy.
 *
 * Forwards every `/api/*` request to a standalone Hono API host:
 *   - dev: localhost:3001 (the `pnpm dev` server)
 *   - prod: process.env.NEXT_PUBLIC_API_URL (e.g. https://ruhool-api.railway.app)
 *
 * D-7 Wave 2 originally tried to bundle the Hono app INSIDE the Next.js
 * function, but the Hono server's heterogeneous dep graph (Pino, BullMQ,
 * Temporal, Postgres, etc.) wasn't friendly to Vercel's tracing — six
 * deploys later we still hit MODULE_NOT_FOUND. The pragmatic move is to
 * keep the API as a long-running Node server (Railway / Render / Fly) and
 * have Next.js just proxy. Same UX, way less yak-shaving.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function getApiTarget(): string {
  // Public env (`NEXT_PUBLIC_*`) is inlined at build time; we ALSO read
  // the runtime env so a server-side override works without rebuild.
  return (
    process.env.RUHOOL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:3001'
  );
}

async function handleRequest(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const target = `${getApiTarget()}${url.pathname}${url.search}`;
  const headers = new Headers(req.headers);
  headers.delete('host'); // upstream sets its own
  const init: RequestInit = {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
    // @ts-expect-error -- not in stock RequestInit yet
    duplex: 'half',
  };
  try {
    const res = await fetch(target, init);
    const respHeaders = new Headers(res.headers);
    return new NextResponse(res.body, { status: res.status, headers: respHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json(
      { error: `API not reachable at ${getApiTarget()} — ${msg}` },
      { status: 502 },
    );
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
export const OPTIONS = handleRequest;
export const HEAD = handleRequest;
export const runtime = 'nodejs';
export const maxDuration = 60;
