/**
 * Agent Cards route (R14-#13).
 *
 * Serves `data/agent-cards.json` at two paths:
 *   - `/.well-known/agent.json` — A2A convention
 *   - `/api/agents/cards` — platform-local alias
 *
 * Gated by `RUHOOL_PUBLIC_CARDS=true` env. Default: 404 (opt-in only)
 * so running a Ruhool instance on the public internet doesn't
 * inadvertently expose the agent catalog.
 */
import type { Hono, Context } from 'hono';
import fs from 'node:fs';
import path from 'node:path';

export interface AgentCardsRoutesDeps {
  dataRoot: string;
  logger?: { warn: (obj: { err: unknown }, m: string) => void };
}

function isEnabled(): boolean {
  return process.env.RUHOOL_PUBLIC_CARDS === 'true';
}

export function registerAgentCardsRoutes(app: Hono, deps: AgentCardsRoutesDeps): void {
  const cardsPath = path.join(deps.dataRoot, 'agent-cards.json');

  const handler = (c: Context) => {
    if (!isEnabled()) return c.notFound();
    try {
      if (!fs.existsSync(cardsPath)) return c.json({ error: 'agent-cards.json missing' }, 404);
      const raw = fs.readFileSync(cardsPath, 'utf-8');
      const parsed = JSON.parse(raw);
      c.header('Cache-Control', 'public, max-age=300');
      return c.json(parsed);
    } catch (err) {
      deps.logger?.warn({ err }, '[agent-cards] failed to read');
      return c.json({ error: 'read failed' }, 500);
    }
  };

  app.get('/.well-known/agent.json', handler);
  app.get('/api/agents/cards', handler);
}
