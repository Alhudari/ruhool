import type { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * A2A agent discovery endpoint.
 * Serves data/agent-cards.json at /.well-known/agent-cards.json and /api/agent-cards.
 * Ready for Phase 2 inter-agent federation (Tailscale + local Gemma).
 */
export function registerAgentCardsRoutes(app: Hono, deps: { dataDir: string }): void {
  const serveCards = (c: Parameters<Parameters<typeof app.get>[1]>[0]) => {
    const filePath = path.join(deps.dataDir, 'agent-cards.json');
    try {
      if (!fs.existsSync(filePath)) {
        return c.json({ error: 'agent-cards.json not found' }, 404);
      }
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      return c.json(data);
    } catch {
      return c.json({ error: 'failed to load agent cards' }, 500);
    }
  };

  app.get('/api/agent-cards', serveCards);
  app.get('/.well-known/agent-cards.json', serveCards);
}
