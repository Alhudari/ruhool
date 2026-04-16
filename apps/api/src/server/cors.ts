import type { Hono } from 'hono';
import { cors } from 'hono/cors';

export function registerCors(app: Hono): void {
  app.use(
    '*',
    cors({
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
    })
  );
}
