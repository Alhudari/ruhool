/**
 * Anthropic provider — extracted from the god-file (index.ts) as part of
 * REL-01 stage 2b.
 *
 * Provides a class wrapper over `@anthropic-ai/sdk` with:
 * - connection test
 * - streaming chat (async-generator yielding text, usage, error, done frames)
 * - per-model cost estimation
 *
 * A thin factory (`createAnthropicClient`) is also exported so callers can use
 * pure functions with injected `{ apiKey, baseUrl }` deps — no singletons live
 * in this module.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { AnthropicTool, ChatChunk } from './types.js';

export interface AnthropicModelInfo {
  id: string;
  name: string;
  inputPer1k: number;
  outputPer1k: number;
}

export class AnthropicProvider {
  id = 'anthropic';
  name = { en: 'Anthropic Claude', ar: 'أنثروبيك كلود' };
  private client: Anthropic;

  static MODELS: AnthropicModelInfo[] = [
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', inputPer1k: 0.015, outputPer1k: 0.075 },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', inputPer1k: 0.003, outputPer1k: 0.015 },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', inputPer1k: 0.001, outputPer1k: 0.005 },
  ];

  constructor(apiKey: string, baseUrl?: string) {
    this.client = new Anthropic({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) });
  }

  async testConnection() {
    try {
      await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  async *chat(params: {
    model: string;
    messages: Array<{ role: string; content: string | Array<{ type: string; [k: string]: unknown }> }>;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: AnthropicTool[];
    signal?: AbortSignal;
  }): AsyncGenerator<ChatChunk, void, unknown> {
    const systemPrompt = params.systemPrompt;
    const msgs = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string | Array<{ type: string; [k: string]: unknown }> }));

    try {
      const stream = this.client.messages.stream(
        {
          model: params.model,
          max_tokens: params.maxTokens || 4096,
          temperature: params.temperature ?? 0.7,
          ...(systemPrompt ? { system: systemPrompt } : {}),
          ...(params.tools && params.tools.length > 0 ? { tools: params.tools } : {}),
          messages: msgs as unknown as Anthropic.MessageParam[],
        },
        // F-008: forward abort signal so client disconnect cancels the upstream call
        params.signal ? { signal: params.signal } : undefined
      );

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', content: event.delta.text };
        }
      }

      const final = await stream.finalMessage();

      // Surface completed tool_use blocks (AGT-05 delegate_to_specialist).
      for (const block of final.content) {
        if (block.type === 'tool_use') {
          yield {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: (block.input || {}) as Record<string, unknown>,
          };
        }
      }

      yield {
        type: 'usage',
        usage: {
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
          cachedTokens: (final.usage as unknown as Record<string, number>).cache_read_input_tokens || 0,
        },
      };
      yield { type: 'done' };
    } catch (err: unknown) {
      yield { type: 'error', error: err instanceof Error ? err.message : 'API error' };
    }
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string) {
    const m = AnthropicProvider.MODELS.find((x) => x.id === model) || AnthropicProvider.MODELS[1];
    return (inputTokens / 1000) * m.inputPer1k + (outputTokens / 1000) * m.outputPer1k;
  }
}

/**
 * Factory: build a fresh AnthropicProvider from credentials. Pure; does not
 * cache a singleton. Callers that want singleton semantics should do so
 * themselves.
 */
export function createAnthropicClient(deps: { apiKey: string; baseUrl?: string }): AnthropicProvider {
  return new AnthropicProvider(deps.apiKey, deps.baseUrl);
}
