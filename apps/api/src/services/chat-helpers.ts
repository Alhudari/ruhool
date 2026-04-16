// Chat helper bag — consolidates the lazy graph-extractor + auto-title wiring that
// used to live in index.ts (stage 2d final trim). Built on top of the shared provider
// picker. Zero behavior change: same lazy init semantics, same log shape.

import { AnthropicProvider } from './llm/index.js';
import { createGraphExtractor } from './chat/graph-extractor.js';
import { createAutoTitle } from './chat/auto-title.js';
import { generateSummary } from './chat/summary.js';
import { summarizedConversations, titledConversations, graphExtractedMessages } from '../state/chat-runtime.js';
import type { StoreData } from '../store/types.js';

type AnthropicCache = { current: AnthropicProvider | null };

type LoggerLike = {
  info: (msg: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

type ChatProvider = {
  chat: (params: { model: string; systemPrompt?: string; messages: Array<{ role: string; content: string }>; maxTokens?: number; temperature?: number }) => AsyncIterable<{ type: string; content?: string }>;
};

export interface ChatHelpersDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  anthropicCache: AnthropicCache;
  logger: LoggerLike;
}

export function createChatHelpers(deps: ChatHelpersDeps) {
  const { getStore, saveStore, anthropicCache, logger } = deps;

  function getChatProvider(): ChatProvider | null {
    const store = getStore();
    const anthropicRow = store.providers.find((p) => p.type === 'anthropic' && p.enabled && p.apiKey);
    if (!anthropicRow?.apiKey) return null;
    if (!anthropicCache.current) {
      anthropicCache.current = new AnthropicProvider(anthropicRow.apiKey, anthropicRow.baseUrl || undefined);
    }
    return anthropicCache.current as unknown as ChatProvider;
  }

  let _graphExtractor: ReturnType<typeof createGraphExtractor> | null = null;
  function getGraphExtractor() {
    if (!_graphExtractor) _graphExtractor = createGraphExtractor({
      getStore, saveStore, getProvider: getChatProvider,
      extractedMessages: graphExtractedMessages,
      logger: { warn: (o, m) => logger.warn(o, m) },
    });
    return _graphExtractor;
  }
  async function extractGraphFromMessage(convId: string, userMsgId: string, assistantMsgId: string) {
    return getGraphExtractor().extractGraphFromMessage(convId, userMsgId, assistantMsgId);
  }

  let _autoTitle: ReturnType<typeof createAutoTitle> | null = null;
  function getAutoTitle() {
    if (!_autoTitle) _autoTitle = createAutoTitle({
      getStore, saveStore, getProvider: getChatProvider,
      titledConversations, summarizedConversations,
      logger: { info: (m) => logger.info(m), warn: (o, m) => logger.warn(o, m) },
      generateSummary,
    });
    return _autoTitle;
  }
  async function autoTitleIfNeeded(convId: string) { return getAutoTitle().autoTitleIfNeeded(convId); }
  function autoSummarizeIfNeeded(convId: string) { return getAutoTitle().autoSummarizeIfNeeded(convId); }

  return { getChatProvider, extractGraphFromMessage, autoTitleIfNeeded, autoSummarizeIfNeeded };
}
