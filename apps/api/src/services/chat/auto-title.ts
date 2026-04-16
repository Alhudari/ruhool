/**
 * Auto-title + auto-summary helpers — extracted from the god-file (index.ts)
 * as part of REL-01 stage 2d.
 *
 * Factory pattern: caller injects store accessor, persistence, provider,
 * logger, and the in-memory guard Sets (from state/chat-runtime.ts).
 */
import crypto from 'node:crypto';
import type { StoreData, MsgRecord, MemoryRecord } from '../../store/types.js';

export interface AutoTitleLogger {
  info: (msg: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

export interface AutoTitleProvider {
  chat: (params: {
    model: string;
    systemPrompt?: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens?: number;
    temperature?: number;
  }) => AsyncIterable<{ type: string; content?: string }>;
}

export interface AutoTitleDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  getProvider: () => AutoTitleProvider | null;
  titledConversations: Set<string>;
  summarizedConversations: Set<string>;
  logger: AutoTitleLogger;
  generateSummary: (messages: MsgRecord[]) => string | null;
}

export function createAutoTitle(deps: AutoTitleDeps) {
  const {
    getStore, saveStore, getProvider,
    titledConversations, summarizedConversations,
    logger, generateSummary,
  } = deps;

  async function autoTitleIfNeeded(convId: string): Promise<void> {
    const store = getStore();
    const conv = store.conversations.find((c) => c.id === convId);
    if (!conv || titledConversations.has(convId)) return;
    const msgs = store.messages
      .filter((m) => m.conversationId === convId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const hasUser = msgs.some((m) => m.role === 'user');
    const hasAssistant = msgs.some((m) => m.role === 'assistant');
    if (!hasUser || !hasAssistant) return;
    titledConversations.add(convId);

    try {
      const provider = getProvider();
      if (!provider) return;
      const firstExchange = msgs.slice(0, 4).map((m) => `${m.role === 'user' ? 'U' : 'A'}: ${m.content.slice(0, 400)}`).join('\n');
      const sysPrompt = conv.language === 'ar'
        ? 'استخرج عنوان المحادثة التالية في 3-6 كلمات فقط تصف الموضوع الأساسي. لا تضع علامات اقتباس. لا تشرح. فقط العنوان.'
        : 'Extract a 3-6 word title describing the main topic. No quotes. No explanation. Title only.';
      let title = '';
      for await (const chunk of provider.chat({
        model: 'claude-haiku-4-5-20251001',
        systemPrompt: sysPrompt,
        messages: [{ role: 'user', content: firstExchange }],
        maxTokens: 40,
        temperature: 0.3,
      })) {
        if (chunk.type === 'text' && chunk.content) title += chunk.content;
        if (chunk.type === 'done') break;
        if (chunk.type === 'error') return;
      }
      title = title.trim().replace(/^["'«»]+|["'«»]+$/g, '').replace(/\n.*$/s, '').slice(0, 80);
      if (title && title.length >= 3) {
        conv.title = title;
        conv.updatedAt = new Date().toISOString();
        saveStore();
        logger.info(`[auto-title] ${convId.slice(0, 8)}... → "${title}"`);
      }
    } catch (err) {
      logger.warn({ err }, '[auto-title] failed');
    }
  }

  function autoSummarizeIfNeeded(convId: string): void {
    if (summarizedConversations.has(convId)) return;
    const store = getStore();
    const msgs = store.messages.filter((m) => m.conversationId === convId);
    if (msgs.length < 6) return;

    summarizedConversations.add(convId);
    const sorted = msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const summary = generateSummary(sorted);
    if (!summary) return;

    const agentId = [...sorted].reverse().find((m) => m.agentId)?.agentId || 'manager';
    const memory: MemoryRecord = {
      id: crypto.randomUUID(), agentId, tier: 'short-term',
      content: summary, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    store.memories.push(memory);
    saveStore();
    logger.info(`[auto-summary] Conversation ${convId.slice(0, 8)}... summarized for ${agentId}`);
  }

  return { autoTitleIfNeeded, autoSummarizeIfNeeded };
}
