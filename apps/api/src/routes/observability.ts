import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';

export type ObservabilityDeps = {
  getStore: () => StoreData;
};

export function registerObservabilityRoutes(app: Hono, deps: ObservabilityDeps): void {
  const { getStore } = deps;

  // C-8: GET /api/observability/stats
  app.get('/api/observability/stats', (c) => {
    const store = getStore();
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    // Runs stats
    const runs = store.agentRuns ?? [];
    const runStats = {
      total: runs.length,
      running: runs.filter(r => r.status === 'running').length,
      succeeded: runs.filter(r => r.status === 'done').length,
      failed: runs.filter(r => r.status === 'failed').length,
      last24h: runs.filter(r => new Date(r.startedAt).getTime() > now - DAY_MS).length,
    };

    // Agent stats from activity log
    const agentStats: Record<string, { calls: number; errors: number; totalCostUsd: number }> = {};
    for (const entry of (store.activityLog ?? []).slice(-500)) {
      if (!entry.agentId) continue;
      if (!agentStats[entry.agentId]) agentStats[entry.agentId] = { calls: 0, errors: 0, totalCostUsd: 0 };
      agentStats[entry.agentId].calls++;
      if (entry.type === 'error') agentStats[entry.agentId].errors++;
    }

    // Task stats
    const tasks = store.agentTasks ?? [];
    const taskStats = {
      queued: tasks.filter(t => t.status === 'queued' && !t.deletedAt).length,
      running: tasks.filter(t => t.status === 'running' && !t.deletedAt).length,
      done: tasks.filter(t => t.status === 'done').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      avgRetryCount: tasks.length > 0
        ? tasks.reduce((s, t) => s + (t.retryCount ?? 0), 0) / tasks.length
        : 0,
    };

    // Pipeline stats
    const pipelines = store.agentPipelines ?? [];
    const pipelineStats = {
      active: pipelines.filter(p => p.status === 'running' && !p.deletedAt).length,
      completed: pipelines.filter(p => p.status === 'done').length,
      partialFailure: pipelines.filter(p => p.status === 'partial-failure').length,
      scheduled: pipelines.filter(p => p.status === 'scheduled').length,
    };

    // Budget
    const budget = (store as unknown as { budget?: { monthlyBudget?: number } }).budget;
    const usageToday = (store.usage ?? [])
      .filter(u => new Date(u.timestamp).getTime() > now - DAY_MS)
      .reduce((s, u) => s + (u.totalCostUsd ?? 0), 0);

    // Entity memory stats
    const entityStats = {
      total: (store.entityMemory ?? []).length,
      byType: (store.entityMemory ?? []).reduce((acc, e) => {
        acc[e.entityType] = (acc[e.entityType] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    // Error codes from recent activity
    const recentErrors = (store.activityLog ?? [])
      .filter(e => e.type === 'error')
      .slice(-20)
      .map(e => ({ action: e.action, details: e.details.slice(0, 100), at: e.timestamp }));

    c.header('Cache-Control', 'private, max-age=10');
    return c.json({
      runs: runStats,
      agents: agentStats,
      tasks: taskStats,
      pipelines: pipelineStats,
      budget: {
        monthlyLimit: budget?.monthlyBudget ?? null,
        spentToday: usageToday,
      },
      entities: entityStats,
      recentErrors,
      generatedAt: new Date().toISOString(),
    });
  });

  // C-8: GET /api/observability/entities — entity memory browser
  app.get('/api/observability/entities', (c) => {
    const store = getStore();
    const typeFilter = c.req.query('type');
    const limit = parseInt(c.req.query('limit') ?? '50', 10);

    const entities = (store.entityMemory ?? [])
      .filter(e => !typeFilter || e.entityType === typeFilter)
      .sort((a, b) => b.importance - a.importance || new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
      .slice(0, limit);

    c.header('Cache-Control', 'private, max-age=30');
    return c.json({ entities, total: (store.entityMemory ?? []).length });
  });
}
