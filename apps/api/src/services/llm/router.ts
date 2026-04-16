/**
 * LLM router — extracted from the god-file (index.ts) as part of REL-01 stage 2b.
 *
 * Given a model id and the current store (for provider credentials), returns a
 * unified provider facade with `chat` + `estimateCost`. Falls back to Anthropic
 * when the model id doesn't match OpenAI / Gemini prefixes.
 *
 * Pure factory: no module-level singletons live here. Callers that want to
 * cache the Anthropic client across requests should do so themselves.
 */
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';
import type { StoreData } from '../../store/types.js';
import type { AnthropicTool, ChatChunk } from './types.js';

export type UnifiedProvider = {
  name: 'anthropic' | 'openai' | 'gemini' | 'ollama';
  chat: (params: {
    model: string;
    messages: Array<{ role: string; content: string | Array<{ type: string; [k: string]: unknown }> }>;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: AnthropicTool[];
  }) => AsyncGenerator<ChatChunk, void, unknown>;
  estimateCost: (inputTokens: number, outputTokens: number, model: string) => number;
};

export interface RouterDeps {
  store: Pick<StoreData, 'providers'>;
  /** Optional cached Anthropic client holder — keeps the singleton semantics
   *  the god-file used. If omitted, a fresh client is built every call. */
  anthropicCache?: { current: AnthropicProvider | null };
}

/**
 * Returns the right provider for a given model id. Returns `null` if the
 * matching provider row is missing or disabled.
 */
export function pickProviderForModel(model: string, deps: RouterDeps): UnifiedProvider | null {
  const { store, anthropicCache } = deps;
  const m = (model || '').toLowerCase();

  // Ollama local models — gemma, llama, mistral, etc.
  if (m.startsWith('gemma') || m.startsWith('llama') || m.startsWith('mistral') || m.startsWith('qwen') || m.startsWith('phi') || m.startsWith('codellama')) {
    const row = store.providers.find((p) => p.type === 'ollama' && p.enabled);
    const baseUrl = row?.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const p = new OllamaProvider(baseUrl);
    return { name: 'ollama', chat: p.chat.bind(p) as UnifiedProvider['chat'], estimateCost: p.estimateCost.bind(p) };
  }

  if (m.startsWith('gpt-') || m.startsWith('o1-') || m.startsWith('o3-')) {
    const row = store.providers.find((p) => p.type === 'openai' && p.enabled && p.apiKey);
    if (!row?.apiKey) return null;
    const p = new OpenAIProvider(row.apiKey, row.baseUrl || undefined);
    return { name: 'openai', chat: p.chat.bind(p) as UnifiedProvider['chat'], estimateCost: p.estimateCost.bind(p) };
  }
  if (m.startsWith('gemini-') || m.startsWith('models/gemini-')) {
    const row = store.providers.find((p) => p.type === 'google-gemini' && p.enabled && p.apiKey);
    if (!row?.apiKey) return null;
    const cleanModel = model.replace(/^models\//, '');
    const p = new GeminiProvider(row.apiKey, row.baseUrl || undefined);
    const wrappedChat = (params: Parameters<typeof p.chat>[0]) => p.chat({ ...params, model: cleanModel });
    return { name: 'gemini', chat: wrappedChat as UnifiedProvider['chat'], estimateCost: p.estimateCost.bind(p) };
  }

  // Default → Anthropic (optionally cached).
  let client = anthropicCache?.current ?? null;
  if (!client) {
    const row = store.providers.find((p) => p.type === 'anthropic' && p.enabled && p.apiKey);
    if (!row?.apiKey) return null;
    client = new AnthropicProvider(row.apiKey, row.baseUrl || undefined);
    if (anthropicCache) anthropicCache.current = client;
  }
  return {
    name: 'anthropic',
    chat: client.chat.bind(client),
    estimateCost: client.estimateCost.bind(client),
  };
}
