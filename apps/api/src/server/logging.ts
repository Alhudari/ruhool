import pino from 'pino';
import type { Hono, Context } from 'hono';
import crypto from 'node:crypto';

/**
 * Structured logging (OBS-01 / OBS-02).
 *
 * - Dev: pretty-printed via pino-pretty.
 * - Prod / other: JSON.
 * - Secrets in `apiKey`, `authorization`, `RUHOOL_API_TOKEN`, `POSTGRES_PASSWORD`,
 *   `ENCRYPTION_KEY` are redacted.
 * - Per-request child logger attached via `c.set('logger', ...)` with `requestId`.
 */

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'apiKey',
      'api_key',
      'authorization',
      'Authorization',
      'headers.authorization',
      'headers.Authorization',
      'req.headers.authorization',
      'RUHOOL_API_TOKEN',
      'POSTGRES_PASSWORD',
      'ENCRYPTION_KEY',
      '*.apiKey',
      '*.api_key',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
        },
      }
    : {}),
});

export type RequestLogger = ReturnType<typeof logger.child>;

/**
 * Hono middleware: attach `requestId` and a child logger to the context,
 * and log each request at completion.
 */
export function registerRequestLogger(app: Hono): void {
  app.use('*', async (c, next) => {
    const existing = c.req.header('x-request-id');
    const requestId = existing && existing.trim() ? existing.trim() : crypto.randomUUID();
    const reqLog = logger.child({ requestId });
    // Hono's default Variables map is empty; untyped keys are OK at runtime.
    (c as unknown as { set: (k: string, v: unknown) => void }).set('logger', reqLog);
    (c as unknown as { set: (k: string, v: unknown) => void }).set('requestId', requestId);
    c.header('x-request-id', requestId);
    const start = Date.now();
    try {
      await next();
    } finally {
      const latencyMs = Date.now() - start;
      reqLog.info(
        {
          method: c.req.method,
          path: c.req.path,
          status: c.res.status,
          latencyMs,
        },
        'http'
      );
    }
  });
}

export function getRequestLogger(c: Context): RequestLogger {
  const fromCtx = (c as unknown as { get: (k: string) => unknown }).get('logger') as
    | RequestLogger
    | undefined;
  return (fromCtx ?? (logger as unknown as RequestLogger));
}

export function getRequestId(c: Context): string | undefined {
  return (c as unknown as { get: (k: string) => unknown }).get('requestId') as
    | string
    | undefined;
}
