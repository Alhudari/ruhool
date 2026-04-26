import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { dispatchHierarchical, type DispatcherLLM } from '../services/dispatch/index.js';
import { auditLog } from '../services/audit-log.js';
import { rateLimit } from '../middleware/rate-limit.js';
import type { StoreData } from '../store/types.js';
import type { OrgResolved } from '../prompts/hierarchy.js';
import { BUILTIN_AGENTS } from '../state/builtin-agents.js';
import { shouldInjectReportActions, REPORT_ACTIONS_PROMPT, buildReportsContextBlock } from '../services/chat/report-actions.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Wrap a DispatcherLLM so that every `callSystemMessage` call has the
 * REPORT_ACTIONS_PROMPT appended to its system prompt when the store has
 * active reports — the same injection that chat.ts applies via the Proxy
 * on `builtinSystemPrompts`. Keeps the dispatcher itself store-agnostic.
 */
function wrapLLMWithReportActions(llm: DispatcherLLM, getStore: () => StoreData): DispatcherLLM {
  return {
    callSystemMessage(system, userMessage, opts) {
      const store = getStore();
      const enrichedSystem = shouldInjectReportActions(store)
        ? system + REPORT_ACTIONS_PROMPT + buildReportsContextBlock(store)
        : system;
      return llm.callSystemMessage(enrichedSystem, userMessage, opts);
    },
  };
}

export interface DispatchRoutesDeps {
  getStore: () => StoreData;
  saveStore?: () => void;
  dataRoot: string;
  logger?: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void };
  getLLM: () => DispatcherLLM | null;
}

const dispatchSchema = z.object({
  message: z.string().trim().min(1).max(8000),
  language: z.enum(['ar', 'en']).optional(),
  conversationId: z.string().optional(),
  /** Round 5: which CEO the user is addressing — lets us stamp the new
   *  conversation with the right workspaceId when the client didn't
   *  supply one. */
  targetAgentId: z.enum(['manager', 'doctor']).optional(),
  workspaceId: z.string().optional(),
});

// Round 3+: default ON. Set ENABLE_HIERARCHICAL_DISPATCH=false to opt out.
function isEnabled(): boolean {
  const v = process.env.ENABLE_HIERARCHICAL_DISPATCH;
  if (v === 'false') return false;
  return true;
}

async function loadOrgResolved(dataRoot: string, store: StoreData): Promise<OrgResolved | null> {
  const p = path.join(dataRoot, 'agent-org.json');
  if (!fs.existsSync(p)) return null;
  let raw: {
    ceo: string;
    departments: Array<{ id: string; label?: { ar: string; en: string }; manager: string; workers: string[] }>;
  };
  try {
    raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }

  const overrides = (store as { agentNameOverrides?: Record<string, { en: string; ar: string }> }).agentNameOverrides ?? {};
  const resolveName = (id: string): { nameAr: string; nameEn: string } => {
    const override = overrides[id];
    if (override) return { nameAr: override.ar, nameEn: override.en };
    const b = BUILTIN_AGENTS.find((a) => a.id === id);
    if (b) return { nameAr: b.name.ar, nameEn: b.name.en };
    return { nameAr: id, nameEn: id };
  };

  return {
    ceo: { id: raw.ceo, ...resolveName(raw.ceo) },
    departments: raw.departments.map((d) => ({
      id: d.id,
      labelAr: d.label?.ar ?? d.id,
      labelEn: d.label?.en ?? d.id,
      manager: { id: d.manager, ...resolveName(d.manager) },
      workers: d.workers.map((w) => ({ id: w, ...resolveName(w) })),
    })),
  };
}

