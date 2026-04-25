/**
 * Chat SSE routes — extracted from index.ts (REL-01 stage 2d final pass).
 *
 * Exposes:
 *   - POST /api/chat/detect-agent-names
 *   - POST /api/chat  (SSE streaming handler, includes AGT-05 live tool_use path)
 *
 * Behavior is preserved verbatim from the original inline handler. Deps are
 * threaded via an explicit bag so the handler has no module-level globals.
 */

import crypto from 'node:crypto';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Logger } from 'pino';
import { parseNaturalTime } from '../services/natural-time.js';
import { sanitizeUserInput } from '../services/security/sanitize-input.js';
import { flag } from '../services/flags.js';
import { shouldInjectReportActions, buildReportsContextBlock, REPORT_ACTIONS_PROMPT } from '../services/chat/report-actions.js';
import { wrapToolResult } from '../services/security/trust-wrap.js';
import { trimToTokenBudget, getContextWindow } from '../services/context/window.js';

import {
  parseAndExecuteActions,
  memoryList,
  AGENT_OS_PROMPT_ADDENDUM,
  type StoreLike as AgentOSStore,
} from '../agent-os.js';
import { PHASE2_PROMPT_ADDENDUM } from '../phase2.js';

import type {
  ApprovalRecord,
  ConvRecord,
  NotificationRecord,
  TaskItem,
  TaskRecord,
  StoreData,
} from '../store/types.js';
import { buildProjectContext } from './projects.js';
import type { SubscriptionRecord } from './subscriptions.js';
import type { UnifiedProvider } from '../services/llm/index.js';
import { AnthropicProvider } from '../services/llm/index.js';
import { BUILTIN_AGENTS } from '../state/builtin-agents.js';
import { AGENT_TOPICS } from '../state/builtin-prompts.js';
import {
  detectMention as _detectMention,
  detectAllMentions as _detectAllMentions,
  detectDirectiveMentions as _detectDirectiveMentions,
} from '../services/chat/mention.js';
import { getCachedResponse, setCacheEntry } from '../services/chat/response-cache.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { askPlayMaker as _askPlayMaker, type PlayMakerHint } from '../services/chat/play-maker.js';
import {
  parseTextMarkerDelegations,
  logDelegations,
  delegateToSpecialistTool,
  planAndRunWorkflowTool,
} from '../services/agents/manager.js';
import type { WorkflowOrchestrator } from '../services/workflow/orchestrator.js';
import { dispatch as specialistsDispatch, buildIdentityDirective } from '../services/agents/specialists.js';

type AnthropicCache = {
  current: AnthropicProvider | null;
};

export type ChatRoutesDeps = {
  getStore: () => StoreData;
  saveStore: () => void;
  logger: Logger;
  anthropicCache: AnthropicCache;
  pickProviderForModel: (model: string) => UnifiedProvider | null;

  // services / state
  builtinSystemPrompts: Record<string, string>;
  managerSystemPrompt: string;
  agentHeaders: Record<string, string>;
  agentDisplayNames: Record<string, string>;
  capabilityCheckers: Record<string, (key: string) => Promise<Record<string, { ok: boolean; message?: string }>>>;

  // chat helpers (factories already constructed in index.ts)
  parseArchitectActions: (response: string, agentId: string) => ApprovalRecord[];
  parseTaskActions: (response: string) => unknown[];
  executeTaskActions: (actions: unknown[]) => TaskItem[];
  parseNotifyActions: (response: string, agentId: string) => NotificationRecord[];
  parseReportActions?: (response: string) => unknown[];
  executeReportActions?: (actions: unknown[]) => Array<{ action: string; id?: string; name?: string; error?: string }>;
  autoTitleIfNeeded: (convId: string) => Promise<void> | void;
  autoSummarizeIfNeeded: (convId: string) => Promise<void> | void;
  extractGraphFromMessage: (convId: string, userMsgId: string, assistantMsgId: string) => Promise<void> | void;
  buildSubscriptionSnapshot: () => Promise<string>;

  // projects data dir (for file context injection)
  dataDir?: string;

  // runtime services
  runResearch: (taskId: string) => Promise<void> | void;
  getResearchQueue: () => { add: (name: string, data: unknown, opts: unknown) => unknown } | null;
  taskStore: { set: (id: string, task: TaskRecord) => void };

  // Phase 2 — workflow orchestrator (optional; when present, manager gets
  // the `plan_and_run_workflow` tool alongside `delegate_to_specialist`).
  workflowOrchestrator?: WorkflowOrchestrator;

  // activity logger
  logActivity: (
    type: string,
    title: string,
    description?: string,
    opts?: { agentId?: string; metadata?: Record<string, unknown> }
  ) => void;
};

// ─── Pure helpers (previously inline in index.ts) ──────────────────────
function normalizeArabic(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // tashkeel + tatweel
    .replace(/[\u0625\u0623\u0622\u0627]/g, '\u0627').replace(/\u0649/g, '\u064A').replace(/\u0629/g, '\u0647')
    .toLowerCase();
}

/**
 * Intent detection — INTENTIONALLY DEGRADED to 'manager' for all inputs.
 *
 * Rationale (2026-04-15 redesign): keyword-based intent routing has been the
 * root cause of multiple wrong-agent bugs, most notably the "@الراعي intercepted
 * by المصمم" symptom. Any Arabic message containing words like "وكيل", "بحث",
 * "قارن" etc. was silently rerouted away from الراعي before the manager's own
 * LLM + tool_use layer had any chance to decide.
 *
 * The WhatsApp-group redesign makes الراعي the ONLY default. If the user
 * doesn't @mention anyone, الراعي always receives the message and uses his
 * `delegate_to_specialist` / `plan_and_run_workflow` tools to hand off. Every
 * specialist reply is then a separate, authored message — not a smuggled
 * redirect.
 *
 * Kept as a function (not a constant) because several tests + selectModel()
 * still call it; returning 'manager' is the correct no-op behavior now.
 */
export function detectIntent(_message: string): string {
  return 'manager';
}

function selectModel(intent: string, messageLength: number): string {
  if (intent === 'background-research') return 'claude-sonnet-4-6';
  if (messageLength < 50 && (intent === 'manager')) return 'claude-haiku-4-5-20251001';
  if (intent === 'research') return 'claude-sonnet-4-6';
  if (intent === 'writing-critic') return 'claude-sonnet-4-6';
  if (intent === 'architect') return 'claude-sonnet-4-6';
  if (intent === 'content-creator') return 'claude-sonnet-4-6';
  if (intent === 'creative') return 'claude-sonnet-4-6';
  if (intent === 'tasks-agent') return 'claude-haiku-4-5-20251001';
  if (messageLength > 500) return 'claude-sonnet-4-6';
  if (intent === 'reading-helper') return 'claude-sonnet-4-6';
  if (intent === 'comparator') return 'claude-sonnet-4-6';
  return 'claude-haiku-4-5-20251001';
}

