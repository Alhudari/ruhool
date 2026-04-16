/**
 * LLM services barrel — extracted from the god-file (index.ts) as part of
 * REL-01 stage 2b.
 */
export { AnthropicProvider, createAnthropicClient } from './anthropic.js';
export { OpenAIProvider, createOpenAIClient } from './openai.js';
export { GeminiProvider, createGeminiClient } from './gemini.js';
export { OllamaProvider, createOllamaClient } from './ollama.js';
export { pickProviderForModel, type UnifiedProvider, type RouterDeps } from './router.js';
export { computeCostUsd, recordUsage, type UsageInput } from './usage.js';
export type {
  AnthropicTool,
  ChatMessage,
  ChatCallOptions,
  ChatChunk,
  TextChunk,
  UsageChunk,
  ErrorChunk,
  DoneChunk,
  ToolUseChunk,
} from './types.js';
