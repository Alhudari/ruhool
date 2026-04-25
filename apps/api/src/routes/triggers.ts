import type { Hono } from 'hono';
import crypto from 'node:crypto';
import type { StoreData } from '../store/types.js';
import type { Phase2StoreLike, WorkflowTrigger } from '../phase2.js';
import type { RunnerStoreLike } from '../agent-runner.js';

export interface TriggersRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  createTrigger: (store: Phase2StoreLike, body: Omit<WorkflowTrigger, 'id' | 'createdAt' | 'fireCount'>) => WorkflowTrigger;
  runAgentLoop: (args: { conversationId: string; goal: string; rootAgent: string; maxSteps: number }, deps: {
    store: RunnerStoreLike;
    saveStore: () => void;
    runOneStep: (args: { conversationId: string; message: string; agentId: string; chainDepth: number }) => Promise<{ text: string; tokensUsed: number; done?: boolean; nextAgent?: string | null; needsInput?: string }>;
  }) => Promise<unknown>;
  logError: (msg: string, err: unknown) => void;
}

/**
 * Workflow triggers + inbound webhook receiver.
 */
export function registerTriggersRoutes(app: Hono, deps: TriggersRoutesDeps): void {
  const { getStore, saveStore, createTrigger, runAgentLoop, logError } = deps;

  app.get('/api/triggers', (c) => c.json({ triggers: getStore().workflowTriggers || [] }));

  app.post('/api/triggers', async (c) => {
    const store = getStore();
    const body = await c.req.json<Omit<WorkflowTrigger, 'id' | 'createdAt' | 'fireCount'>>();
    if (!body.name || !body.kind || !body.targetAgent) return c.json({ error: 'name, kind, targetAgent required' }, 400);
    const t = createTrigger(store as unknown as Phase2StoreLike, body);
    saveStore();
    return c.json({ trigger: t });
  });

  app.delete('/api/triggers/:id', (c) => {
    const store = getStore();
    if (!store.workflowTriggers) return c.json({ error: 'not found' }, 404);
    const idx = store.workflowTriggers.findIndex((t) => t.id === c.req.param('id'));
    if (idx < 0) return c.json({ error: 'not found' }, 404);
    store.workflowTriggers.splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });

  // Inbound webhook receiver — POST /api/triggers/webhook/:id
  app.post('/api/triggers/webhook/:id', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const trigger = (store.workflowTriggers || []).find((t) => t.id === id && t.enabled && t.kind === 'webhook');
    if (!trigger) return c.json({ error: 'trigger not found or disabled' }, 404);
    let payload: unknown;
    try { payload = await c.req.json(); } catch { payload = await c.req.text(); }

    trigger.lastFiredAt = new Date().toISOString();
    trigger.fireCount = (trigger.fireCount || 0) + 1;
    saveStore();

    const isArabic = /[\u0600-\u06FF]/.test(JSON.stringify(payload));
    const convId = crypto.randomUUID();
    store.conversations.push({
      id: convId, title: `Webhook: ${trigger.name}`,
      language: isArabic ? 'ar' : 'en', archived: false,
      agentId: trigger.targetAgent, participants: [trigger.targetAgent],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    saveStore();

    const goal = `${trigger.instructions || 'Handle the following incoming event:'}\n\n${typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2).slice(0, 4000)}`;
    runAgentLoop(
      { conversationId: convId, goal, rootAgent: trigger.targetAgent, maxSteps: 5 },
      {
        store: store as unknown as RunnerStoreLike,
        saveStore,
        runOneStep: async (args) => {
          const port = (store as unknown as { __apiPort?: number }).__apiPort || 3001;
          // F-013: forward auth so loopback works under production fail-closed
          const apiToken = process.env.RUHOOL_API_TOKEN;
          const headers: Record<string, string> = { 'content-type': 'application/json' };
          if (apiToken) headers['Authorization'] = `Bearer ${apiToken}`;
          const res = await fetch(`http://localhost:${port}/api/chat`, {
            method: 'POST', headers,
            body: JSON.stringify({ conversationId: args.conversationId, message: args.message, agentId: args.agentId, chainDepth: args.chainDepth, skipPlayMaker: true }),
          });
          const reader = res.body?.getReader();
          if (!reader) return { text: '', tokensUsed: 0 };
          const decoder = new TextDecoder();
          let buffer = ''; let text = ''; let tokensUsed = 0; let doneFlag = false; let nextAgent: string | null = null; let needsInput: string | undefined;
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
                try {
                  const d = JSON.parse(line.slice(6));
                  if (currentEvent === 'text' && d.content) text += d.content;
                  else if (currentEvent === 'usage') tokensUsed = (d.inputTokens || 0) + (d.outputTokens || 0);
                  else if (currentEvent === 'actions_executed' && Array.isArray(d.actions)) {
                    for (const a of d.actions) {
                      if (a.kind === 'run_done') doneFlag = true;
                      if (a.kind === 'run_next' && !nextAgent) nextAgent = a.agentId;
                      if (a.kind === 'run_needs_input') needsInput = a.prompt;
                    }
                  }
                } catch {}
              }
            }
          }
          return { text, tokensUsed, done: doneFlag, nextAgent, needsInput };
        },
      }
    ).catch((err) => logError('[trigger]', err));

    return c.json({ ok: true, conversationId: convId });
  });
}
