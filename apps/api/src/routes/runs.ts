// Agent runs + task graph + mission-control snapshot — extracted from index.ts.
// Routes:
//   GET  /api/task-graph
//   POST /api/runs/start
//   GET  /api/runs/:id
//   GET  /api/runs
//   POST /api/runs/:id/abort
//   POST /api/runs/:id/inject
//   GET  /api/control/snapshot

import crypto from 'node:crypto';
import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';
import { buildTranscript, summarizeEvents } from '../services/events/event-bus.js';
import { recomputeTaskStatuses, readyTasks, type StoreLike as AgentOSStore } from '../agent-os.js';
import { runAgentLoop, type RunnerStoreLike } from '../agent-runner.js';

export interface RunsRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  taskStore: Map<string, { query: string; status: string; progress: number; updatedAt: string }>;
  logger: { error: (msg: string, err?: unknown) => void };
}

export function registerRunsRoutes(app: Hono, deps: RunsRoutesDeps): void {
  const { getStore, saveStore, taskStore, logger } = deps;

  app.get('/api/task-graph', (c) => {
    const store = getStore();
    recomputeTaskStatuses(store as unknown as AgentOSStore);
    return c.json({ tasks: store.tasks, ready: readyTasks(store as unknown as AgentOSStore).map((t) => t.id) });
  });

  // Run an agent loop — kicks off a goal and returns a runId; status polled via /api/runs/:id
  app.post('/api/runs/start', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ conversationId?: string; goal: string; rootAgent?: string; maxSteps?: number; maxTokens?: number }>();
    if (!body.goal) return c.json({ error: 'goal required' }, 400);
    const convId = body.conversationId || crypto.randomUUID();
    if (!body.conversationId) {
      store.conversations.push({
        id: convId, title: body.goal.slice(0, 80),
        language: /[\u0600-\u06FF]/.test(body.goal) ? 'ar' : 'en', archived: false,
        agentId: body.rootAgent || 'manager',
        participants: [body.rootAgent || 'manager'],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      saveStore();
    }
    const runPromise = runAgentLoop(
      { conversationId: convId, goal: body.goal, rootAgent: body.rootAgent || 'manager', maxSteps: body.maxSteps, maxTokens: body.maxTokens },
      {
        store: store as unknown as RunnerStoreLike,
        saveStore,
        runOneStep: async (args) => {
          const url = 'http://localhost:' + ((store as unknown as { __apiPort?: number }).__apiPort || 3001) + '/api/chat';
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              conversationId: args.conversationId,
              message: args.message,
              agentId: args.agentId,
              chainDepth: args.chainDepth,
              skipPlayMaker: args.skipPlayMaker,
            }),
          });
          if (!res.ok || !res.body) throw new Error(`Step HTTP ${res.status}`);
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let text = '';
          let nextAgent: string | null = null;
          let tokensUsed = 0;
          let needsInput: string | undefined;
          let doneFlag = false;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            let currentEvent = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) currentEvent = line.slice(7).trim();
              else if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                try {
                  const data = JSON.parse(dataStr);
                  if (currentEvent === 'text' && data.content) text += data.content;
                  else if (currentEvent === 'usage') tokensUsed = (data.inputTokens || 0) + (data.outputTokens || 0);
                  else if (currentEvent === 'next_agent_queued' && data.agentId) nextAgent = data.agentId;
                  else if (currentEvent === 'actions_executed' && Array.isArray(data.actions)) {
                    for (const a of data.actions) {
                      if (a.kind === 'run_needs_input') needsInput = a.prompt;
                      if (a.kind === 'run_done') doneFlag = true;
                      if (a.kind === 'run_next' && !nextAgent) nextAgent = a.agentId;
                    }
                  }
                } catch { /* ignore non-JSON */ }
              }
            }
          }
          return { text, nextAgent, tokensUsed, needsInput, done: doneFlag };
        },
      }
    );
    runPromise.catch((err) => logger.error('[runner] unhandled', err));
    await new Promise((r) => setTimeout(r, 10));
    const run = (store.agentRuns || [])[0];
    return c.json({ runId: run?.id, conversationId: convId });
  });

  app.get('/api/runs/:id', (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const run = (store.agentRuns || []).find((r) => r.id === id);
    if (!run) return c.json({ error: 'not found' }, 404);
    return c.json(run);
  });

  // C-1: Transcript endpoint — Claude Managed Agents parity
  app.get('/api/runs/:id/transcript', (c) => {
    const store = getStore();
    const run = (store.agentRuns || []).find((r) => r.id === c.req.param('id'));
    if (!run) return c.json({ error: 'not found' }, 404);

    const events = run.events ?? [];
    const text = events.length > 0 ? buildTranscript(events) : '[no events recorded]';
    const summary = events.length > 0 ? summarizeEvents(events) : null;

    // Also include conversation messages for full picture
    const messages = store.messages
      .filter((m) => m.conversationId === run.conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((m) => ({ role: m.role, agentId: m.agentId, content: m.content.slice(0, 2000), createdAt: m.createdAt }));

    c.header('Cache-Control', 'private, no-cache');
    return c.json({ runId: run.id, status: run.status, transcript: text, events, messages, summary });
  });

  app.get('/api/runs', (c) => {
    const store = getStore();
    return c.json({ runs: store.agentRuns || [] });
  });

  app.post('/api/runs/:id/abort', (c) => {
    const store = getStore();
    const run = (store.agentRuns || []).find((r) => r.id === c.req.param('id'));
    if (!run) return c.json({ error: 'not found' }, 404);
    if (run.status === 'running') {
      run.status = 'aborted';
      run.endedAt = new Date().toISOString();
      saveStore();
    }
    return c.json({ ok: true, status: run.status });
  });

  app.post('/api/runs/:id/inject', async (c) => {
    const store = getStore();
    const run = (store.agentRuns || []).find((r) => r.id === c.req.param('id'));
    if (!run) return c.json({ error: 'not found' }, 404);
    const body = await c.req.json<{ message: string }>();
    if (!body.message) return c.json({ error: 'message required' }, 400);
    store.messages.push({
      id: crypto.randomUUID(), conversationId: run.conversationId,
      role: 'user', content: `[تدخّل المستخدم] ${body.message}`,
      createdAt: new Date().toISOString(),
    });
    saveStore();
    return c.json({ ok: true });
  });

  app.get('/api/control/snapshot', (c) => {
    const store = getStore();
    recomputeTaskStatuses(store as unknown as AgentOSStore);
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const allRuns = (store.agentRuns || []).slice(0, 50);
    const activeRuns = allRuns.filter((r) => r.status === 'running' || r.status === 'waiting_user');
    const recentRuns = allRuns.filter((r) => new Date(r.startedAt).getTime() > dayAgo).slice(0, 20);

    const tasksByStatus: Record<string, unknown[]> = { running: [], ready: [], blocked: [], done_today: [] };
    for (const t of store.tasks) {
      if (t.completed) {
        if (t.completedAt && new Date(t.completedAt).getTime() > dayAgo) tasksByStatus.done_today.push(t);
      } else if (t.graphStatus === 'ready') tasksByStatus.ready.push(t);
      else if (t.graphStatus === 'blocked') tasksByStatus.blocked.push(t);
      else if (t.graphStatus === 'running') tasksByStatus.running.push(t);
    }

    const bgResearch: Array<{ id: string; query: string; status: string; progress: number; updatedAt: string }> = [];
    for (const [id, task] of taskStore.entries()) {
      bgResearch.push({ id, query: task.query, status: task.status, progress: task.progress, updatedAt: task.updatedAt });
    }

    const recentActivity = (store.activityLog || [])
      .filter((a) => new Date(a.timestamp).getTime() > hourAgo)
      .slice(-40)
      .reverse();

    const liveConvs = store.conversations
      .filter((cv) => !cv.archived && new Date(cv.updatedAt).getTime() > hourAgo)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10)
      .map((cv) => {
        const msgs = store.messages.filter((m) => m.conversationId === cv.id);
        const lastMsg = msgs[msgs.length - 1];
        const participants = (cv as { participants?: string[] }).participants || [];
        return {
          id: cv.id, title: cv.title, participants,
          messageCount: msgs.length,
          lastAt: cv.updatedAt,
          lastAgent: lastMsg?.agentId,
          lastPreview: lastMsg?.content?.slice(0, 120) || '',
        };
      });

    const alerts = (store.watcherAlerts || []).filter((a) => !a.resolvedAt).slice(0, 20);

    const stats = {
      activeRuns: activeRuns.length,
      pendingTasks: tasksByStatus.ready.length + tasksByStatus.blocked.length,
      tasksDoneToday: tasksByStatus.done_today.length,
      bgResearchRunning: bgResearch.filter((t) => t.status !== 'complete' && t.status !== 'failed').length,
      activeConversations: liveConvs.length,
      unresolvedAlerts: alerts.length,
    };

    return c.json({ stats, activeRuns, recentRuns, tasksByStatus, bgResearch, recentActivity, liveConvs, alerts });
  });
}
