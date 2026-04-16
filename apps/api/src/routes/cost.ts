// Cost estimation — extracted from index.ts.
// POST /api/cost/estimate

import type { Hono } from 'hono';
import type { AudioPlan } from '../services/render-audio.js';

export type CostLine = { service: string; units: number; unitName: string; usd: number };

export interface CostRoutesDeps {
  estimateAudioPlanCost: (plan: AudioPlan | undefined) => { lines: CostLine[]; totalUSD: number };
  demoMapCost: Record<string, { service: string; cost: number }>;
}

export function registerCostRoutes(app: Hono, deps: CostRoutesDeps): void {
  const { estimateAudioPlanCost, demoMapCost } = deps;

  app.post('/api/cost/estimate', async (c) => {
    const body = await c.req.json<{
      demoName?: string;
      audioPlan?: AudioPlan;
      hasMap?: boolean;
    }>();
    const lines: CostLine[] = [];
    const audioEst = estimateAudioPlanCost(body.audioPlan);
    lines.push(...audioEst.lines);

    if (body.demoName) {
      const m = demoMapCost[body.demoName];
      if (m) lines.push({ service: m.service, units: 1, unitName: 'request', usd: m.cost });
    }
    const totalUSD = lines.reduce((s, l) => s + l.usd, 0);
    return c.json({ lines, totalUSD, note: 'Estimate. Actual billing may differ slightly.' });
  });
}
