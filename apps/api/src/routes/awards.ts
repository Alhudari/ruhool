import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';

export interface AwardsRoutesDeps {
  getStore: () => StoreData;
}

/**
 * Awards — employee of day/month rankings computed live.
 */
export function registerAwardsRoutes(app: Hono, deps: AwardsRoutesDeps): void {
  const { getStore } = deps;

  app.get('/api/awards', (c) => {
    const store = getStore();
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const monthMs = 30 * dayMs;
    const ratings = store.messageRatings || [];
    const runs = store.agentRuns || [];

    type Score = { agentId: string; score: number; good: number; bad: number; runsCompleted: number; tasksCompleted: number };
    const computeScores = (sinceMs: number): Score[] => {
      const byAgent: Record<string, Score> = {};
      for (const r of ratings) {
        if (new Date(r.createdAt).getTime() < sinceMs) continue;
        const s = byAgent[r.agentId] || (byAgent[r.agentId] = { agentId: r.agentId, score: 0, good: 0, bad: 0, runsCompleted: 0, tasksCompleted: 0 });
        if (r.rating === 'good') { s.good++; s.score += 2; }
        if (r.rating === 'bad') { s.bad++; s.score -= 3; }
        if (r.userFollowUp === 'rephrased') s.score -= 1;
        if (r.userFollowUp === 'accepted') s.score += 0.5;
      }
      for (const run of runs) {
        if (new Date(run.startedAt).getTime() < sinceMs) continue;
        const s = byAgent[run.agentId] || (byAgent[run.agentId] = { agentId: run.agentId, score: 0, good: 0, bad: 0, runsCompleted: 0, tasksCompleted: 0 });
        if (run.status === 'done') { s.runsCompleted++; s.score += 3; }
        if (run.status === 'failed') s.score -= 2;
      }
      for (const t of store.tasks) {
        if (!t.completedAt) continue;
        if (new Date(t.completedAt).getTime() < sinceMs) continue;
        const aid = t.assignedAgent;
        if (!aid) continue;
        const s = byAgent[aid] || (byAgent[aid] = { agentId: aid, score: 0, good: 0, bad: 0, runsCompleted: 0, tasksCompleted: 0 });
        s.tasksCompleted++; s.score += 1;
      }
      return Object.values(byAgent).sort((a, b) => b.score - a.score);
    };

    const daily = computeScores(now - dayMs);
    const monthly = computeScores(now - monthMs);
    return c.json({
      employeeOfDay: daily[0] || null,
      employeeOfMonth: monthly[0] || null,
      dailyRanking: daily.slice(0, 10),
      monthlyRanking: monthly.slice(0, 10),
    });
  });
}
