/**
 * OpenAI provider — extracted from the god-file (index.ts) as part of
 * REL-01 stage 2b.
 *
 * Streams `chat/completions` over fetch (no SDK) so we avoid an extra
 * dependency. Yields the same frame types as the Anthropic provider:
 * `{ type: 'text', content }`, `{ type: 'usage', usage }`,
 * `{ type: 'error', error }`, `{ type: 'done' }`.
 */
export class OpenAIProvider {
  constructor(private apiKey: string, private baseUrl = 'https://api.openai.com/v1') {}

  async *chat(params: {
    model: string;
    messages: Array<{ role: string; content: string | Array<{ type: string; [k: string]: unknown }> }>;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    /** Tools are accepted but silently ignored — OpenAI has no equivalent wired here yet. */
    tools?: Array<{ name: string; [k: string]: unknown }>;
  }) {
    const msgs: Array<{ role: string; content: string }> = [];
    if (params.systemPrompt) msgs.push({ role: 'system', content: params.systemPrompt });
    for (const m of params.messages) {
      // Coerce non-string content (e.g. Anthropic tool_use blocks) to a JSON string;
      // OpenAI doesn't consume those shapes here.
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      msgs.push({ role: m.role, content });
    }

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: params.model,
          messages: msgs,
          stream: true,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens || 4096,
          stream_options: { include_usage: true },
        }),
      });
      if (!res.ok || !res.body) {
        yield { type: 'error' as const, error: `OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let usage: { inputTokens: number; outputTokens: number; cachedTokens: number } | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const j = JSON.parse(data);
            const delta = j.choices?.[0]?.delta?.content;
            if (delta) yield { type: 'text' as const, content: delta };
            if (j.usage) {
              usage = {
                inputTokens: j.usage.prompt_tokens || 0,
                outputTokens: j.usage.completion_tokens || 0,
                cachedTokens: j.usage.prompt_tokens_details?.cached_tokens || 0,
              };
            }
          } catch {
            /* skip */
          }
        }
      }
      if (usage) yield { type: 'usage' as const, usage };
      yield { type: 'done' as const };
    } catch (err: unknown) {
      yield { type: 'error' as const, error: err instanceof Error ? err.message : 'OpenAI error' };
    }
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string) {
    const table: Record<string, { i: number; o: number }> = {
      'gpt-4o': { i: 0.0025, o: 0.01 },
      'gpt-4o-mini': { i: 0.00015, o: 0.0006 },
      'gpt-5': { i: 0.005, o: 0.015 },
      'gpt-5-mini': { i: 0.0005, o: 0.002 },
    };
    const m = table[model] || { i: 0.001, o: 0.003 };
    return (inputTokens / 1000) * m.i + (outputTokens / 1000) * m.o;
  }
}

export function createOpenAIClient(deps: { apiKey: string; baseUrl?: string }): OpenAIProvider {
  return new OpenAIProvider(deps.apiKey, deps.baseUrl);
}
