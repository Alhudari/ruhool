/**
 * Ollama provider — for local LLM inference (Gemma 4, Llama, etc.)
 *
 * Connects to a local or remote Ollama instance. Yields the same
 * frame types as other providers: text, usage, error, done.
 *
 * Phase 2: point OLLAMA_BASE_URL to your local machine via Tailscale.
 */
import type { ChatChunk } from './types.js';

export class OllamaProvider {
  constructor(
    private baseUrl = 'http://localhost:11434',
  ) {}

  async *chat(params: {
    model: string;
    messages: Array<{ role: string; content: string | Array<{ type: string; [k: string]: unknown }> }>;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: Array<{ name: string; [k: string]: unknown }>;
  }): AsyncGenerator<ChatChunk, void, unknown> {
    const msgs: Array<{ role: string; content: string }> = [];
    if (params.systemPrompt) msgs.push({ role: 'system', content: params.systemPrompt });
    for (const m of params.messages) {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      msgs.push({ role: m.role, content });
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: params.model,
          messages: msgs,
          stream: true,
          options: {
            temperature: params.temperature ?? 0.7,
            num_predict: params.maxTokens ?? 4096,
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        yield { type: 'error', error: `Ollama ${res.status}: ${text}` };
        yield { type: 'done' };
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        yield { type: 'error', error: 'No response body from Ollama' };
        yield { type: 'done' };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);

            if (chunk.message?.content) {
              yield { type: 'text', content: chunk.message.content };
            }

            if (chunk.done) {
              // Ollama sends token counts in the final chunk
              totalPromptTokens = chunk.prompt_eval_count || 0;
              totalCompletionTokens = chunk.eval_count || 0;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      yield {
        type: 'usage',
        usage: {
          inputTokens: totalPromptTokens,
          outputTokens: totalCompletionTokens,
          cachedTokens: 0,
        },
      };
      yield { type: 'done' };
    } catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : String(err) };
      yield { type: 'done' };
    }
  }

  estimateCost(_inputTokens: number, _outputTokens: number, _model: string): number {
    return 0; // Local inference is free
  }

  /** Check if Ollama is reachable and list available models. */
  async testConnection(): Promise<{ ok: boolean; models?: string[]; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return { ok: false, error: `Ollama returned ${res.status}` };
      const data = await res.json() as { models?: Array<{ name: string }> };
      return { ok: true, models: data.models?.map((m) => m.name) || [] };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export function createOllamaClient(baseUrl?: string): OllamaProvider {
  return new OllamaProvider(baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434');
}