export function registerDispatchRoutes(app: Hono, deps: DispatchRoutesDeps): void {
  // Configuration probe: is the feature usable?
  app.get('/api/dispatch/config', (c) => {
    const limits = (deps.getStore() as unknown as { limits?: { hierarchicalDispatchUsd?: number; dispatchMaxFanout?: number } }).limits ?? {};
    return c.json({
      enabled: isEnabled(),
      budgetUsd: limits.hierarchicalDispatchUsd ?? 0.5,
      maxFanout: limits.dispatchMaxFanout ?? 3,
    });
  });

  // 6 burst, ~10/min refill — LLM calls are expensive; prevent accidental
  // client loops from racking up cost.
  const dispatchChatLimit = rateLimit({ capacity: 6, refillPerSec: 10 / 60 });

  // Non-streaming one-shot dispatch. Returns the full DispatchResult.
  // Used by the frontend's chat surface when the flag is on and the
  // user is talking to the CEO (`manager`).
  app.post('/api/dispatch/chat', dispatchChatLimit, async (c) => {
    if (!isEnabled()) return c.json({ error: 'dispatch disabled', messageAr: 'الإسناد الهرمي غير مفعّل' }, 404);
    const raw = await c.req.json().catch(() => null);
    const parsed = dispatchSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);

    const llm = deps.getLLM();
    if (!llm) {
      return c.json({ error: 'no LLM provider configured', messageAr: 'لا يوجد مزوّد LLM مُفعّل' }, 503);
    }

    const dispatchId = crypto.randomUUID();
    const store = deps.getStore() as unknown as {
      conversations?: Array<Record<string, unknown>>;
      messages?: Array<Record<string, unknown>>;
      activeWorkspaceId?: string;
    };
    const targetAgent = parsed.data.targetAgentId ?? 'manager';
    const resolvedWorkspace = parsed.data.workspaceId
      ?? store.activeWorkspaceId
      ?? (targetAgent === 'doctor' ? 'life' : 'phd');

    // Ensure a conversation exists so the dispatch chain has somewhere
    // to live. If the client didn't pass one, create on the fly.
    let conversationId = parsed.data.conversationId;
    if (!conversationId) {
      conversationId = crypto.randomUUID();
      if (!Array.isArray(store.conversations)) store.conversations = [];
      store.conversations.push({
        id: conversationId,
        title: parsed.data.message.slice(0, 60),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agentId: targetAgent,
        participants: [targetAgent],
        workspaceId: resolvedWorkspace,
      });
    }

    // Persist the user message first so the scrollback is coherent.
    if (Array.isArray(store.messages)) {
      store.messages.push({
        id: crypto.randomUUID(),
        conversationId,
        createdAt: new Date().toISOString(),
        role: 'user',
        content: parsed.data.message,
        workspaceId: resolvedWorkspace,
      });
    }

    // Helper to persist each dispatch step as a conversation message so
    // the user sees the full chain scrollback, not just the final reply.
    const appendMessage = (fields: Record<string, unknown>) => {
      if (!Array.isArray(store.messages)) return;
      store.messages.push({
        id: crypto.randomUUID(),
        conversationId,
        createdAt: new Date().toISOString(),
        role: 'assistant',
        workspaceId: resolvedWorkspace,
        ...fields,
      });
    };

    let result;
    try {
    result = await dispatchHierarchical(
      {
        dispatchId,
        userMessage: parsed.data.message,
        language: parsed.data.language ?? 'ar',
        conversationId,
      },
      {
        llm: wrapLLMWithReportActions(llm, deps.getStore),
        loadOrg: () => loadOrgResolved(deps.dataRoot, deps.getStore()),
        getLimits: () => {
          const limits = (deps.getStore() as unknown as { limits?: { hierarchicalDispatchUsd?: number; dispatchMaxFanout?: number } }).limits ?? {};
          return {
            hierarchicalDispatchUsd: limits.hierarchicalDispatchUsd ?? 0.5,
            dispatchMaxFanout: limits.dispatchMaxFanout ?? 3,
          };
        },
        auditLog: (entry) => auditLog(entry),
        logger: deps.logger,
        onStep: (step) => {
          switch (step.kind) {
            case 'dept-selected':
              appendMessage({
                agentId: step.ceo,
                content: step.reason || (parsed.data.language === 'ar' ? `أسندت إلى قسم ${step.dept}.` : `Delegated to ${step.dept}.`),
                dispatchId: step.dispatchId,
                dispatchStep: 'dept-selected',
                kind: 'progress',
              });
              break;
            case 'worker-output':
              appendMessage({
                agentId: step.workerId,
                content: step.text,
                dispatchId: step.dispatchId,
                dispatchStep: 'worker',
                tokensIn: step.tokensIn,
                tokensOut: step.tokensOut,
                costUsd: step.costUsd,
              });
              break;
            case 'worker-failed':
              appendMessage({
                agentId: step.workerId,
                content: step.error.slice(0, 500),
                dispatchId: step.dispatchId,
                dispatchStep: 'worker',
                kind: 'progress',
              });
              break;
            case 'synthesis':
              appendMessage({
                agentId: step.deptManager,
                content: step.text,
                dispatchId: step.dispatchId,
                dispatchStep: 'synthesis',
                dispatchChain: step.chain,
                tokensIn: step.totalTokensIn,
                tokensOut: step.totalTokensOut,
                costUsd: step.totalCostUsd,
              });
              break;
            default:
              break;
          }
        },
      },
    );

    } catch (err) {
      return c.json({ error: "dispatch failed", details: err instanceof Error ? err.message : String(err) }, 500);
    }
    deps.saveStore?.();
    return c.json({ ...result, conversationId });
  });

  // SSE streaming variant — emits chain events as the dispatcher progresses.
  // Useful when the UI wants to render the routing chain indicator live.
  app.get('/api/dispatch/stream', dispatchChatLimit, async (c) => {
    if (!isEnabled()) return c.json({ error: 'dispatch disabled' }, 404);
    const message = c.req.query('message') ?? '';
    const language = (c.req.query('language') === 'en' ? 'en' : 'ar') as 'ar' | 'en';
    if (!message.trim()) return c.json({ error: 'message required' }, 400);

    const llm = deps.getLLM();
    if (!llm) return c.json({ error: 'no LLM provider configured' }, 503);

    return streamSSE(c, async (stream) => {
      const dispatchId = crypto.randomUUID();
      await stream.writeSSE({ event: 'dispatch.start', data: JSON.stringify({ dispatchId }) });
      try {
        const result = await dispatchHierarchical(
          { dispatchId, userMessage: message, language },
          {
            llm: wrapLLMWithReportActions(llm, deps.getStore),
            loadOrg: () => loadOrgResolved(deps.dataRoot, deps.getStore()),
            getLimits: () => {
              const limits = (deps.getStore() as unknown as { limits?: { hierarchicalDispatchUsd?: number; dispatchMaxFanout?: number } }).limits ?? {};
              return {
                hierarchicalDispatchUsd: limits.hierarchicalDispatchUsd ?? 0.5,
                dispatchMaxFanout: limits.dispatchMaxFanout ?? 3,
              };
            },
            auditLog: (entry) => auditLog(entry),
            logger: deps.logger,
          },
        );
        await stream.writeSSE({ event: 'dispatch.done', data: JSON.stringify(result) });
      } catch (err) {
        await stream.writeSSE({
          event: 'dispatch.error',
          data: JSON.stringify({ error: err instanceof Error ? err.message : 'dispatch failed' }),
        });
      }
    });
  });
}
