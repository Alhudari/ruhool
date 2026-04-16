import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';

export interface UsageRoutesDeps {
  getStore: () => StoreData;
}

/**
 * Usage analytics routes (REL-01 stage 2d).
 *
 * GET /api/usage/summary      totals across all usage
 * GET /api/usage/today        totals for today
 * GET /api/usage/by-agent     grouped by model
 * GET /api/usage/by-provider  grouped by provider
 * GET /api/usage/recent       recent records (period + limit)
 */
export function registerUsageRoutes(app: Hono, deps: UsageRoutesDeps): void {
  const { getStore } = deps;

  app.get('/api/usage/summary', (c) => {
    const store = getStore();
    return c.json({
      totalCost: store.usage.reduce((s, r) => s + r.totalCostUsd, 0),
      totalCalls: store.usage.length,
      totalInputTokens: store.usage.reduce((s, r) => s + r.inputTokens, 0),
      totalOutputTokens: store.usage.reduce((s, r) => s + r.outputTokens, 0),
    });
  });

  app.get('/api/usage/today', (c) => {
    const store = getStore();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayRecords = store.usage.filter((r) => new Date(r.timestamp) >= todayStart);
    return c.json({
      totalCost: todayRecords.reduce((s, r) => s + r.totalCostUsd, 0),
      totalCalls: todayRecords.length,
      totalInputTokens: todayRecords.reduce((s, r) => s + r.inputTokens, 0),
      totalOutputTokens: todayRecords.reduce((s, r) => s + r.outputTokens, 0),
    });
  });

  app.get('/api/usage/by-agent', (c) => {
    const store = getStore();
    const byAgent: Record<string, { calls: number; cost: number; tokens: number }> = {};
    for (const r of store.usage) {
      const key = r.model;
      if (!byAgent[key]) byAgent[key] = { calls: 0, cost: 0, tokens: 0 };
      byAgent[key].calls++;
      byAgent[key].cost += r.totalCostUsd;
      byAgent[key].tokens += r.inputTokens + r.outputTokens;
    }
    return c.json(byAgent);
  });

  app.get('/api/usage/by-provider', (c) => {
    const store = getStore();
    const byProvider: Record<string, { calls: number; cost: number }> = {};
    for (const r of store.usage) {
      if (!byProvider[r.provider]) byProvider[r.provider] = { calls: 0, cost: 0 };
      byProvider[r.provider].calls++;
      byProvider[r.provider].cost += r.totalCostUsd;
    }
    return c.json(byProvider);
  });

  app.get('/api/usage/recent', (c) => {
    const store = getStore();
    const period = c.req.query('period') || 'month';
    const limit = parseInt(c.req.query('limit') || '100', 10);
    const now = new Date();
    let cutoff: Date;
    if (period === 'today') {
      cutoff = new Date(now); cutoff.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7);
    } else if (period === 'month') {
      cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1);
    } else {
      cutoff = new Date(0);
    }
    const filtered = store.usage
      .filter((r) => new Date(r.timestamp) >= cutoff)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
    return c.json(filtered);
  });
}