export function registerChatRoutes(app: Hono, deps: ChatRoutesDeps): void {
  const {
    getStore,
    saveStore,
    logger: bootLogger,
    anthropicCache,
    pickProviderForModel,
    builtinSystemPrompts: BUILTIN_SYSTEM_PROMPTS,
    managerSystemPrompt: MANAGER_SYSTEM_PROMPT,
    agentHeaders: AGENT_HEADERS,
    agentDisplayNames: AGENT_DISPLAY_NAMES,
    capabilityCheckers: CAPABILITY_CHECKERS,
    parseArchitectActions,
    parseTaskActions,
    executeTaskActions,
    parseNotifyActions,
    parseReportActions,
    executeReportActions,
    autoTitleIfNeeded,
    autoSummarizeIfNeeded,
    extractGraphFromMessage,
    buildSubscriptionSnapshot,
    runResearch,
    getResearchQueue,
    taskStore,
    logActivity,
  } = deps;

  const detectMention = (message: string) => _detectMention(message, getStore().customAgents || []);
  const detectAllMentions = (message: string) => _detectAllMentions(message, getStore().customAgents || []);
  const detectDirectiveMentions = (message: string) => _detectDirectiveMentions(message, getStore().customAgents || []);

  async function askPlayMaker(opts: Parameters<typeof _askPlayMaker>[0]): Promise<PlayMakerHint | null> {
    const store = getStore();
    const anthropicRow = store.providers.find((p) => p.type === 'anthropic' && p.enabled && p.apiKey);
    if (!anthropicRow?.apiKey) return null;
    if (!anthropicCache.current) {
      anthropicCache.current = new AnthropicProvider(anthropicRow.apiKey, anthropicRow.baseUrl || undefined);
    }
    return _askPlayMaker(opts, {
      provider: anthropicCache.current,
      systemPrompt: BUILTIN_SYSTEM_PROMPTS.playmaker || '',
      logger: bootLogger,
    });
  }

  app.post('/api/chat/detect-agent-names', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ text: string }>();
    const text = body.text || '';
    if (!text.trim()) return c.json({ matches: [] });
    const normText = normalizeArabic(text);
    const map: Array<{ name: string; norm: string; id: string }> = [];
    for (const a of BUILTIN_AGENTS) {
      map.push({ name: a.name.ar, norm: normalizeArabic(a.name.ar), id: a.id });
      if (a.name.en) {
        const en = a.name.en.replace(/\s*\(.+\)/, '').trim();
        map.push({ name: en, norm: en.toLowerCase(), id: a.id });
      }
    }
    for (const ca of (store.customAgents || []).filter((a) => !a.archived)) {
      map.push({ name: ca.name.ar, norm: normalizeArabic(ca.name.ar), id: 'custom-' + ca.id });
      if (ca.name.en) map.push({ name: ca.name.en, norm: ca.name.en.toLowerCase(), id: 'custom-' + ca.id });
    }
    const textWithoutAt = normText.replace(/@\S+/g, '');
    const matches: Array<{ name: string; id: string; reason?: string }> = [];
    const seen = new Set<string>();

    for (const { name, norm, id } of map) {
      if (norm.length < 3 || seen.has(id)) continue;
      if (textWithoutAt.includes(norm)) {
        matches.push({ name, id });
        seen.add(id);
      }
    }

    const topicMatches: Array<{ name: string; id: string; reason: string; topic: true }> = [];
    for (const [agentId, meta] of Object.entries(AGENT_TOPICS)) {
      if (seen.has(agentId)) continue;
      const hit = meta.keywords.find((kw) => textWithoutAt.includes(normalizeArabic(kw)));
      if (hit) {
        const builtin = BUILTIN_AGENTS.find((a) => a.id === agentId);
        if (builtin) {
          topicMatches.push({ name: builtin.name.ar, id: agentId, reason: meta.reason.ar, topic: true });
          seen.add(agentId);
        }
      }
    }

    return c.json({ matches, topicMatches });
  });

  const chatLimit = rateLimit({ capacity: 20, refillPerSec: 2 });

  app.post('/api/chat', chatLimit, async (c) => {
    const store = getStore();
    const body = await c.req.json<{
      conversationId?: string;
      message: string;
      model?: string;
      agentId?: string;
      context?: string;
      replyToMessageId?: string;
      chainDepth?: number;
      /** R12 — original @mention sequence replayed on follow-up turns
       *  so multi-agent chains longer than 2 hops keep the full list
       *  of targets across every server turn. */
      chainMentions?: string[];
      images?: Array<{ base64: string; mimeType: string }>;
      skipPlayMaker?: boolean;
      projectId?: string;
    }>();

    // BUG A/C FIX: derive CHAT_V2 ONCE at handler entry so every branch (cache,
    // multi-mention, main loop, fallbacks) uses the same gate. When v2 is on,
    // legacy events (`text`, `content`, `delegations`, `tool_result`) are
    // SUPPRESSED entirely — the client has no way to resolve the duplication
    // on its own without fragile ordering heuristics.
    const _headerOverrideV2 = c.req.header('x-ruhool-chat-v2') || c.req.header('X-Ruhool-Chat-V2');
    const CHAT_V2_GLOBAL =
      process.env.CHAT_V2 !== 'false'
      && process.env.CHAT_V2 !== '0'
      && _headerOverrideV2 !== '0'
      && _headerOverrideV2 !== 'false';

    // B-1: sanitize user input to block persona override attempts
    if (flag('INPUT_SANITIZER') && body.message) {
      body.message = sanitizeUserInput(body.message);
    }

    let convId = body.conversationId;
    bootLogger.info({ msg: 'chat-route-trace', step: 'entry', conversationId: convId || null, bodyAgentId: body.agentId || null, messageText: (body.message || '').slice(0, 80) }, 'chat-route-trace');

    // A-8: Smart Reminders — detect "ذكرني" / "remind me" before routing to agent
    const reminderRe = /^ذكرني\b|^remind me\b/i;
    if (reminderRe.test(body.message.trim())) {
      const msg = body.message.trim();
      // Extract time: last time token in message
      const scheduledFor = parseNaturalTime(msg);
      // Extract the reminder text: strip the time part
      const reminderText = msg
        .replace(/ذكرني\s*/i, '')
        .replace(/remind me\s*(to|that)?\s*/i, '')
        .replace(/بعد\s+\d+\s+ساعة|بعد\s+ساعتين|بعد\s+نصف\s+ساعة|بعد\s+\d+\s+دقيقة|بعد\s+يوم|غداً|غدا|الصبح|الصباح|الليل|in\s+\d+\s+hours?|in\s+\d+\s+min\w*|tomorrow/gi, '')
        .trim() || msg;

      const now = new Date().toISOString();
      const reminderTask = {
        id: crypto.randomUUID(),
        agentId: 'system',
        prompt: `reminder: ${reminderText}`,
        status: 'queued' as const,
        scheduledFor: scheduledFor ?? null,
        startedAt: null,
        completedAt: null,
        result: null,
        conversationId: convId ?? null,
        pipelineId: null,
        pipelineStepIndex: null,
        createdBy: 'user' as const,
        label: `تذكير: ${reminderText.slice(0, 60)}`,
        reportOnComplete: true,
        createdAt: now,
        updatedAt: now,
      };
      if (!store.agentTasks) store.agentTasks = [];
      store.agentTasks.push(reminderTask);
      saveStore();

      const isArabicMsg = /[؀-ۿ]/.test(body.message);
      const whenStr = scheduledFor
        ? new Date(scheduledFor).toLocaleString(isArabicMsg ? 'ar-SA' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })
        : (isArabicMsg ? 'الآن' : 'now');
      const ackText = isArabicMsg
        ? `حسناً، سأذكرك بـ"${reminderText.slice(0, 60)}" ${scheduledFor ? `في ${whenStr}` : 'الآن'} 🔔`
        : `Got it, I'll remind you "${reminderText.slice(0, 60)}" ${scheduledFor ? `at ${whenStr}` : 'now'} 🔔`;

      return streamSSE(c, async (stream) => {
        await stream.writeSSE({ event: 'conversation', data: JSON.stringify({ conversationId: convId ?? crypto.randomUUID(), agentId: 'system', participants: ['system'] }) });
        await stream.writeSSE({ event: 'text', data: JSON.stringify({ content: ackText }) });
        await stream.writeSSE({ event: 'done', data: '{}' });
      });
    }

    const mention = detectMention(body.message);
    bootLogger.info({ msg: 'chat-route-trace', step: 'after-mention', mentionAgentId: mention.agentId, conversationId: convId || null }, 'chat-route-trace');
    // If the client is replaying a chained turn, it passes the
    // original @mention list through `chainMentions` — otherwise
    // `detectAllMentions` re-parses the current message. This makes
    // chains longer than 2 hops possible: the server sees the full
    // original sequence on every turn, not just the new follow-up.
    const allMentioned = body.chainMentions && body.chainMentions.length > 0
      ? body.chainMentions
      : detectAllMentions(body.message);
    let messageForLLM = body.message;
    let detectedAgent: string;
    // isQuestionAboutOther was used by the former keyword-reroute guard — no longer needed.

    const hasImages = Array.isArray(body.images) && body.images.length > 0;

    let playmakerReplyToMessageId: string | undefined;
    void playmakerReplyToMessageId;
    if (!body.skipPlayMaker && !mention.agentId && !hasImages && body.conversationId) {
      const convHistory = store.messages
        .filter((m) => m.conversationId === body.conversationId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(-8);
      const participants = store.conversations.find((cv) => cv.id === body.conversationId)?.participants || ['manager'];
      if (convHistory.length >= 2) {
        const hint = await askPlayMaker({
          message: body.message,
          recentHistory: convHistory.map((m) => ({ role: m.role, content: m.content, agentId: m.agentId, id: m.id })),
          activeParticipants: participants,
          hasImages: false,
        });
        if (hint && (hint.confidence ?? 0) >= 0.6 && hint.targetAgents && hint.targetAgents.length > 0) {
          const picked = hint.targetAgents[0];
          const valid = BUILTIN_AGENTS.some((a) => a.id === picked) || picked.startsWith('custom-');
          if (valid) {
            body.agentId = picked;
            bootLogger.info(`[playmaker] \u2192 ${picked} (conf=${hint.confidence}, topic=${hint.topic})`);
          }
          if (hint.replyToMessageId && !body.replyToMessageId) {
            playmakerReplyToMessageId = hint.replyToMessageId;
            body.replyToMessageId = hint.replyToMessageId;
          }
        }
      }
    }

    if (mention.agentId === 'all') {
      detectedAgent = body.agentId || 'manager';
      messageForLLM = body.message;
    } else if (hasImages && !mention.agentId) {
      detectedAgent = body.agentId || 'manager';
      messageForLLM = body.message;
    } else if (mention.agentId) {
      detectedAgent = mention.agentId;
      messageForLLM = mention.cleanMessage || body.message;
    } else {
      // Redesign (2026-04-15): no keyword rerouting. With no @mention, the
      // manager (الراعي) is the default recipient and decides via tool_use
      // whether to delegate. If the caller explicitly supplied body.agentId
      // (e.g. a dedicated /agents/:id/chat page), honor it.
      detectedAgent = body.agentId || 'manager';
      bootLogger.info(`[ROUTE] mention=${mention.agentId || '-'} body.agentId=${body.agentId || '-'} \u2192 ${detectedAgent} (manager-default)`);
    }

    if (!convId) {
      const isArabic = /[\u0600-\u06FF]/.test(body.message);
      const conv: ConvRecord = {
        id: crypto.randomUUID(), title: body.message.slice(0, 100),
        language: isArabic ? 'ar' : 'en', archived: false,
        agentId: detectedAgent,
        participants: ['manager'],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        ...(body.projectId ? { projectId: body.projectId } : {}),
      } as ConvRecord & { projectId?: string };
      if (detectedAgent !== 'manager' && !conv.participants!.includes(detectedAgent)) {
        conv.participants!.push(detectedAgent);
      }
      store.conversations.push(conv);
      convId = conv.id;
    } else {
      const existingConv = store.conversations.find((cv) => cv.id === convId);
      if (existingConv) {
        if (!existingConv.agentId) existingConv.agentId = detectedAgent;
        if (!existingConv.participants) existingConv.participants = ['manager'];
        if (mention.agentId === 'all') {
          const allIds = ['manager', 'research', 'reading-helper', 'comparator', 'writing-critic', 'architect', 'content-creator'];
          for (const id of allIds) {
            if (!existingConv.participants.includes(id)) existingConv.participants.push(id);
          }
          for (const ca of (store.customAgents || [])) {
            const cid = 'custom-' + ca.id;
            if (!existingConv.participants.includes(cid)) existingConv.participants.push(cid);
          }
        } else if (mention.agentId && !existingConv.participants.includes(mention.agentId)) {
          existingConv.participants.push(mention.agentId);
        }
      }
    }
    bootLogger.info({ msg: 'chat-route-trace', step: 'after-agent-resolution', detectedAgent, conversationId: convId, mentionAgentId: mention.agentId, bodyAgentId: body.agentId || null }, 'chat-route-trace');
    const selectedModel = body.model || selectModel(detectedAgent, body.message.length);

    store.messages.push({
      id: crypto.randomUUID(), conversationId: convId, role: 'user',
      content: body.message, createdAt: new Date().toISOString(),
      agentId: detectedAgent,
      replyToMessageId: body.replyToMessageId,
    });
    saveStore();

    logActivity('chat', `\u0631\u0633\u0627\u0644\u0629 \u0645\u0646 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u2192 ${AGENT_DISPLAY_NAMES[detectedAgent] || detectedAgent}`,
      body.message.slice(0, 200), { agentId: detectedAgent, metadata: { conversationId: convId, model: selectedModel } });

    if (mention.agentId === 'all') {
      logActivity('system', `\u0627\u0644\u0631\u0627\u0639\u064A \u2192 \u0643\u0644 \u0627\u0644\u0630\u0648\u062F: \u0627\u0633\u062A\u062F\u0639\u0627\u0621 \u062C\u0645\u0627\u0639\u064A`, `\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 \u062C\u0645\u064A\u0639 \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0644\u0644\u0645\u062D\u0627\u062F\u062B\u0629`, { agentId: 'manager' });
    } else if (mention.agentId && mention.isSummon) {
      logActivity('system', `\u0627\u0644\u0631\u0627\u0639\u064A \u2192 ${AGENT_DISPLAY_NAMES[mention.agentId] || mention.agentId}: \u0627\u0633\u062A\u062F\u0639\u0627\u0621`, `\u062A\u0645 \u0627\u0633\u062A\u062F\u0639\u0627\u0621 \u0627\u0644\u0648\u0643\u064A\u0644 \u0644\u0644\u0645\u062D\u0627\u062F\u062B\u0629`, { agentId: mention.agentId });
    } else if (mention.agentId) {
      logActivity('system', `\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 @\u0630\u0643\u0631 ${AGENT_DISPLAY_NAMES[mention.agentId] || mention.agentId}`, `\u062A\u0648\u062C\u064A\u0647 \u0645\u0628\u0627\u0634\u0631 \u0639\u0628\u0631 @mention`, { agentId: mention.agentId });
    } else if (detectedAgent !== 'manager' && !body.agentId) {
      logActivity('system', `\u0627\u0644\u0631\u0627\u0639\u064A \u2192 ${AGENT_DISPLAY_NAMES[detectedAgent] || detectedAgent}: \u062A\u062D\u0648\u064A\u0644 \u062A\u0644\u0642\u0627\u0626\u064A`, `\u0643\u0634\u0641 \u0627\u0644\u0646\u064A\u0629: ${detectedAgent}`, { agentId: detectedAgent });
    }

    if (store.privacyMode === 'strict') {
      return c.json({ error: 'Privacy mode is Strict -- only local models allowed.' }, 403);
    }

    const anthropicRow = store.providers.find((p) => p.type === 'anthropic' && p.enabled);
    if (!anthropicRow?.apiKey) {
      return c.json({ error: 'No API provider configured. Add your API key in Settings.' }, 400);
    }

    if (!anthropicCache.current) {
      anthropicCache.current = new AnthropicProvider(anthropicRow.apiKey, anthropicRow.baseUrl || undefined);
    }

    if (detectedAgent === 'background-research') {
      const isArabic = /[\u0600-\u06FF]/.test(body.message);
      const taskId = crypto.randomUUID();
      const task: TaskRecord = {
        id: taskId, type: 'research', status: 'queued',
        query: body.message, depth: 'deep', language: isArabic ? 'ar' : 'en',
        progress: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      taskStore.set(taskId, task);

      logActivity('task', `Background research started`, task.query.slice(0, 200), { agentId: 'research', metadata: { taskId, depth: task.depth } });

      const rq = getResearchQueue();
      if (rq) {
        rq.add('research', { taskId }, { jobId: taskId });
      } else {
        setTimeout(() => { const p = runResearch(taskId); if (p && typeof p.catch === "function") void p.catch((err: unknown) => { console.error({ err, taskId }, "runResearch failed"); }); }, 0);
      }

      const responseText = isArabic
        ? `\u062A\u0645 \u0628\u062F\u0621 \u0627\u0644\u0628\u062D\u062B \u0627\u0644\u0639\u0645\u064A\u0642 \u0641\u064A \u0627\u0644\u062E\u0644\u0641\u064A\u0629.\n\n**\u0645\u0639\u0631\u0641 \u0627\u0644\u0645\u0647\u0645\u0629:** \`${taskId}\`\n\n\u0633\u064A\u0642\u0648\u0645 \u0639\u0628\u062F\u0627\u0646 \u0628\u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0645\u0648\u0636\u0648\u0639 \u0648\u062A\u062C\u0645\u064A\u0639 \u062A\u0642\u0631\u064A\u0631 \u0634\u0627\u0645\u0644. \u064A\u0645\u0643\u0646\u0643 \u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u062A\u0642\u062F\u0645.`
        : `Background research started.\n\n**Task ID:** \`${taskId}\`\n\nAbdan will analyze the topic and compile a comprehensive report. You can track the progress.`;

      store.messages.push({
        id: crypto.randomUUID(), conversationId: convId!,
        role: 'assistant', content: responseText, createdAt: new Date().toISOString(),
        agentId: 'research',
      });
      saveStore();

      return streamSSE(c, async (stream) => {
        const bgParticipants = store.conversations.find((cv) => cv.id === convId)?.participants || ['manager'];
        await stream.writeSSE({ event: 'conversation', data: JSON.stringify({ conversationId: convId, agentId: 'research', participants: bgParticipants }) });
        await stream.writeSSE({ event: 'text', data: JSON.stringify({ content: responseText }) });
        await stream.writeSSE({ event: 'task', data: JSON.stringify({ taskId, status: 'queued' }) });
        await stream.writeSSE({ event: 'done', data: '{}' });
      });
    }

    // C-5: token-based context window (replaces message-count guard)
    const history = store.messages.filter((m) => m.conversationId === convId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const chatMsgs: Array<{ role: string; content: string | Array<{ type: string; [k: string]: unknown }> }> = [];
    for (const m of history) {
      const last = chatMsgs[chatMsgs.length - 1];
      const content = (m === history[history.length - 1] && m.role === 'user' && mention.agentId)
        ? messageForLLM : m.content;
      if (last && last.role === m.role && typeof last.content === 'string' && typeof content === 'string') {
        last.content += '\n' + content;
      } else {
        chatMsgs.push({ role: m.role, content });
      }
    }
    while (chatMsgs.length > 0 && chatMsgs[0].role !== 'user') chatMsgs.shift();

    // C-5: trim to token budget based on model context window
    const contextWindow = getContextWindow(selectedModel || anthropicRow?.defaultModel || 'claude-sonnet-4-6');
    const { trimmed, droppedCount } = trimToTokenBudget(chatMsgs, contextWindow, 6_000);
    if (droppedCount > 0) {
      bootLogger.info({ droppedCount, contextWindow }, 'C-5: context trimmed to token budget');
      chatMsgs.length = 0;
      chatMsgs.push(...trimmed);

      // D-3: inject existing rolling context summary at top, then generate new one in background
      const existingConv = store.conversations.find(cv => cv.id === convId);
      if (existingConv?.rollingContext) {
        chatMsgs.unshift({
          role: 'user',
          content: `[ملخص المحادثة السابقة / Prior context summary: ${existingConv.rollingContext}]`,
        });
        // ensure first msg stays user
        while (chatMsgs.length > 1 && chatMsgs[0].role !== 'user') chatMsgs.shift();
      }

      // Generate new rolling summary in background (non-blocking)
      void (async () => {
        try {
          const haikuProvider = pickProviderForModel('claude-haiku-4-5-20251001');
          if (!haikuProvider || !convId) return;
          const droppedText = trimmed.slice(0, droppedCount)
            .map(m => `${m.role}: ${(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).slice(0, 300)}`)
            .join('\n');
          let summary = '';
          for await (const chunk of haikuProvider.chat({
            model: 'claude-haiku-4-5-20251001',
            systemPrompt: 'Summarize this conversation exchange in 2-3 sentences. Be concise and factual.',
            messages: [{ role: 'user', content: droppedText }],
          })) {
            if ((chunk as { type: string; content?: string }).type === 'text') {
              summary += (chunk as { content: string }).content;
            }
          }
          if (summary) {
            const conv = store.conversations.find(cv => cv.id === convId);
            if (conv) { conv.rollingContext = summary; conv.rollingContextAt = new Date().toISOString(); saveStore(); }
          }
        } catch { /* non-critical */ }
      })();
    }

    if (hasImages && chatMsgs.length > 0) {
      const lastIdx = chatMsgs.length - 1;
      const lastMsg = chatMsgs[lastIdx];
      if (lastMsg.role === 'user') {
        const textPart = typeof lastMsg.content === 'string' ? lastMsg.content : '';
        const blocks: Array<{ type: string; [k: string]: unknown }> = body.images!.map((img) => ({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType || 'image/jpeg',
            data: img.base64.replace(/^data:[^;]+;base64,/, ''),
          },
        }));
        if (textPart) blocks.push({ type: 'text', text: textPart });
        else blocks.push({ type: 'text', text: detectedAgent === 'fatin' ? '\u062D\u0644\u0651\u0644 \u0647\u0630\u0647 \u0627\u0644\u0635\u0648\u0631\u0629/\u0627\u0644\u0635\u0648\u0631 \u0648\u0627\u0642\u062A\u0631\u062D \u0625\u062C\u0631\u0627\u0621\u0627\u062A.' : 'Analyze this image.' });
        chatMsgs[lastIdx] = { role: 'user', content: blocks };
      }
    }
    const model = selectedModel || anthropicRow.defaultModel || 'claude-sonnet-4-6';

    const convRecord = store.conversations.find((cv) => cv.id === convId);
    const participants = convRecord?.participants || ['manager'];

    const cached = getCachedResponse(body.message, detectedAgent);
    if (cached) {
      // BUG-1 FIX: this branch used to emit legacy `text` unconditionally,
      // which duplicated with v2 bubbles. Check the env/header CHAT_V2 flag
      // (same derivation as below) and emit v2 events when on.
      // BUG A FIX: use the global derivation set at handler entry.
      const CHAT_V2_CACHED = CHAT_V2_GLOBAL;
      return streamSSE(c, async (stream) => {
        await stream.writeSSE({ event: 'conversation', data: JSON.stringify({ conversationId: convId, agentId: detectedAgent, participants }) });
        const header = AGENT_HEADERS[detectedAgent] || '';
        const cachedContent = header ? header + '\n\n' + cached.response : cached.response;
        const cachedMsgId = crypto.randomUUID();
        const cachedCreatedAt = new Date().toISOString();
        if (CHAT_V2_CACHED) {
          await stream.writeSSE({
            event: 'message.start',
            data: JSON.stringify({
              messageId: cachedMsgId,
              agentId: detectedAgent,
              agentDisplay: { ar: AGENT_DISPLAY_NAMES[detectedAgent] || detectedAgent, en: detectedAgent },
              kind: 'text',
              createdAt: cachedCreatedAt,
            }),
          });
          await stream.writeSSE({ event: 'message.delta', data: JSON.stringify({ messageId: cachedMsgId, text: cachedContent }) });
          await stream.writeSSE({
            event: 'message.done',
            data: JSON.stringify({
              messageId: cachedMsgId,
              agentId: detectedAgent,
              usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'cache' },
              artifacts: [],
            }),
          });
        } else {
          await stream.writeSSE({ event: 'text', data: JSON.stringify({ content: cachedContent }) });
        }
        store.messages.push({
          id: cachedMsgId, conversationId: convId!,
          role: 'assistant', content: cachedContent, createdAt: cachedCreatedAt,
          agentId: detectedAgent,
        });
        saveStore();
        await stream.writeSSE({ event: 'done', data: '{}' });
      });
    }

    // CHAT_V2 P1 feature flag (server-side). When ON, each delegated specialist's
    // output becomes its OWN assistant message row + emits `message.start`/`message.delta`/
    // `message.done` SSE events plus `participants.update` so the UI can render per-agent
    // bubbles (WhatsApp-group feel). Legacy events (`text`, `delegations`, `done`, etc.)
    // continue to emit ADDITIVELY so Wave D can migrate gracefully.
    //
    // Default ON (Wave B contract). Disable via env `CHAT_V2=false` or request header
    // `X-Ruhool-Chat-V2: 0` to force legacy-only emissions during incident rollback.
    // BUG A FIX: delegate to the single global derivation set at handler entry.
    const CHAT_V2 = CHAT_V2_GLOBAL;

    // CHAT_V2 P1 — multi-mention fast-path.
    // If the user @-mentioned multiple specialists (e.g. "@الباحث @المُلخِّص ما رأيكما"),
    // fan out a sequential dispatch to each specialist directly, each producing its
    // own message row + SSE `message.start`/`message.delta`/`message.done` triple and
    // a `participants.update`. This bypasses the manager LLM for deterministic group
    // replies. Legacy `text`/`done` events still fire for graceful UI migration.
    const multiMention = CHAT_V2 && !body.agentId && allMentioned.length > 1 && !hasImages;
    if (multiMention) {
      const modelForFanOut = body.model || selectModel('manager', body.message.length);
      const providerForFanOut = pickProviderForModel(modelForFanOut);
      if (providerForFanOut) {
        return streamSSE(c, async (stream) => {
          try {
            const convRec = store.conversations.find((cv) => cv.id === convId);
            if (convRec) {
              if (!convRec.participants) convRec.participants = ['manager'];
              if (!convRec.participantAgentIds) convRec.participantAgentIds = [...convRec.participants];
              for (const aid of allMentioned) {
                if (!convRec.participants.includes(aid)) convRec.participants.push(aid);
                if (!convRec.participantAgentIds.includes(aid)) convRec.participantAgentIds.push(aid);
              }
              saveStore();
            }
            const partsNow = convRec?.participants || ['manager'];
            await stream.writeSSE({ event: 'conversation', data: JSON.stringify({ conversationId: convId, agentId: 'manager', participants: partsNow }) });
            await stream.writeSSE({
              event: 'participants.update',
              data: JSON.stringify({
                conversationId: convId,
                participantAgentIds: convRec?.participantAgentIds || partsNow,
              }),
            });

            const priorMessages: Array<{ role: 'assistant' | 'user'; content: string; agent?: string; agentDisplay?: string; createdAt?: string }> = [];
            let roundN = 0;
            for (const specialistId of allMentioned) {
              roundN += 1;
              const msgId = crypto.randomUUID();
              const startedAt = new Date().toISOString();
              await stream.writeSSE({
                event: 'message.start',
                data: JSON.stringify({
                  messageId: msgId,
                  agentId: specialistId,
                  agentDisplay: { ar: AGENT_DISPLAY_NAMES[specialistId] || specialistId, en: specialistId },
                  kind: 'text',
                  replyToAgentId: 'manager',
                  createdAt: startedAt,
                }),
              });
              try {
                const result = await specialistsDispatch({
                  specialist: specialistId,
                  task: body.message,
                  priorMessages: [...priorMessages],
                  roundNumber: roundN,
                  deps: {
                    provider: providerForFanOut,
                    model: modelForFanOut,
                    logger: { info: (o, m) => bootLogger.info(o, m) },
                    logActivity: ({ from, to, task }) => {
                      logActivity('chat', `${AGENT_DISPLAY_NAMES[from] || from} \u2192 ${AGENT_DISPLAY_NAMES[to] || to}`, task.slice(0, 200), { agentId: to, metadata: { from, to, task: task.slice(0, 500), via: 'multi-mention' } });
                    },
                    from: 'manager',
                  },
                });
                store.messages.push({
                  id: msgId,
                  conversationId: convId!,
                  role: 'assistant',
                  content: result.output,
                  createdAt: startedAt,
                  agentId: specialistId,
                  kind: 'text',
                  replyToAgentId: 'manager',
                });
                saveStore();
                priorMessages.push({
                  role: 'assistant',
                  content: result.output,
                  agent: specialistId,
                  agentDisplay: AGENT_DISPLAY_NAMES[specialistId] || specialistId,
                });
                if (result.output) {
                  await stream.writeSSE({
                    event: 'message.delta',
                    data: JSON.stringify({ messageId: msgId, text: result.output }),
                  });
                  // BUG-1 FIX: legacy `text` additive emission removed — it
                  // produced a duplicate bubble on top of message.start/delta/done.
                }
                const costUsd = (() => {
                  try {
                    const u = result.usage as { inputTokens?: number; outputTokens?: number } | undefined;
                    return u ? providerForFanOut.estimateCost(u.inputTokens || 0, u.outputTokens || 0, modelForFanOut) : 0;
                  } catch { return 0; }
                })();
                await stream.writeSSE({
                  event: 'message.done',
                  data: JSON.stringify({
                    messageId: msgId,
                    agentId: specialistId,
                    usage: {
                      inputTokens: (result.usage as { inputTokens?: number } | undefined)?.inputTokens ?? 0,
                      outputTokens: (result.usage as { outputTokens?: number } | undefined)?.outputTokens ?? 0,
                      costUsd,
                      model: modelForFanOut,
                    },
                    artifacts: [],
                    durationMs: result.durationMs,
                  }),
                });
              } catch (err) {
                await stream.writeSSE({
                  event: 'error',
                  data: JSON.stringify({ messageId: msgId, error: err instanceof Error ? err.message : 'dispatch failed' }),
                });
              }
            }
            await stream.writeSSE({ event: 'done', data: '{}' });
          } catch (err) {
            await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: err instanceof Error ? err.message : 'fan-out failed' }) });
            await stream.writeSSE({ event: 'done', data: '{}' });
          }
        });
      }
    }

    return streamSSE(c, async (stream) => {
      let fullResponse = '';
      let streamBuffer = '';
      let doneSent = false;
      const startTime = Date.now();

      // Abort controller — cancelled when the client disconnects so LLM calls can stop early.
      const abortController = new AbortController();
      c.req.raw.signal?.addEventListener('abort', () => abortController.abort(), { once: true });

      // BUG B FIX: SSE keepalive. Browsers / proxies will drop an idle EventSource
      // after ~30s of silence, which surfaced as "Error: network error" when a
      // multi-round manager turn produced a long quiet period between tool_use
      // blocks (e.g. while Anthropic was still generating the 2nd specialist task).
      // Emit a `ping` every 15s so the connection stays warm.
      let keepaliveDone = false;
      const keepaliveTimer: NodeJS.Timeout = setInterval(() => {
        if (keepaliveDone) return;
        stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => { abortController.abort(); });
      }, 15_000);
      const stopKeepalive = () => { keepaliveDone = true; clearInterval(keepaliveTimer); };

      try {
        await stream.writeSSE({ event: 'conversation', data: JSON.stringify({ conversationId: convId, agentId: detectedAgent, participants }) });

        // R17 — prepend the same identity directive the dispatch path
        // uses so direct-chat (@specialist on the main /api/chat) gets
        // the same persona-bleed protection as manager-delegated calls.
        // Was: provider.chat was called with BUILTIN_SYSTEM_PROMPTS[id]
        // alone, so prior speakers' voices leaked into the reply.
        const identityDirective = buildIdentityDirective(detectedAgent);
        let activeSystemPrompt = identityDirective + '\n\n' + (BUILTIN_SYSTEM_PROMPTS[detectedAgent] || MANAGER_SYSTEM_PROMPT);

        if (detectedAgent === 'mushakhkhis') {
          try {
            const lines: string[] = [];
            lines.push('## \u0641\u062D\u0635 \u062D\u064A \u0644\u0644\u0645\u0641\u0627\u062A\u064A\u062D \u0648\u0627\u0644\u062E\u062F\u0645\u0627\u062A (\u0627\u0644\u0622\u0646)');
            lines.push('**\u0645\u0647\u0645 \u062C\u062F\u0627\u064B**: \u0639\u0646\u062F \u0631\u0624\u064A\u0629 "X remaining" \u2014 \u0647\u0630\u0627 \u064A\u0639\u0646\u064A \u0627\u0644\u0645\u062A\u0628\u0642\u064A (\u0642\u0644\u064A\u0644 = \u062E\u0637\u0631\u060C \u0643\u062B\u064A\u0631 = \u0622\u0645\u0646).');
            lines.push('\u0627\u062D\u0633\u0628 \u0646\u0633\u0628\u0629 \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0641\u0639\u0644\u064A\u0629: usage% = (limit - remaining) / limit \u00D7 100');
            lines.push('');
            const apiKeys = ((store as unknown as { apiKeys?: Record<string, string> }).apiKeys || {}) as Record<string, string>;
            const subs = (((store as unknown as { subscriptions?: SubscriptionRecord[] }).subscriptions || []) as SubscriptionRecord[]).filter((s) => s.linkedApiField);
            const checks = await Promise.all(
              Object.entries(CAPABILITY_CHECKERS).map(async ([field, checker]) => {
                const key = apiKeys[field];
                if (!key) return { field, caps: null };
                try { return { field, caps: await checker(key) }; }
                catch (e) { return { field, caps: { error: { ok: false, message: String(e).slice(0, 100) } } }; }
              })
            );
            for (const { field, caps } of checks) {
              if (!caps) { lines.push(`- \u26AA ${field}: \u063A\u064A\u0631 \u0645\u0636\u0627\u0641`); continue; }
              const ok = Object.values(caps).some((c) => c.ok);
              const emoji = ok ? '\u2705' : '\u274C';
              const sub = subs.find((s) => s.linkedApiField === field);
              let usagePart = '';
              if (ok && sub?.monthlyLimit) {
                for (const cap of Object.values(caps)) {
                  const m = cap.message?.match(/(\d+(?:[.,]\d+)*)\s*(?:characters?|credits?|tiles?|requests?)\s*remaining/i);
                  if (m) {
                    const remaining = parseFloat(m[1].replace(/,/g, ''));
                    const limit = sub.monthlyLimit;
                    const used = Math.max(0, limit - remaining);
                    const pctUsed = (used / limit) * 100;
                    const pctRemaining = (remaining / limit) * 100;
                    const status = pctUsed >= 90 ? '\uD83D\uDD34 \u062E\u0637\u0631' : pctUsed >= 70 ? '\uD83D\uDFE1 \u0627\u0646\u062A\u0628\u0627\u0647' : '\uD83D\uDFE2 \u0622\u0645\u0646';
                    usagePart = ` \u2014 used ${used.toLocaleString()}/${limit.toLocaleString()} (${pctUsed.toFixed(1)}% used, ${pctRemaining.toFixed(1)}% remaining) ${status}`;
                    break;
                  }
                }
              }
              for (const [cap, info] of Object.entries(caps)) {
                lines.push(`- ${emoji} ${field}.${cap}: ${info.ok ? '\u2713' : '\u2717'} ${info.message}${usagePart}`);
                usagePart = '';
              }
            }
            lines.push('\n## \u0645\u0632\u0648\u0651\u062F\u0648 \u0627\u0644\u0645\u0648\u062F\u064A\u0644\u0627\u062A');
            for (const p of (store.providers || [])) {
              const e = '\u2705\u2717\u26AA'[p.status === 'ok' ? 0 : p.status === 'failing' ? 1 : 2];
              lines.push(`- ${e} ${p.displayName} (${p.type}): ${p.status} \u2014 \u0622\u062E\u0631 \u0627\u062E\u062A\u0628\u0627\u0631 ${(p.lastTestAt || '?').slice(0, 10)}`);
            }
            lines.push('\n## \u0645\u0644\u0627\u062D\u0638\u0629 \u0628\u0646\u064A\u0648\u064A\u0629');
            lines.push('- \u0627\u0644\u0640chat handler \u064A\u0633\u062A\u062E\u062F\u0645 Anthropic \u0641\u0642\u0637 \u062D\u0627\u0644\u064A\u0627\u064B');
            lines.push('- \u0645\u0641\u0627\u062A\u064A\u062D OpenAI/Gemini \u0635\u062D\u064A\u062D\u0629 \u0644\u0643\u0646 \u0627\u0644\u0640chat \u0644\u0627 \u064A\u0648\u062C\u0651\u0647 \u0644\u0647\u0645 \u0628\u0639\u062F (\u064A\u062D\u062A\u0627\u062C \u062A\u0637\u0648\u064A\u0631 backend)');
            activeSystemPrompt += '\n\n' + lines.join('\n');
          } catch { /* ignore */ }
        }

        if (detectedAgent === 'analyst') {
          try {
            const snapshot = await buildSubscriptionSnapshot();
            activeSystemPrompt += '\n\n## \u0644\u0642\u0637\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0627\u0644\u062D\u0627\u0644\u064A\u0629 (\u062D\u0642\u0646 \u062A\u0644\u0642\u0627\u0626\u064A)\n' + snapshot;
          } catch { /* ignore */ }
        }

        try {
          const isManager = detectedAgent === 'manager';
          const allAgents = [
            ...BUILTIN_AGENTS.map((a) => ({ id: a.id, name: a.name.ar, role: a.description.ar, kind: 'built-in' as const })),
            ...((store.customAgents || []).filter((a) => !a.archived).map((a) => ({
              id: 'custom-' + a.id, name: a.name.ar, role: (a.systemPrompt || '').slice(0, 80), kind: (a as unknown as { expiresAt?: string }).expiresAt ? 'temp' as const : 'custom' as const
            }))),
          ];
          const apiKeys = ((store as unknown as { apiKeys?: Record<string, string> }).apiKeys || {}) as Record<string, string>;
          const connectedServices = Object.keys(apiKeys).filter((k) => apiKeys[k]);
          const providers = (store.providers || []).filter((p) => p.enabled);
          const builtinModels = ((store as unknown as { builtinAgentModels?: Record<string, string> }).builtinAgentModels || {}) as Record<string, string>;

          let ctx = '\n\n## \u0627\u0644\u0633\u064A\u0627\u0642 \u0627\u0644\u062D\u064A \u0644\u0644\u0645\u0646\u0635\u0629 (\u0645\u062D\u0642\u0648\u0646 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u2014 \u0644\u0627 \u062A\u062D\u0641\u0638\u0647 \u064A\u062F\u0648\u064A\u0627\u064B)\n';

          ctx += '\n### \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0627\u0644\u0646\u0634\u0637\u0648\u0646 (' + allAgents.length + ')\n';
          for (const a of allAgents) {
            const tag = a.kind === 'built-in' ? '\u2699\uFE0F' : a.kind === 'temp' ? '\u23F1\uFE0F' : '\u2728';
            const m = a.kind === 'built-in' ? (builtinModels[a.id] || '\u0627\u0641\u062A\u0631\u0627\u0636\u064A') : '';
            ctx += `- ${tag} **${a.name}** (id=${a.id})${m ? ` \u2014 \u0645\u0648\u062F\u064A\u0644: ${m}` : ''}\n`;
          }

          if (isManager) {
            ctx += '\n### \u0627\u0644\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u062E\u0627\u0631\u062C\u064A\u0629 \u0627\u0644\u0645\u0631\u0628\u0648\u0637\u0629 (' + connectedServices.length + ')\n';
            for (const s of connectedServices) ctx += `- \u2705 ${s}\n`;
            ctx += '\n### \u0645\u0632\u0648\u0651\u062F\u0648 \u0627\u0644\u0645\u0648\u062F\u064A\u0644\u0627\u062A (' + providers.length + ')\n';
            for (const p of providers) ctx += `- ${p.status === 'ok' ? '\uD83D\uDFE2' : '\uD83D\uDD34'} ${p.displayName} (${p.type}) \u2014 \u062D\u0627\u0644\u0629 ${p.status}\n`;

            const counts = {
              conversations: (store.conversations || []).length,
              tasks: (store.tasks || []).length,
              projects: ((store as unknown as { projects?: unknown[] }).projects || []).length,
              subscriptions: ((store as unknown as { subscriptions?: unknown[] }).subscriptions || []).length,
              renders: ((store as unknown as { renders?: unknown[] }).renders || []).length,
            };
            ctx += '\n### \u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A \u0633\u0631\u064A\u0639\u0629\n';
            for (const [k, v] of Object.entries(counts)) ctx += `- ${k}: ${v}\n`;
          }

          const conv = (store.conversations || []).find((cv: ConvRecord) => cv.id === convId);
          const partsHere = conv?.participants || ['manager'];
          const partNames = partsHere.map((p) => AGENT_DISPLAY_NAMES[p] || p);
          ctx += `\n### \u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0648\u0646 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0627\u0644\u0622\u0646\n${partNames.map((n) => '- ' + n).join('\n')}\n`;
          ctx += '\n**\u0642\u0648\u0627\u0639\u062F**:\n- \u0647\u0630\u0647 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u062D\u0642\u064A\u0642\u064A\u0629 \u0648\u0645\u062D\u062F\u0651\u062B\u0629 \u0627\u0644\u0622\u0646. \u0644\u0627 \u062A\u0642\u0644 "\u0644\u0645 \u064A\u064F\u0636\u0641" \u0623\u0648 "\u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F".\n- \u0623\u0646\u062A \u062A\u0639\u0631\u0641 \u0647\u0624\u0644\u0627\u0621 \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0641\u0639\u0644\u0627\u064B \u2014 \u0644\u0627 \u062D\u0627\u062C\u0629 \u0644\u0640"\u0625\u062E\u0628\u0627\u0631" \u0623\u062D\u062F \u0639\u0646\u0647\u0645.\n- \u0625\u0630\u0627 \u0623\u064F\u0636\u064A\u0641 \u0648\u0643\u064A\u0644 \u062C\u062F\u064A\u062F \u0644\u0627\u062D\u0642\u0627\u064B\u060C \u0633\u064A\u0638\u0647\u0631 \u0647\u0646\u0627 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0641\u064A \u0643\u0644 \u0645\u062D\u0627\u062F\u062B\u0629.';

          const projectId = (conv as { projectId?: string } | undefined)?.projectId;
          if (projectId) {
            const proj = (store.projects || []).find(p => p.id === projectId);
            if (proj) ctx += buildProjectContext(proj, deps.dataDir || '', detectedAgent);
          }

          activeSystemPrompt += ctx;
        } catch { /* ignore */ }

        // Inject PhD working schedule into research-related agents
        if (['research-companion', 'manager', 'research', 'reading-helper', 'writing-critic', 'comparator', 'mudawwin'].includes(detectedAgent)) {
          try {
            const { getOrCreateSchedule, buildScheduleContext } = await import('./phd-schedule.js');
            const sched = getOrCreateSchedule(store as unknown as import('../store/types.js').StoreData);
            activeSystemPrompt += buildScheduleContext(sched);
          } catch { /* ignore */ }
        }

        if (detectedAgent === 'mudawwin') {
          try {
            const { listNotes, readNote, listAllTasks } = await import('@ruhool/core');
            const { readAuditLog } = await import('../services/audit-log.js');
            const meetingPaths = await listNotes({ subPath: '01 PhD/01 Supervision/Supervision Interaction Points', recursive: false }).catch(() => [] as string[]);
            const meetings = await Promise.all(
              meetingPaths.map(async (p) => {
                try {
                  const n = await readNote(p);
                  return { name: n.name, date: n.frontmatter.date as string | undefined, summary: n.frontmatter.Summary as string | undefined, next: n.frontmatter.Next_Meeting as string | undefined };
                } catch { return null; }
              })
            );
            const valid = meetings.filter(Boolean) as Array<{ name: string; date?: string; summary?: string; next?: string }>;
            const sorted = valid.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
            const last = sorted[0];

            activeSystemPrompt += `\n\n## سياق الإشراف الحالي\n\n`;
            activeSystemPrompt += `**عدد الاجتماعات المسجلة**: ${valid.length}\n`;
            if (last) {
              activeSystemPrompt += `**آخر اجتماع**: #${last.name} في ${(last.date ?? '').slice(0, 10)}\n`;
              if (last.summary) activeSystemPrompt += `**ملخص آخر اجتماع**: ${String(last.summary).slice(0, 300)}\n`;
              if (last.next) activeSystemPrompt += `**الاجتماع القادم المخطط**: ${last.next}\n`;
            }
            activeSystemPrompt += `\n**رقم الاجتماع التالي المقترح**: ${valid.length + 1}\n`;

            // Recent activity since last meeting (papers added, tasks done)
            const phdTasks = await listAllTasks({ subPath: '01 PhD' }).catch(() => []);
            const done = phdTasks.filter((t: { done: boolean }) => t.done);
            activeSystemPrompt += `\n**النشاط منذ بدء البحث**:\n`;
            activeSystemPrompt += `- مهام مكتملة: ${done.length}\n`;
            activeSystemPrompt += `- مهام معلّقة: ${phdTasks.length - done.length}\n`;

            // Audit feed since last meeting — gives Mudawwin a precise log
            // of what happened with timestamps (papers synced, atomic notes
            // created/edited, sources added, etc.)
            const sinceIso = (last?.date && String(last.date)) || undefined;
            const audit = await readAuditLog({ limit: 100, sinceIso }).catch(() => []);
            if (audit.length > 0) {
              activeSystemPrompt += `\n**سجل النشاط على Obsidian منذ آخر اجتماع** (${audit.length} عملية):\n`;
              for (const e of audit.slice(0, 30)) {
                const t = e.ts.slice(0, 16).replace('T', ' ');
                activeSystemPrompt += `- [${t}] ${e.action}${e.path ? ` → ${e.path}` : ''}\n`;
              }
            }
          } catch { /* ignore */ }
        }

        if (detectedAgent === 'research-companion') {
          try {
            const { buildCompanionMemoryContext } = await import('./companion.js');
            const memCtx = buildCompanionMemoryContext(
              (store as unknown as { companionMemory?: import('../store/types.js').CompanionMemoryEntry[] }).companionMemory ?? []
            );
            if (memCtx) activeSystemPrompt += '\n\n' + memCtx;
            // Live vault context — graceful
            try {
              const { getVaultName, listTopLevelFolders, listAllTasks, listNotes } = await import('@ruhool/core');
              const vaultName = getVaultName();
              const topFolders = await listTopLevelFolders();
              const litNotes = await listNotes({ subPath: '01 PhD/02 Literature Review/Academic Literature', recursive: false }).catch(() => [] as string[]);
              const phdTasks = await listAllTasks({ subPath: '01 PhD' }).catch(() => []);
              const pending = phdTasks.filter((t: { done: boolean }) => !t.done);

              activeSystemPrompt += `\n\n## سياق Obsidian Vault الحقيقي (محدّث ${new Date().toISOString().slice(0, 10)})\n\n`;
              activeSystemPrompt += `**اسم Vault**: \`${vaultName}\`\n`;
              activeSystemPrompt += `**رابط فتح ملف**: \`obsidian://open?vault=${vaultName}&file=PATH\` — **يجب** ترميز المسافات بـ \`%20\` (مثال: \`01%20PhD/02%20Literature%20Review\`)\n\n`;

              if (topFolders.length > 0) {
                activeSystemPrompt += `**المجلدات الرئيسية في Vault** (المستخدم لديه هذه البنية فعلاً — لا تقترح إنشاء vault جديد):\n`;
                for (const f of topFolders) activeSystemPrompt += `- \`${f}\`\n`;
                activeSystemPrompt += `\n`;
              }

              if (litNotes.length > 0) {
                activeSystemPrompt += `**أحدث 10 مصادر أكاديمية** في \`01 PhD/02 Literature Review/Academic Literature\` (إجمالي: ${litNotes.length}):\n`;
                for (const n of litNotes.slice(-10).reverse()) {
                  const fileName = n.split('/').pop()?.replace(/\.md$/, '') ?? n;
                  activeSystemPrompt += `- ${fileName}\n`;
                }
                activeSystemPrompt += `\n`;
              }

              if (pending.length > 0) {
                activeSystemPrompt += `**${pending.length} مهام معلّقة في 01 PhD** (عيّنة):\n`;
                for (const t of pending.slice(0, 8)) {
                  activeSystemPrompt += `- [ ] ${t.text}${t.section ? ` _(in ${t.section})_` : ''} — في \`${t.notePath}\`\n`;
                }
                activeSystemPrompt += `\n`;
              }

              const meetings = ((store as unknown as { meetingSessions?: Array<{ id: string }> }).meetingSessions ?? []).length;
              const litSessions = ((store as unknown as { readingSessions?: Array<{ id: string }> }).readingSessions ?? []).length;
              activeSystemPrompt += `**حالة منصة رحول**:\n`;
              activeSystemPrompt += `- الاجتماعات المسجّلة في رحول: ${meetings}\n`;
              activeSystemPrompt += `- جلسات القراءة عبر المُلخِّص: ${litSessions}\n`;
              activeSystemPrompt += `\n`;

              activeSystemPrompt += `\n**روابط منصة رحول للإحالة المستخدم إليها**:\n`;
              activeSystemPrompt += `- لوحة الدكتوراه: \`/phd\`\n`;
              activeSystemPrompt += `- مكتبة Zotero: \`/zotero\`\n`;
              activeSystemPrompt += `- مساعد القراءة (المُلخِّص): \`/shwasha\`\n`;
              activeSystemPrompt += `- الاجتماعات: \`/meetings\`\n`;
              activeSystemPrompt += `- المهام: \`/tasks\`\n`;
            } catch { /* vault not accessible — skip */ }

            // ── Zotero context for Rumman — gives him real library awareness
            // so he can suggest from existing items + know reading status. Cheap:
            // 1 Zotero call per Rumman turn, cached server-side via response-cache.
            try {
              const { zoteroListItemsRich, zoteroListCollections } = await import('@ruhool/core');
              const items = await zoteroListItemsRich(undefined, 200);
              const collections = await zoteroListCollections().catch(() => []);
              const total = items.length;
              const toRead = items.filter((i) => i.tags.some((t) => /^to.?read$/i.test(t))).length;
              const reading = items.filter((i) => i.tags.some((t) => /^reading$/i.test(t))).length;
              const read = items.filter((i) => i.tags.some((t) => /^read$/i.test(t))).length;
              const recent = [...items]
                .filter((i) => i.dateAdded)
                .sort((a, b) => (b.dateAdded ?? '').localeCompare(a.dateAdded ?? ''))
                .slice(0, 8);
              const topRated = items.filter((i) => i.rating >= 2).slice(0, 5);

              // B-2: Zotero data is external — wrap with trust="low"
              let zoteroBlock = `## مكتبة Zotero الفعلية\n\n`;
              zoteroBlock += `**الإحصائيات**:\n`;
              zoteroBlock += `- إجمالي المصادر: ${total}\n`;
              zoteroBlock += `- المجموعات: ${collections.length}\n`;
              zoteroBlock += `- للقراءة: ${toRead} | يقرأها: ${reading} | مقروءة: ${read}\n`;
              zoteroBlock += `- بدون تصنيف: ${total - toRead - reading - read}\n\n`;

              if (collections.length > 0) {
                zoteroBlock += `**المجموعات الموجودة**:\n`;
                for (const col of collections.slice(0, 15)) zoteroBlock += `- ${col.name}\n`;
                zoteroBlock += `\n`;
              }

              if (recent.length > 0) {
                zoteroBlock += `**أحدث ${recent.length} مصادر مُضافة**:\n`;
                for (const it of recent) {
                  zoteroBlock += `- "${it.title.slice(0, 100)}" (${it.year ?? 'n.d.'})${it.authors ? ` — ${it.authors.split(',')[0]}` : ''}${it.doi ? ` | DOI: ${it.doi}` : ''}\n`;
                }
                zoteroBlock += `\n`;
              }

              if (topRated.length > 0) {
                zoteroBlock += `**أوراق مُقيّمة عالياً (⭐⭐+)**:\n`;
                for (const it of topRated) {
                  zoteroBlock += `- ${'⭐'.repeat(it.rating)} "${it.title.slice(0, 80)}" (${it.year ?? 'n.d.'})\n`;
                }
                zoteroBlock += `\n`;
              }

              zoteroBlock += `**ملاحظة**: عند اقتراح ورقة، **ابحث في هذه القائمة أولاً** قبل اقتراح خارجية.\n`;
              activeSystemPrompt += '\n\n' + (flag('TOOL_TRUST_WRAP') ? wrapToolResult('zotero', zoteroBlock) : zoteroBlock);
            } catch (err) {
              activeSystemPrompt += `\n\n_⚠️ تعذّر الوصول إلى Zotero (${err instanceof Error ? err.message.slice(0, 100) : 'unknown'}). إذا سُئلت عن مكتبتي قل: "Zotero غير متاح حالياً، تأكد أن التطبيق مفتوح أو الاتصال بالـ Web API يعمل."_\n`;
            }
          } catch { /* ignore */ }
        }

        if (detectedAgent === 'tasks-agent') {
          try {
            const allLists = new Set<string>();
            for (const t of (store.tasks || [])) {
              if (t.list) allLists.add(t.list);
            }
            const libCats = ((store.libraryCategories || []) as Array<{ name: { ar: string } }>).map((c) => c.name.ar);
            activeSystemPrompt += '\n\n## \u0627\u0644\u062A\u0635\u0646\u064A\u0641\u0627\u062A \u0627\u0644\u0645\u0648\u062C\u0648\u062F\u0629 \u062D\u0627\u0644\u064A\u0627\u064B (\u0645\u0647\u0627\u0645)\n';
            activeSystemPrompt += allLists.size > 0
              ? Array.from(allLists).map((l) => `- ${l}`).join('\n')
              : '_(\u0644\u0627 \u062A\u0648\u062C\u062F \u062A\u0635\u0646\u064A\u0641\u0627\u062A \u0628\u0639\u062F \u2014 \u0625\u0630\u0627 \u0627\u062D\u062A\u062C\u062A \u062A\u0635\u0646\u064A\u0641\u0627\u064B \u062C\u062F\u064A\u062F\u0627\u064B\u060C \u0627\u0637\u0644\u0628 \u0645\u0648\u0627\u0641\u0642\u0629 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0623\u0648\u0644\u0627\u064B)_';
            if (libCats.length > 0) {
              activeSystemPrompt += `\n\n_\u0645\u0644\u0627\u062D\u0638\u0629: \u062A\u0635\u0646\u064A\u0641\u0627\u062A \u0627\u0644\u0645\u0643\u062A\u0628\u0629 (${libCats.join('\u060C ')}) \u0634\u064A \u0645\u062E\u062A\u0644\u0641 \u2014 \u0644\u0627 \u062A\u062E\u0644\u0637\u0647\u0627 \u0628\u062A\u0635\u0646\u064A\u0641\u0627\u062A \u0627\u0644\u0645\u0647\u0627\u0645._`;
            }
          } catch { /* ignore */ }
        }

        if (detectedAgent.startsWith('custom-')) {
          const customId = detectedAgent.replace('custom-', '');
          const customAgent = (store.customAgents || []).find((a) => a.id === customId);
          if (customAgent) activeSystemPrompt = customAgent.systemPrompt;
        }
        if (!BUILTIN_SYSTEM_PROMPTS[detectedAgent] && !detectedAgent.startsWith('custom-')) {
          const customAgent = (store.customAgents || []).find((a) => a.id === detectedAgent);
          if (customAgent) activeSystemPrompt = customAgent.systemPrompt;
        }

        // Response length directive — injected for all agents except clippy/playmaker
        if (detectedAgent !== 'clippy' && detectedAgent !== 'playmaker') {
          const rl = (store as unknown as { responseLength?: string }).responseLength ?? 'medium';
          if (rl === 'short') {
            activeSystemPrompt += '\n\n## تعليمات المستخدم: طول الرد\nأجب باختصار شديد — الحد الأقصى 3-4 جمل أو 5 نقاط. لا شرح مطوّل. الجوهر فقط.';
          } else if (rl === 'long') {
            activeSystemPrompt += '\n\n## تعليمات المستخدم: طول الرد\nأجب بتفصيل كامل — شرح شامل مع أمثلة وسياق وكل ما يلزم. لا تختصر.';
          }
          // 'medium' = default behaviour, no directive needed
        }

        if (body.context) {
          activeSystemPrompt += '\n\n[\u0633\u064A\u0627\u0642 \u0625\u0636\u0627\u0641\u064A \u0645\u0646 \u0627\u0644\u0648\u0627\u062C\u0647\u0629]\n' + body.context.replace(new RegExp('</?(?:system|prompt|instruction)[^>]*>', 'gi'), '').slice(0, 2000) + '\n';
        }

        try {
          const mem = memoryList(store as unknown as AgentOSStore, convId!);
          if (mem.length > 0) {
            const lines = mem.slice(-20).map((e) => `- ${e.key}: ${e.value}${e.agentId ? ` (by ${e.agentId})` : ''}`).join('\n');
            activeSystemPrompt += `\n\n## \u0630\u0627\u0643\u0631\u0629 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0645\u0634\u062A\u0631\u0643\u0629 (\u0644\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629)\n${lines}\n\n**\u0645\u0647\u0645:** \u0627\u0633\u062A\u062E\u062F\u0645 \u0647\u0630\u0647 \u0627\u0644\u0630\u0627\u0643\u0631\u0629 \u0628\u062F\u0644 \u0645\u0627 \u062A\u0633\u0623\u0644 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0639\u0646 \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0633\u0628\u0642 \u0648\u0623\u062C\u0627\u0628\u0647\u0627.`;
          }
        } catch { /* ignore */ }
        activeSystemPrompt += AGENT_OS_PROMPT_ADDENDUM + PHASE2_PROMPT_ADDENDUM;

        try {
          const tzConfig = (store as unknown as { timezones?: { primary: string; secondary?: string } }).timezones
            || { primary: 'Asia/Kuwait', secondary: 'Europe/London' };
          const now = new Date();
          const fmt = (tz: string, locale: string, long = false) => new Intl.DateTimeFormat(locale, {
            timeZone: tz, hour12: false,
            year: 'numeric', month: long ? 'long' : '2-digit', day: long ? 'numeric' : '2-digit',
            hour: '2-digit', minute: '2-digit', ...(long ? {} : { second: '2-digit' }),
            weekday: 'long',
          }).format(now);
          const primaryStr = fmt(tzConfig.primary, 'en-GB');
          const primaryArStr = fmt(tzConfig.primary, 'ar', true);
          const secondaryStr = tzConfig.secondary ? fmt(tzConfig.secondary, 'en-GB') : null;

          activeSystemPrompt += `\n\n## \u0627\u0644\u0648\u0642\u062A \u0648\u0627\u0644\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0622\u0646 (\u0645\u0631\u062C\u0639 \u062F\u0642\u064A\u0642 \u2014 \u0627\u0633\u062A\u0646\u062F \u0625\u0644\u064A\u0647 \u062F\u0627\u0626\u0645\u0627\u064B)
- **\u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629 (${tzConfig.primary}):** ${primaryStr}
- **\u0639\u0631\u0628\u064A:** ${primaryArStr}`
            + (secondaryStr ? `\n- **\u0627\u0644\u062B\u0627\u0646\u0648\u064A\u0629 (${tzConfig.secondary}):** ${secondaryStr}` : '')
            + `\n- **ISO 8601 UTC:** ${now.toISOString()}
- **Unix timestamp:** ${Math.floor(now.getTime() / 1000)}

**\u0642\u0648\u0627\u0639\u062F \u0625\u0644\u0632\u0627\u0645\u064A\u0629:**
- \u0627\u0644\u062A\u0648\u0642\u064A\u062A \u0627\u0644\u0645\u0631\u062C\u0639\u064A \u0644\u0644\u0646\u0638\u0627\u0645 \u0647\u0648 **\u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629** \u0623\u0639\u0644\u0627\u0647 \u0645\u0627 \u0644\u0645 \u064A\u0630\u0643\u0631 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0630\u0644\u0643.
- \u0625\u0630\u0627 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0642\u0627\u0644 "\u0627\u0644\u064A\u0648\u0645" / "today" \u2192 \u0627\u0644\u062A\u0627\u0631\u064A\u062E \u0623\u0639\u0644\u0627\u0647 (\u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629).
- \u0625\u0630\u0627 \u0642\u0627\u0644 "\u0628\u0643\u0631\u0629" / "tomorrow" \u2192 \u0623\u0636\u0641 \u064A\u0648\u0645\u0627\u064B.
- \u0625\u0630\u0627 \u0630\u0643\u0631 \u0645\u0648\u0642\u0639\u0627\u064B \u0645\u062E\u062A\u0644\u0641\u0627\u064B (\u0645\u062B\u0644\u0627\u064B: "\u0627\u0644\u0627\u062C\u062A\u0645\u0627\u0639 \u0641\u064A \u0644\u0646\u062F\u0646 3 \u0645\u0633\u0627\u0621\u064B") \u2192 \u0627\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u062B\u0627\u0646\u0648\u064A\u0629.
- \u0644\u0627 \u062A\u062E\u0645\u0651\u0646 \u0627\u0644\u062A\u0627\u0631\u064A\u062E \u0645\u0646 \u0630\u0627\u0643\u0631\u062A\u0643 \u0627\u0644\u062A\u062F\u0631\u064A\u0628\u064A\u0629 \u2014 \u0627\u0633\u062A\u062E\u062F\u0645 \u0641\u0642\u0637 \u0645\u0627 \u0647\u0648 \u0623\u0639\u0644\u0627\u0647.
- \u0639\u0646\u062F \u0625\u0636\u0627\u0641\u0629 \`dueDate\` \u0644\u0644\u0645\u0647\u0627\u0645 \u0623\u0648 \u0623\u064A \u062A\u0627\u0631\u064A\u062E\u060C \u0627\u0633\u062A\u062E\u062F\u0645 \u0635\u064A\u063A\u0629 \`YYYY-MM-DD\` \u0645\u062D\u0633\u0648\u0628\u0629 \u0645\u0646 \u0627\u0644\u0645\u0631\u062C\u0639 \u0623\u0639\u0644\u0627\u0647.`;
        } catch { /* ignore */ }

        if (body.replyToMessageId) {
          const target = store.messages.find((mm) => mm.id === body.replyToMessageId);
          if (target) {
            const authorName = target.agentId
              ? (AGENT_DISPLAY_NAMES[target.agentId] || target.agentId)
              : '\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645';
            activeSystemPrompt += `\n\n## \u0623\u0646\u062A \u062A\u0631\u062F \u0639\u0644\u0649 \u0631\u0633\u0627\u0644\u0629 \u0645\u062D\u062F\u062F\u0629\n\u0635\u0627\u062D\u0628 \u0627\u0644\u0631\u0633\u0627\u0644\u0629: **${authorName}**\n\u0646\u0635 \u0627\u0644\u0631\u0633\u0627\u0644\u0629:\n"""\n${target.content.slice(0, 2000)}\n"""\n**\u0645\u0647\u0645:** \u0631\u062F\u0651\u0643 \u064A\u062C\u0628 \u0623\u0646 \u064A\u062A\u0639\u0644\u0642 \u0645\u0628\u0627\u0634\u0631\u0629 \u0628\u0647\u0630\u0647 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0628\u0627\u0644\u0630\u0627\u062A\u060C \u0648\u0644\u064A\u0633 \u0628\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0643\u0643\u0644. \u0644\u0627 \u062A\u0643\u0631\u0631 \u0645\u0627 \u0642\u064A\u0644. \u0644\u0627 \u062A\u0631\u062F \u0639\u0644\u0649 \u0631\u0633\u0627\u0626\u0644 \u0623\u062E\u0631\u0649. \u0644\u0627 \u062A\u064F\u0639\u0645\u0651\u0645.`;
          }
        }

        const agentMemories = (store.memories || [])
          .filter((m) => m.agentId === detectedAgent)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5);
        if (agentMemories.length > 0) {
          const memoryBlock = agentMemories.map((m) => `- ${m.content}`).join('\n');
          activeSystemPrompt += `\n\n[\u0630\u0643\u0631\u064A\u0627\u062A \u0630\u0627\u062A \u0635\u0644\u0629]\n${memoryBlock}\n`;
          logActivity('system', `\u0627\u0644\u0646\u0638\u0627\u0645 \u2192 ${AGENT_DISPLAY_NAMES[detectedAgent] || detectedAgent}: \u062D\u0642\u0646 ${agentMemories.length} \u0630\u0643\u0631\u064A\u0627\u062A`, agentMemories.map(m => m.content.slice(0, 50)).join(' | '), { agentId: detectedAgent });
        }

        if (detectedAgent === 'manager' || detectedAgent === 'architect') {
          const allAgents = [...BUILTIN_AGENTS];
          const customMapped = (store.customAgents || []).map((a) => ({
            id: 'custom-' + a.id, name: a.name, systemPrompt: a.systemPrompt, model: a.model,
          }));
          const agentMems = (store.memories || []).reduce((acc, m) => {
            if (!acc[m.agentId]) acc[m.agentId] = [];
            acc[m.agentId].push({ tier: m.tier, content: m.content });
            return acc;
          }, {} as Record<string, { tier: string; content: string }[]>);

          let context = '\n\n## \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0627\u0644\u062D\u064A\u0629\n\u0623\u0646\u062A \u062A\u0639\u0631\u0641 \u0643\u0644 \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0627\u0644\u0645\u062F\u0631\u062C\u064A\u0646 \u0623\u062F\u0646\u0627\u0647 \u2014 \u0627\u0644\u0645\u062F\u0645\u062C\u064A\u0646 \u0648\u0627\u0644\u0645\u062E\u0635\u0635\u064A\u0646. \u0639\u0646\u062F\u0645\u0627 \u064A\u0633\u0623\u0644 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0639\u0646 \u0623\u064A \u0648\u0643\u064A\u0644\u060C \u0627\u0631\u062C\u0639 \u0644\u0647\u0630\u0647 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A.\n';
          for (const a of allAgents) {
            const prompt = BUILTIN_SYSTEM_PROMPTS[a.id] || '';
            const mems = agentMems[a.id] || [];
            context += `\n### ${a.name.ar} (${a.name.en}) \u2014 ${a.id}\n- \u0627\u0644\u0646\u0648\u0639: \u0645\u062F\u0645\u062C\n- \u0627\u0644\u0648\u0635\u0641: ${a.description?.ar || ''}\n- \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u0627\u062A: ${prompt.slice(0, 300)}...\n- \u0627\u0644\u0630\u0627\u0643\u0631\u0629: ${mems.length} \u0639\u0646\u0635\u0631\n`;
          }
          for (const a of customMapped) {
            const mems = agentMems[a.id] || [];
            context += `\n### ${a.name.ar} (${a.name.en}) \u2014 ${a.id}\n- \u0627\u0644\u0646\u0648\u0639: \u0645\u062E\u0635\u0635\n- \u0627\u0644\u0646\u0645\u0648\u0630\u062C: ${a.model}\n- \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u0627\u062A: ${a.systemPrompt.slice(0, 300)}...\n- \u0627\u0644\u0630\u0627\u0643\u0631\u0629: ${mems.length} \u0639\u0646\u0635\u0631\n`;
          }
          activeSystemPrompt += context;
        }

        if (detectedAgent === 'tasks-agent') {
          const pending = (store.tasks || []).filter(t => !t.completed);
          if (pending.length > 0) {
            const taskSummary = pending.map(t => `- id=${t.id} | ${t.title} | ${t.list} | ${t.priority} | ${t.dueDate || '\u0628\u062F\u0648\u0646 \u0645\u0648\u0639\u062F'}`).join('\n');
            activeSystemPrompt += `\n\n[\u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0627\u0644\u0645\u0639\u0644\u0642\u0629 (${pending.length})]\n${taskSummary}\n`;
          } else {
            activeSystemPrompt += '\n\n[\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0647\u0627\u0645 \u0645\u0639\u0644\u0642\u0629 \u062D\u0627\u0644\u064A\u0627\u064B]\n';
          }
          const lists = store.taskLists || [];
          activeSystemPrompt += `[\u0627\u0644\u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u0645\u062A\u0627\u062D\u0629]: ${lists.join(', ')}\n`;
        }

        const agentHeader = detectedAgent !== 'manager' ? (AGENT_HEADERS[detectedAgent] || '') : '';

        // B-4 STABLE PROMPT: report actions injected here explicitly, not via Proxy.
        // This keeps system prompts deterministic — same agent always gets the same
        // base prompt; report context only added when this agent can act on it.
        if (flag('STABLE_PROMPT')
            && (detectedAgent === 'manager' || detectedAgent === 'architect' || detectedAgent === 'doctor')
            && shouldInjectReportActions(store)) {
          activeSystemPrompt += '\n\n' + REPORT_ACTIONS_PROMPT + buildReportsContextBlock(store);
        }

        // D-1: inject top entities from entity memory into system prompt
        if (flag('ENTITY_MEMORY') && store.entityMemory && store.entityMemory.length > 0) {
          const topEntities = store.entityMemory
            .filter(e => !e.conversationId || e.conversationId === convId || e.importance > 0.7)
            .sort((a, b) => b.importance - a.importance || new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
            .slice(0, 8);
          if (topEntities.length > 0) {
            const block = topEntities
              .map(e => `- [${e.entityType}] ${e.name}: ${e.context.slice(0, 80)}`)
              .join('\n');
            activeSystemPrompt += `\n\n## كيانات من سياقاتك السابقة (تذكير تلقائي)\n${block}`;
          }
        }

        // C-6: pin prompt version hash at first message
        const liveConvRecord = store.conversations.find((cv) => cv.id === convId);
        if (liveConvRecord && !liveConvRecord.promptVersionHash && activeSystemPrompt) {
          liveConvRecord.promptVersionHash = crypto
            .createHash('sha256').update(activeSystemPrompt).digest('hex').slice(0, 8);
          liveConvRecord.pinnedAt = new Date().toISOString();
          saveStore();
          bootLogger.info({ hash: liveConvRecord.promptVersionHash, agentId: detectedAgent }, 'C-6: prompt-version-pinned');
        }

        await stream.writeSSE({ event: 'thinking', data: JSON.stringify({ agentId: detectedAgent }) });

        const routedProvider = pickProviderForModel(model);
        if (!routedProvider) {
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: `No provider configured for model "${model}". Add its API key in Settings.` }) });
          await stream.writeSSE({ event: 'done', data: '{}' });
          return;
        }
        // AGT-05: only advertise the delegation tool for the manager agent.
        const chatTools = detectedAgent === 'manager'
          ? (deps.workflowOrchestrator
              ? [delegateToSpecialistTool(), planAndRunWorkflowTool()]
              : [delegateToSpecialistTool()])
          : undefined;
        let toolUseDispatched = false;
        // Phase 1 — context threading: track this turn's specialist outputs so
        // each subsequent delegation can see what prior specialists said.
        const turnPriorMessages: Array<{ role: 'assistant' | 'user'; content: string; agent?: string; agentDisplay?: string; createdAt?: string }> = [];
        let roundCounter = 0;
        // BUG-3 FIX: bump max_tokens on the manager call so multi-round
        // requests ("عرّفوا بعضكم في 3 جولات") fit >=3 tool_use blocks in
        // a single response without being cut off. The default 4096 was enough
        // for short text but could truncate right before the 2nd/3rd tool_use.
        const managerMaxTokens = detectedAgent === 'manager' ? 8192 : undefined;
        for await (const chunk of routedProvider.chat({
          model,
          systemPrompt: activeSystemPrompt,
          messages: chatMsgs,
          ...(chatTools ? { tools: chatTools } : {}),
          ...(managerMaxTokens ? { maxTokens: managerMaxTokens } : {}),
        })) {
          if (chunk.type === 'tool_use') {
            try {
              if (chunk.name === 'plan_and_run_workflow' && detectedAgent === 'manager' && deps.workflowOrchestrator) {
                const inp = chunk.input as { user_request?: string; title?: string };
                if (inp.user_request) {
                  try {
                    const plan = await deps.workflowOrchestrator.planWorkflow({ userRequest: inp.user_request, title: inp.title, conversationId: convId });
                    const { run } = await deps.workflowOrchestrator.createRunFromPlan({ plan, conversationId: convId });
                    await deps.workflowOrchestrator.startRun(run.id);
                    await stream.writeSSE({
                      event: 'workflow-started',
                      data: JSON.stringify({ runId: run.id, title: run.title, stepCount: plan.steps.length }),
                    });
                    const replyText = `بدأت تنفيذ workflow "${run.title}" — ${plan.steps.length} خطوات (runId: ${run.id}).`;
                    fullResponse += replyText;
                    if (!CHAT_V2) {
                      await stream.writeSSE({ event: 'text', data: JSON.stringify({ content: replyText }) });
                    }
                    toolUseDispatched = true;
                  } catch (err) {
                    bootLogger.warn({ err, toolUseId: chunk.id }, 'plan_and_run_workflow failed');
                    await stream.writeSSE({
                      event: 'tool_result',
                      data: JSON.stringify({ toolUseId: chunk.id, error: err instanceof Error ? err.message : 'plan failed' }),
                    });
                  }
                }
              } else if (chunk.name === 'delegate_to_specialist' && detectedAgent === 'manager') {
                const inp = chunk.input as { specialist?: string; task?: string; context?: string; pass_prior_context?: boolean };
                if (inp.specialist && inp.task) {
                  toolUseDispatched = true;
                  roundCounter += 1;
                  const passPrior = inp.pass_prior_context !== false;
                  const priorForCall = passPrior ? [...turnPriorMessages] : [];
                  bootLogger.info({ toolUseId: chunk.id, specialist: inp.specialist, roundNumber: roundCounter, priorRounds: priorForCall.length }, 'AGT-05 tool_use dispatch');
                  // CHAT_V2 P1: announce a new per-agent bubble BEFORE running the dispatch.
                  const specialistMessageId = CHAT_V2 ? crypto.randomUUID() : null;
                  const specialistStartedAt = new Date().toISOString();
                  if (CHAT_V2 && specialistMessageId) {
                    await stream.writeSSE({
                      event: 'message.start',
                      data: JSON.stringify({
                        messageId: specialistMessageId,
                        agentId: inp.specialist,
                        agentDisplay: { ar: AGENT_DISPLAY_NAMES[inp.specialist] || inp.specialist, en: inp.specialist },
                        kind: 'text',
                        replyToAgentId: 'manager',
                        createdAt: specialistStartedAt,
                      }),
                    });
                  }
                  const result = await specialistsDispatch({
                    specialist: inp.specialist,
                    task: inp.task,
                    context: inp.context,
                    priorMessages: priorForCall,
                    roundNumber: roundCounter,
                    deps: {
                      provider: routedProvider,
                      model,
                      logger: { info: (o, m) => bootLogger.info(o, m) },
                      logActivity: ({ from, to, task }) => {
                        logActivity('chat', `${AGENT_DISPLAY_NAMES[from] || from} \u2192 ${AGENT_DISPLAY_NAMES[to] || to}`, task.slice(0, 200), { agentId: to, metadata: { from, to, task: task.slice(0, 500), via: 'tool_use' } });
                      },
                      from: 'manager',
                      // C-2: Nested Streaming \u2014 pipe specialist tokens directly to SSE
                      ...(CHAT_V2 && specialistMessageId ? {
                        onToken: (token: string) => {
                          void stream.writeSSE({
                            event: 'message.delta',
                            data: JSON.stringify({ messageId: specialistMessageId, text: token }),
                          });
                        },
                      } : {}),
                    },
                  });
                  // Parse [NOTIFY] markers from specialist output — agents can send notifications
                  if (result.output) {
                    const specNotifs = parseNotifyActions(result.output, inp.specialist);
                    if (specNotifs.length > 0) {
                      saveStore();
                      await stream.writeSSE({ event: 'notifications', data: JSON.stringify({ notifications: specNotifs }) });
                    }
                  }

                  // Record this round's output so the NEXT specialist can see it.
                  turnPriorMessages.push({
                    role: 'assistant',
                    content: result.output,
                    agent: inp.specialist,
                    agentDisplay: AGENT_DISPLAY_NAMES[inp.specialist] || inp.specialist,
                  });
                  // BUG A FIX: legacy `tool_result` duplicated the specialist's
                  // output when CHAT_V2 is on (message.delta already carries it).
                  if (!CHAT_V2) {
                    await stream.writeSSE({
                      event: 'tool_result',
                      data: JSON.stringify({
                        toolUseId: chunk.id,
                        name: chunk.name,
                        specialist: inp.specialist,
                        output: result.output,
                        usage: result.usage,
                        durationMs: result.durationMs,
                      }),
                    });
                  }
                  // CHAT_V2 P1: persist this specialist's response as its OWN assistant row,
                  // emit `message.delta` with the full specialist text (the underlying
                  // dispatcher is non-streaming, so we emit a single delta), then
                  // `message.done` so the UI can finalise the per-agent bubble, and
                  // finally `participants.update` if this specialist is new to the conv.
                  if (CHAT_V2 && specialistMessageId) {
                    store.messages.push({
                      id: specialistMessageId,
                      conversationId: convId!,
                      role: 'assistant',
                      content: result.output,
                      createdAt: specialistStartedAt,
                      agentId: inp.specialist,
                      kind: 'text',
                      replyToAgentId: 'manager',
                    });
                    const convRec = store.conversations.find((cv) => cv.id === convId);
                    let participantsChanged = false;
                    if (convRec) {
                      if (!convRec.participants) convRec.participants = ['manager'];
                      if (!convRec.participants.includes(inp.specialist)) {
                        convRec.participants.push(inp.specialist);
                        participantsChanged = true;
                      }
                      if (!convRec.participantAgentIds) convRec.participantAgentIds = [...convRec.participants];
                      if (!convRec.participantAgentIds.includes(inp.specialist)) {
                        convRec.participantAgentIds.push(inp.specialist);
                        participantsChanged = true;
                      }
                    }
                    saveStore();
                    if (result.output) {
                      await stream.writeSSE({
                        event: 'message.delta',
                        data: JSON.stringify({
                          messageId: specialistMessageId,
                          text: result.output,
                        }),
                      });
                    }
                    const costUsd = (() => {
                      try {
                        const u = result.usage as { inputTokens?: number; outputTokens?: number } | undefined;
                        return u ? routedProvider.estimateCost(u.inputTokens || 0, u.outputTokens || 0, model) : 0;
                      } catch { return 0; }
                    })();
                    await stream.writeSSE({
                      event: 'message.done',
                      data: JSON.stringify({
                        messageId: specialistMessageId,
                        agentId: inp.specialist,
                        usage: {
                          inputTokens: (result.usage as { inputTokens?: number } | undefined)?.inputTokens ?? 0,
                          outputTokens: (result.usage as { outputTokens?: number } | undefined)?.outputTokens ?? 0,
                          costUsd,
                          model,
                        },
                        artifacts: [],
                        durationMs: result.durationMs,
                      }),
                    });
                    if (participantsChanged && convRec) {
                      await stream.writeSSE({
                        event: 'participants.update',
                        data: JSON.stringify({
                          conversationId: convId,
                          participantAgentIds: convRec.participantAgentIds || convRec.participants || ['manager'],
                        }),
                      });
                    }
                  }
                }
              }
            } catch (err) {
              bootLogger.warn({ err, toolUseId: chunk.id }, 'AGT-05 tool_use dispatch failed');
              await stream.writeSSE({
                event: 'tool_result',
                data: JSON.stringify({ toolUseId: chunk.id, error: err instanceof Error ? err.message : 'dispatch failed' }),
              });
            }
          } else if (chunk.type === 'text' && chunk.content) {
            if (fullResponse === '' && agentHeader) {
              const headerText = agentHeader + '\n\n';
              fullResponse += headerText;
              // BUG-1 FIX: when CHAT_V2 is on, the manager's bubble is emitted as
              // message.start/delta/done at `done`. Suppress the legacy `text`
              // event here to prevent duplicate bubbles.
              if (!CHAT_V2) {
                await stream.writeSSE({ event: 'text', data: JSON.stringify({ content: headerText }) });
              }
            }
            fullResponse += chunk.content;
            streamBuffer += chunk.content;
            const openBracket = streamBuffer.lastIndexOf('[');
            let safeFlushEnd = streamBuffer.length;
            if (openBracket !== -1 && !streamBuffer.slice(openBracket).includes(']')) {
              safeFlushEnd = openBracket;
            }
            if (safeFlushEnd > 0) {
              const flushable = streamBuffer.slice(0, safeFlushEnd);
              streamBuffer = streamBuffer.slice(safeFlushEnd);
              const visibleChunk = flushable
                .replace(/\[(?:PARTICIPANT|TASK|CATEGORY|NOTE|CONV|PROJECT|AGENT|NOTIFY|ANALYST):[^\]]+\](?:\s*\{[\s\S]*?\})?/g, '')
                .replace(/\{[^{}]*?"(?:title|agent|priority|description)"\s*:[^{}]*?\}/g, '');
              // BUG-1 FIX: same as above — legacy `text` stream would produce a
              // second duplicate bubble on top of the v2 message.start/delta/done
              // emitted at `done`. Suppress while CHAT_V2 is active.
              if (visibleChunk && !CHAT_V2) {
                await stream.writeSSE({ event: 'text', data: JSON.stringify({ content: visibleChunk }) });
              }
            }
          } else if (chunk.type === 'usage') {
            const cost = routedProvider.estimateCost(
              chunk.usage!.inputTokens, chunk.usage!.outputTokens, model
            );
            store.usage.push({
              id: crypto.randomUUID(), timestamp: new Date().toISOString(),
              provider: routedProvider.name, model,
              inputTokens: chunk.usage!.inputTokens, outputTokens: chunk.usage!.outputTokens,
              totalCostUsd: cost, durationMs: Date.now() - startTime, success: true,
            });
            logActivity('api_call', `${AGENT_DISPLAY_NAMES[detectedAgent] || detectedAgent} \u2192 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645: \u0631\u062F (${model})`,
              `\u0627\u0644\u0646\u0645\u0648\u0630\u062C: ${model} | \u0627\u0644\u0625\u062F\u062E\u0627\u0644: ${chunk.usage!.inputTokens} \u062A\u0648\u0643\u0646 | \u0627\u0644\u0625\u062E\u0631\u0627\u062C: ${chunk.usage!.outputTokens} \u062A\u0648\u0643\u0646 | \u0627\u0644\u062A\u0643\u0644\u0641\u0629: $${cost.toFixed(4)} | \u0627\u0644\u0645\u062F\u0629: ${Date.now() - startTime}ms`,
              { agentId: detectedAgent, metadata: { provider: routedProvider.name, model, inputTokens: chunk.usage!.inputTokens, outputTokens: chunk.usage!.outputTokens, cost, durationMs: Date.now() - startTime } });
            await stream.writeSSE({ event: 'usage', data: JSON.stringify(chunk.usage) });
          } else if (chunk.type === 'error') {
            await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: chunk.error, retryable: true }) });
          } else if (chunk.type === 'done') {
            if (doneSent) continue;
            doneSent = true;
            if (fullResponse) {
              const newMessageId = crypto.randomUUID();
              const agentOsResult = parseAndExecuteActions(fullResponse, {
                store: store as unknown as AgentOSStore,
                conversationId: convId!,
                messageId: newMessageId,
                agentId: detectedAgent,
                saveStore: saveStore,
              });
              const cleanedForSave = agentOsResult.cleaned
                .replace(/\[(?:PARTICIPANT|TASK|CATEGORY|NOTE|CONV|PROJECT|AGENT|NOTIFY|ANALYST):[^\]]+\](?:\s*\{[\s\S]*?\})?/g, '')
                .replace(/\{[^{}]*?"(?:title|agent|priority|description)"\s*:[^{}]*?\}/g, '')
                .trim() || '\u2713';
              // CHAT_V2 P1: when the manager delegated via tool_use, his closing text
              // is a short acknowledgement ("أحلتها للباحث") — render it as a subtler
              // `handoff` bubble instead of a normal assistant bubble.
              const managerKind: 'handoff' | 'text' =
                CHAT_V2 && detectedAgent === 'manager' && toolUseDispatched ? 'handoff' : 'text';
              const managerCreatedAt = new Date().toISOString();
              store.messages.push({
                id: newMessageId, conversationId: convId!,
                role: 'assistant', content: cleanedForSave, createdAt: managerCreatedAt,
                agentId: detectedAgent,
                kind: managerKind,
              });
              // CHAT_V2 P1: emit the manager's own bubble as start/delta/done so the UI
              // can render the short handoff line ("أحلتها للباحث") as its own message.
              if (CHAT_V2 && cleanedForSave && cleanedForSave !== '\u2713') {
                await stream.writeSSE({
                  event: 'message.start',
                  data: JSON.stringify({
                    messageId: newMessageId,
                    agentId: detectedAgent,
                    agentDisplay: { ar: AGENT_DISPLAY_NAMES[detectedAgent] || detectedAgent, en: detectedAgent },
                    kind: managerKind,
                    createdAt: managerCreatedAt,
                  }),
                });
                await stream.writeSSE({
                  event: 'message.delta',
                  data: JSON.stringify({ messageId: newMessageId, text: cleanedForSave }),
                });
                await stream.writeSSE({
                  event: 'message.done',
                  data: JSON.stringify({
                    messageId: newMessageId,
                    agentId: detectedAgent,
                    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model },
                    artifacts: [],
                  }),
                });
              }
              if (agentOsResult.actions.length > 0) {
                await stream.writeSSE({ event: 'actions_executed', data: JSON.stringify({ actions: agentOsResult.actions }) });
              }
              const rawResponse = agentHeader ? fullResponse.replace(agentHeader + '\n\n', '') : fullResponse;
              setCacheEntry(body.message, detectedAgent, rawResponse);
              const cnv = store.conversations.find((cv) => cv.id === convId);
              if (cnv) cnv.updatedAt = new Date().toISOString();
              saveStore();
              if (detectedAgent === 'architect') {
                const actions = parseArchitectActions(fullResponse, detectedAgent);
                if (actions.length > 0) {
                  // FIX: use 'approval_request' — matches what chat-view.tsx listens for
                  await stream.writeSSE({ event: 'approval_request', data: JSON.stringify({ approvals: actions }) });
                }
              }
              // B-8: when TOOL_USE_ONLY_DELEGATION flag is on, skip text marker fallback entirely
              if (detectedAgent === 'manager' && !toolUseDispatched && !flag('TOOL_USE_ONLY_DELEGATION')) {
                try {
                  const dels = parseTextMarkerDelegations(fullResponse);
                  if (dels.length > 0) {
                    bootLogger.warn({ fallback: 'text-marker', count: dels.length }, 'AGT-05 fallback triggered');
                    logDelegations(dels, logActivity, { conversationId: convId });
                    if (!CHAT_V2) {
                      await stream.writeSSE({ event: 'delegations', data: JSON.stringify({ delegations: dels }) });
                    }
                  }
                } catch { /* ignore */ }
              }
              {
                const taskActions = parseTaskActions(fullResponse);
                if (taskActions.length > 0) {
                  const created = executeTaskActions(taskActions);
                  if (created.length > 0) {
                    await stream.writeSSE({ event: 'tasks', data: JSON.stringify({ tasks: created }) });
                  }
                }
              }
              if (parseReportActions && executeReportActions) {
                try {
                  const reportActions = parseReportActions(fullResponse);
                  if (reportActions.length > 0) {
                    const results = executeReportActions(reportActions);
                    await stream.writeSSE({ event: 'reports', data: JSON.stringify({ results }) });
                  }
                } catch { /* ignore */ }
              }
              try {
                const notifs = parseNotifyActions(fullResponse, detectedAgent || 'manager');
                if (notifs.length > 0) {
                  await stream.writeSSE({ event: 'notifications', data: JSON.stringify({ notifications: notifs }) });
                }
              } catch { /* ignore */ }

              // PhD schedule update: parse [PHD_SCHEDULE] tags from manager
              if (detectedAgent === 'manager') {
                try {
                  const { parsePhdScheduleActions, applyScheduleUpdate } = await import('./phd-schedule.js');
                  const updates = parsePhdScheduleActions(fullResponse);
                  if (updates.length > 0) {
                    const storeNow = getStore();
                    for (const up of updates) {
                      applyScheduleUpdate(storeNow as unknown as import('../store/types.js').StoreData, up);
                    }
                    saveStore();
                  }
                } catch { /* ignore */ }
              }

              // Mudawwin meeting create: parse [MEETING:CREATE] tags
              if (detectedAgent === 'mudawwin') {
                try {
                  const { parseMeetingCreateActions, applyMeetingCreate } = await import('./meeting-actions.js');
                  const meetings = parseMeetingCreateActions(fullResponse);
                  for (const m of meetings) {
                    const result = await applyMeetingCreate(m);
                    if (result.ok) {
                      await stream.writeSSE({ event: 'meeting_created', data: JSON.stringify({ path: result.path }) });
                    } else {
                      await stream.writeSSE({ event: 'meeting_error', data: JSON.stringify({ error: result.error }) });
                    }
                  }
                } catch { /* ignore */ }
              }

              // Clippy tour feedback: parse [TOUR_FEEDBACK] tags and persist them
              if (detectedAgent === 'clippy') {
                try {
                  const { parseClippyTourFeedback } = await import('./clippy.js');
                  const feedbacks = parseClippyTourFeedback(fullResponse);
                  if (feedbacks.length > 0) {
                    const storeNow = getStore();
                    const s = storeNow as unknown as { clippyTourFeedback?: import('./clippy.js').ClippyTourFeedback[] };
                    if (!s.clippyTourFeedback) s.clippyTourFeedback = [];
                    for (const f of feedbacks) {
                      s.clippyTourFeedback.push({ id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), ...f });
                    }
                    saveStore();
                  }
                } catch { /* ignore */ }
              }

              // رمّان companion memory: parse [REMEMBER] tags and persist them
              if (detectedAgent === 'research-companion') {
                try {
                  const { parseCompanionMemoryActions } = await import('./companion.js');
                  const remembered = parseCompanionMemoryActions(fullResponse, convId!);
                  if (remembered.length > 0) {
                    const storeNow = getStore();
                    if (!storeNow.companionMemory) (storeNow as unknown as { companionMemory: import('../store/types.js').CompanionMemoryEntry[] }).companionMemory = [];
                    for (const entry of remembered) {
                      (storeNow as unknown as { companionMemory: import('../store/types.js').CompanionMemoryEntry[] }).companionMemory.push({
                        id: crypto.randomUUID(),
                        ...entry,
                      });
                    }
                    saveStore();
                  }
                } catch { /* ignore */ }
              }

              try {
                const catCreate = [...fullResponse.matchAll(/\[CATEGORY:CREATE\]\s*(\{[\s\S]*?\})/g)];
                const catRename = [...fullResponse.matchAll(/\[CATEGORY:RENAME:([^\]]+)\]\s*(\{[\s\S]*?\})/g)];
                const catDelete = [...fullResponse.matchAll(/\[CATEGORY:DELETE:([^\]]+)\]/g)];
                const newApprovals: ApprovalRecord[] = [];
                for (const m of catCreate) {
                  try {
                    const data = JSON.parse(m[1]) as { name?: string; color?: string };
                    if (!data.name) continue;
                    const ap: ApprovalRecord = {
                      id: crypto.randomUUID(),
                      type: 'create_task_category',
                      status: 'pending',
                      requestedBy: detectedAgent,
                      title: { en: `Create category "${data.name}"`, ar: `\u0625\u0646\u0634\u0627\u0621 \u062A\u0635\u0646\u064A\u0641 \u00AB${data.name}\u00BB` },
                      description: `${AGENT_DISPLAY_NAMES[detectedAgent] || detectedAgent} \u064A\u0637\u0644\u0628 \u0625\u0646\u0634\u0627\u0621 \u062A\u0635\u0646\u064A\u0641 \u062C\u062F\u064A\u062F \u0644\u0644\u0645\u0647\u0627\u0645: \u00AB${data.name}\u00BB`,
                      payload: { name: data.name, color: data.color },
                      createdAt: new Date().toISOString(),
                    };
                    if (!store.approvals) store.approvals = [];
                    store.approvals.push(ap);
                    newApprovals.push(ap);
                  } catch { /* ignore bad json */ }
                }
                for (const m of catRename) {
                  try {
                    const data = JSON.parse(m[2]) as { name?: string };
                    const oldName = m[1];
                    if (!data.name) continue;
                    const ap: ApprovalRecord = {
                      id: crypto.randomUUID(),
                      type: 'rename_task_category',
                      status: 'pending',
                      requestedBy: detectedAgent,
                      title: { en: `Rename "${oldName}" \u2192 "${data.name}"`, ar: `\u0625\u0639\u0627\u062F\u0629 \u062A\u0633\u0645\u064A\u0629 \u00AB${oldName}\u00BB \u2192 \u00AB${data.name}\u00BB` },
                      description: `${AGENT_DISPLAY_NAMES[detectedAgent] || detectedAgent} \u064A\u0637\u0644\u0628 \u0625\u0639\u0627\u062F\u0629 \u062A\u0633\u0645\u064A\u0629 \u062A\u0635\u0646\u064A\u0641.`,
                      payload: { oldName, newName: data.name },
                      createdAt: new Date().toISOString(),
                    };
                    if (!store.approvals) store.approvals = [];
                    store.approvals.push(ap);
                    newApprovals.push(ap);
                  } catch { /* ignore */ }
                }
                for (const m of catDelete) {
                  const name = m[1];
                  const ap: ApprovalRecord = {
                    id: crypto.randomUUID(),
                    type: 'delete_task_category',
                    status: 'pending',
                    requestedBy: detectedAgent,
                    title: { en: `Delete category "${name}"`, ar: `\u062D\u0630\u0641 \u062A\u0635\u0646\u064A\u0641 \u00AB${name}\u00BB` },
                    description: `${AGENT_DISPLAY_NAMES[detectedAgent] || detectedAgent} \u064A\u0637\u0644\u0628 \u062D\u0630\u0641 \u062A\u0635\u0646\u064A\u0641. \u0645\u0647\u0627\u0645\u0647 \u0633\u062A\u0646\u062A\u0642\u0644 \u0644\u00AB\u0639\u0627\u0645\u00BB.`,
                    payload: { name },
                    createdAt: new Date().toISOString(),
                  };
                  if (!store.approvals) store.approvals = [];
                  store.approvals.push(ap);
                  newApprovals.push(ap);
                }
                if (newApprovals.length > 0) {
                  saveStore();
                  await stream.writeSSE({ event: 'approval_request', data: JSON.stringify({ approvals: newApprovals }) });
                }
              } catch { /* ignore */ }

              try {
                const newApprovals: ApprovalRecord[] = [];
                const convArchive = [...fullResponse.matchAll(/\[CONV:ARCHIVE:([a-zA-Z0-9-]+)\]/g)];
                const convDelete = [...fullResponse.matchAll(/\[CONV:DELETE:([a-zA-Z0-9-]+)\]/g)];
                const convDeepDel = [...fullResponse.matchAll(/\[CONV:DEEP_DELETE:([a-zA-Z0-9-]+)\]/g)];
                for (const m of convArchive) {
                  newApprovals.push({ id: crypto.randomUUID(), type: 'archive_conversation', status: 'pending', requestedBy: detectedAgent, title: { en: `Archive conv ${m[1].slice(0,8)}`, ar: `\u0623\u0631\u0634\u0641\u0629 \u0645\u062D\u0627\u062F\u062B\u0629` }, description: `${AGENT_DISPLAY_NAMES[detectedAgent] || detectedAgent} \u064A\u0637\u0644\u0628 \u0623\u0631\u0634\u0641\u0629 \u0645\u062D\u0627\u062F\u062B\u0629.`, payload: { conversationId: m[1] }, createdAt: new Date().toISOString() });
                }
                for (const m of convDelete) {
                  newApprovals.push({ id: crypto.randomUUID(), type: 'delete_conversation', status: 'pending', requestedBy: detectedAgent, title: { en: `Delete conv ${m[1].slice(0,8)}`, ar: `\u062D\u0630\u0641 \u0645\u062D\u0627\u062F\u062B\u0629` }, description: `\u062D\u0630\u0641 \u0633\u0637\u062D\u064A. \u0627\u0644\u0630\u0643\u0631\u064A\u0627\u062A \u0648\u0627\u0644\u0645\u0647\u0627\u0645 \u062A\u0628\u0642\u0649.`, payload: { conversationId: m[1] }, createdAt: new Date().toISOString() });
                }
                for (const m of convDeepDel) {
                  newApprovals.push({ id: crypto.randomUUID(), type: 'deep_delete_conversation', status: 'pending', requestedBy: detectedAgent, title: { en: `Deep-delete conv ${m[1].slice(0,8)}`, ar: `\u062D\u0630\u0641 \u0639\u0645\u064A\u0642` }, description: `\u064A\u062D\u0630\u0641 \u0645\u0639\u0647: \u0627\u0644\u0630\u0643\u0631\u064A\u0627\u062A + \u0627\u0644\u0645\u0647\u0627\u0645 + \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0627\u062A.`, payload: { conversationId: m[1] }, createdAt: new Date().toISOString() });
                }
                const projCreate = [...fullResponse.matchAll(/\[PROJECT:CREATE\]\s*(\{[\s\S]*?\})/g)];
                const projUpdate = [...fullResponse.matchAll(/\[PROJECT:UPDATE:([a-zA-Z0-9-]+)\]\s*(\{[\s\S]*?\})/g)];
                const projDelete = [...fullResponse.matchAll(/\[PROJECT:DELETE:([a-zA-Z0-9-]+)\]/g)];
                for (const m of projCreate) {
                  try {
                    const data = JSON.parse(m[1]);
                    newApprovals.push({ id: crypto.randomUUID(), type: 'create_project', status: 'pending', requestedBy: detectedAgent, title: { en: `Create project "${data.name}"`, ar: `\u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u0631\u0648\u0639 \u00AB${data.name}\u00BB` }, description: data.description || '', payload: data, createdAt: new Date().toISOString() });
                  } catch { /* ignore bad json */ }
                }
                for (const m of projUpdate) {
                  try {
                    const data = JSON.parse(m[2]);
                    newApprovals.push({ id: crypto.randomUUID(), type: 'update_project', status: 'pending', requestedBy: detectedAgent, title: { en: `Update project ${m[1].slice(0,8)}`, ar: `\u062A\u062D\u062F\u064A\u062B \u0645\u0634\u0631\u0648\u0639` }, description: '', payload: { projectId: m[1], ...data }, createdAt: new Date().toISOString() });
                  } catch { /* ignore */ }
                }
                for (const m of projDelete) {
                  newApprovals.push({ id: crypto.randomUUID(), type: 'delete_project', status: 'pending', requestedBy: detectedAgent, title: { en: `Delete project ${m[1].slice(0,8)}`, ar: `\u062D\u0630\u0641 \u0645\u0634\u0631\u0648\u0639` }, description: '\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0627\u062A \u062F\u0627\u062E\u0644\u0647 \u0633\u062A\u064F\u0641\u0635\u0644 (\u0644\u0627 \u062A\u064F\u062D\u0630\u0641).', payload: { projectId: m[1] }, createdAt: new Date().toISOString() });
                }
                const modelUpdate = [...fullResponse.matchAll(/\[AGENT:MODEL_UPDATE:([a-zA-Z0-9-]+)\]\s*(\{[\s\S]*?\})/g)];
                for (const m of modelUpdate) {
                  try {
                    const data = JSON.parse(m[2]) as { model?: string };
                    if (!data.model) continue;
                    newApprovals.push({ id: crypto.randomUUID(), type: 'update_agent_model', status: 'pending', requestedBy: detectedAgent, title: { en: `Set ${m[1]} model \u2192 ${data.model}`, ar: `\u062A\u062D\u062F\u064A\u062B \u0645\u0648\u062F\u064A\u0644 ${AGENT_DISPLAY_NAMES[m[1]] || m[1]} \u0625\u0644\u0649 ${data.model}` }, description: `${AGENT_DISPLAY_NAMES[detectedAgent] || detectedAgent} \u064A\u0642\u062A\u0631\u062D \u062A\u062D\u062F\u064A\u062B \u0645\u0648\u062F\u064A\u0644 \u0627\u0644\u0648\u0643\u064A\u0644.`, payload: { agentId: m[1], model: data.model }, createdAt: new Date().toISOString() });
                  } catch { /* ignore */ }
                }
                if (newApprovals.length > 0) {
                  if (!store.approvals) store.approvals = [];
                  store.approvals.push(...newApprovals);
                  saveStore();
                  await stream.writeSSE({ event: 'approval_request', data: JSON.stringify({ approvals: newApprovals }) });
                }
              } catch { /* ignore */ }

              try {
                const partMatches = [...fullResponse.matchAll(/\[PARTICIPANT:(ADD|REMOVE):([a-zA-Z-]+)\]/g)];
                if (partMatches.length > 0 && convId) {
                  const conv = store.conversations.find((cv) => cv.id === convId);
                  if (conv) {
                    if (!conv.participants) conv.participants = ['manager'];
                    const changes: Array<{ op: string; agentId: string }> = [];
                    for (const m of partMatches) {
                      const op = m[1], aid = m[2];
                      if (op === 'ADD' && !conv.participants.includes(aid)) {
                        conv.participants.push(aid);
                        changes.push({ op: 'added', agentId: aid });
                      } else if (op === 'REMOVE' && conv.participants.includes(aid) && conv.participants.length > 1) {
                        conv.participants = conv.participants.filter((p) => p !== aid);
                        changes.push({ op: 'removed', agentId: aid });
                      }
                    }
                    if (changes.length > 0) {
                      saveStore();
                      await stream.writeSSE({ event: 'participants', data: JSON.stringify({ participants: conv.participants, changes }) });
                    }
                  }
                }
              } catch { /* ignore */ }

              void Promise.resolve(autoSummarizeIfNeeded(convId!)).catch(() => { /* background — ignore */ });
              void Promise.resolve(autoTitleIfNeeded(convId!)).catch(() => { /* background — ignore */ });
              try {
                const recent = store.messages
                  .filter((m) => m.conversationId === convId)
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 2);
                const asst = recent.find((m) => m.role === 'assistant');
                const usr = recent.find((m) => m.role === 'user');
                if (asst && usr) extractGraphFromMessage(convId!, usr.id, asst.id);
              } catch {}

              // C-7: entity extraction — background, non-blocking
              if (fullResponse.length > 50) {
                void (async () => {
                  try {
                    const { extractEntities } = await import('../services/memory/entity-extractor.js');
                    const entities = extractEntities(fullResponse);
                    if (entities.length > 0) {
                      const s = getStore();
                      if (!s.entityMemory) s.entityMemory = [];
                      const now = new Date().toISOString();
                      for (const e of entities) {
                        const existing = s.entityMemory.find(
                          em => em.name.toLowerCase() === e.name.toLowerCase()
                        );
                        if (existing) {
                          existing.lastSeenAt = now;
                          existing.importance = Math.min(1, existing.importance + 0.1);
                        } else {
                          s.entityMemory.push({
                            id: crypto.randomUUID(),
                            entityType: e.type,
                            name: e.name,
                            context: fullResponse.slice(0, 150),
                            conversationId: convId ?? undefined,
                            agentId: detectedAgent,
                            importance: 0.5,
                            lastSeenAt: now,
                            createdAt: now,
                          });
                        }
                      }
                      saveStore();
                    }
                  } catch { /* ignore */ }
                })();
              }
            }
            await stream.writeSSE({ event: 'done', data: '{}' });
          }
        }

        if (!doneSent) {
          doneSent = true;
          if (fullResponse) {
            store.messages.push({
              id: crypto.randomUUID(), conversationId: convId!,
              role: 'assistant', content: fullResponse, createdAt: new Date().toISOString(),
              agentId: detectedAgent,
            });
            const rawResponse = agentHeader ? fullResponse.replace(agentHeader + '\n\n', '') : fullResponse;
            setCacheEntry(body.message, detectedAgent, rawResponse);
            const cnv = store.conversations.find((cv) => cv.id === convId);
            if (cnv) cnv.updatedAt = new Date().toISOString();
            saveStore();
            if (detectedAgent === 'architect') {
              const actions = parseArchitectActions(fullResponse, detectedAgent);
              if (actions.length > 0) {
                // FIX: use 'approval_request' — matches chat-view.tsx listener
                await stream.writeSSE({ event: 'approval_request', data: JSON.stringify({ approvals: actions }) });
              }
            }
            // B-8: gate text marker fallback behind flag
            if (detectedAgent === 'manager' && !toolUseDispatched && !flag('TOOL_USE_ONLY_DELEGATION')) {
              try {
                const dels = parseTextMarkerDelegations(fullResponse);
                if (dels.length > 0) {
                  bootLogger.warn({ fallback: 'text-marker', count: dels.length }, 'AGT-05 fallback triggered');
                  logDelegations(dels, logActivity, { conversationId: convId });
                  if (!CHAT_V2) {
                    await stream.writeSSE({ event: 'delegations', data: JSON.stringify({ delegations: dels }) });
                  }
                }
              } catch { /* ignore */ }
            }
            if (detectedAgent === 'tasks-agent' || detectedAgent === 'manager') {
              const taskActions = parseTaskActions(fullResponse);
              if (taskActions.length > 0) {
                const created = executeTaskActions(taskActions);
                if (created.length > 0) {
                  await stream.writeSSE({ event: 'tasks', data: JSON.stringify({ tasks: created }) });
                }
              }
            }
            if (parseReportActions && executeReportActions) {
              try {
                const reportActions = parseReportActions(fullResponse);
                if (reportActions.length > 0) {
                  const results = executeReportActions(reportActions);
                  await stream.writeSSE({ event: 'reports', data: JSON.stringify({ results }) });
                }
              } catch { /* ignore */ }
            }
            try {
              const notifs = parseNotifyActions(fullResponse, detectedAgent || 'manager');
              if (notifs.length > 0) {
                await stream.writeSSE({ event: 'notifications', data: JSON.stringify({ notifications: notifs }) });
              }
            } catch { /* ignore */ }
            void Promise.resolve(autoSummarizeIfNeeded(convId!)).catch(() => { /* background — ignore */ });
            void Promise.resolve(autoTitleIfNeeded(convId!)).catch(() => { /* background — ignore */ });
            try {
              const recent = store.messages
                .filter((m) => m.conversationId === convId)
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 2);
              const asst = recent.find((m) => m.role === 'assistant');
              const usr = recent.find((m) => m.role === 'user');
              if (asst && usr) extractGraphFromMessage(convId!, usr.id, asst.id);
            } catch {}
          }

          if (streamBuffer) {
            const finalVisible = streamBuffer
              .replace(/\[(?:PARTICIPANT|TASK|CATEGORY|NOTE|CONV|PROJECT|AGENT|NOTIFY|ANALYST):[^\]]+\](?:\s*\{[\s\S]*?\})?/g, '');
            // BUG A FIX: legacy `text` tail flush would add a trailing duplicate
            // bubble on top of the v2 manager message.done emission.
            if (finalVisible && !CHAT_V2) await stream.writeSSE({ event: 'text', data: JSON.stringify({ content: finalVisible }) });
            streamBuffer = '';
          }

          try {
            const depth = (body.chainDepth as number) || 0;
            const MAX_DEPTH = 8;
            let nextAgent: string | null = null;
            let chainReason: 'multi-mention' | 'agent-call' | 'run-next' | null = null;

            const runNextMatch = fullResponse.match(/\[RUN:NEXT_AGENT:([^\]]+)\]/i);
            if (runNextMatch && depth < MAX_DEPTH) {
              const candidate = runNextMatch[1].trim();
              if (BUILTIN_AGENTS.some((a) => a.id === candidate) || candidate.startsWith('custom-')) {
                nextAgent = candidate; chainReason = 'run-next';
              }
            }
            if (!nextAgent && depth < MAX_DEPTH) {
              const taskAddMatch = fullResponse.match(/\[TASK:ADD:[^\]]*\bagent=([a-zA-Z0-9-]+)/i);
              if (taskAddMatch) {
                const candidate = taskAddMatch[1].trim();
                if ((BUILTIN_AGENTS.some((a) => a.id === candidate) || candidate.startsWith('custom-'))
                    && candidate !== detectedAgent) {
                  nextAgent = candidate; chainReason = 'run-next';
                }
              }
            }
            if (!nextAgent && depth < MAX_DEPTH) {
              const jsonMatch = fullResponse.match(/\{[^{}]*?"agent"\s*:\s*"([a-zA-Z0-9-]+)"[^{}]*?\}/i);
              if (jsonMatch) {
                const candidate = jsonMatch[1].trim();
                if ((BUILTIN_AGENTS.some((a) => a.id === candidate) || candidate.startsWith('custom-'))
                    && candidate !== detectedAgent) {
                  nextAgent = candidate; chainReason = 'run-next';
                }
              }
            }

            // Multi-mention chaining: walk the list of @mentions in order.
            // Previously gated on `depth === 0` which broke sequential
            // chains past the first hop ("@الراعي ثم @الباحث ثم @المُلخِّص"
            // would stop at الباحث). We now advance through the chain for
            // every step until we reach the last mentioned agent OR hit
            // MAX_DEPTH as the safety stop.
            if (allMentioned.length > 1 && depth < MAX_DEPTH) {
              const idx = allMentioned.indexOf(detectedAgent);
              const candidate = idx >= 0 && idx < allMentioned.length - 1 ? allMentioned[idx + 1] : null;
              if (candidate) { nextAgent = candidate; chainReason = 'multi-mention'; }
            }
            if (!nextAgent && depth < MAX_DEPTH) {
              const directive = detectDirectiveMentions(fullResponse);
              const calledAgent = directive.find((id) => id !== detectedAgent);
              if (calledAgent) { nextAgent = calledAgent; chainReason = 'agent-call'; }
            }
            if (!nextAgent && depth < MAX_DEPTH) {
              const directive = detectDirectiveMentions(fullResponse);
              if (directive.length > 0 && detectedAgent !== 'manager') {
                nextAgent = 'manager';
                chainReason = 'agent-call';
              }
            }

            if (nextAgent && convId) {
              const lastAssistantMsg = [...store.messages]
                .reverse()
                .find((mm) => mm.conversationId === convId && mm.role === 'assistant' && mm.agentId === detectedAgent);
              await stream.writeSSE({ event: 'next_agent_queued', data: JSON.stringify({
                agentId: nextAgent,
                name: AGENT_DISPLAY_NAMES[nextAgent] || nextAgent,
                reason: chainReason,
                depth: depth + 1,
                maxDepth: MAX_DEPTH,
                calledBy: AGENT_DISPLAY_NAMES[detectedAgent] || detectedAgent,
                replyToMessageId: lastAssistantMsg?.id,
                // Forward the original mention list (if multi-mention
                // is what's driving this chain) so the client can replay
                // it on the next turn and the server keeps seeing the
                // full sequence.
                chainMentions: chainReason === 'multi-mention' ? allMentioned : undefined,
              }) });
            }
          } catch { /* ignore */ }

          await stream.writeSSE({ event: 'done', data: '{}' });
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Stream error';
        logActivity('error', `Chat stream error`, errMsg, { agentId: detectedAgent, metadata: { conversationId: convId } });
        // BUG B FIX: surface the failure as a manager `progress` bubble instead of
        // a stream-killing `event: error`. The v2 client treats `event: error` as
        // a fatal disconnect ("Error: network error") — but most failures here are
        // round-N Anthropic hiccups where the earlier rounds already completed
        // successfully. Report the step failure in-band and let the UI carry on.
        if (CHAT_V2_GLOBAL) {
          try {
            const errMsgId = crypto.randomUUID();
            const errAt = new Date().toISOString();
            await stream.writeSSE({
              event: 'message.start',
              data: JSON.stringify({
                messageId: errMsgId,
                agentId: detectedAgent,
                agentDisplay: { ar: AGENT_DISPLAY_NAMES[detectedAgent] || detectedAgent, en: detectedAgent },
                kind: 'progress',
                createdAt: errAt,
              }),
            });
            await stream.writeSSE({
              event: 'message.delta',
              data: JSON.stringify({ messageId: errMsgId, text: `\u062E\u0637\u0623: ${errMsg}` }),
            });
            await stream.writeSSE({
              event: 'message.done',
              data: JSON.stringify({
                messageId: errMsgId,
                agentId: detectedAgent,
                usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'error' },
                artifacts: [],
              }),
            });
            await stream.writeSSE({ event: 'done', data: '{}' });
          } catch { /* connection closed */ }
        } else {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ error: errMsg }),
          });
        }
      } finally {
        stopKeepalive();
      }
    });
  });
}
