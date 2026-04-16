/**
 * Gemini provider — extracted from the god-file (index.ts) as part of
 * REL-01 stage 2b.
 *
 * Streams `:streamGenerateContent?alt=sse` over fetch. Yields the same frame
 * types as the other providers.
 */
export class GeminiProvider {
  constructor(private apiKey: string, private baseUrl = 'https://generativelanguage.googleapis.com/v1beta') {}

  async *chat(params: {
    model: string;
    messages: Array<{ role: string; content: string | Array<{ type: string; [k: string]: unknown }> }>;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    /** Tools accepted but silently ignored — Gemini function-calling not wired here yet. */
    tools?: Array<{ name: string; [k: string]: unknown }>;
  }) {
    const contents = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
      }));
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxTokens || 4096,
      },
    };
    if (params.systemPrompt) {
      body.systemInstruction = { role: 'user', parts: [{ text: params.systemPrompt }] };
    }

    try {
      const res = await fetch(
        `${this.baseUrl}/models/${params.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok || !res.body) {
        yield { type: 'error' as const, error: `Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
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
          if (!data) continue;
          try {
            const j = JSON.parse(data);
            const text = j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
            if (text) yield { type: 'text' as const, content: text };
            if (j.usageMetadata) {
              usage = {
                inputTokens: j.usageMetadata.promptTokenCount || 0,
                outputTokens: j.usageMetadata.candidatesTokenCount || 0,
                cachedTokens: j.usageMetadata.cachedContentTokenCount || 0,
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
      yield { type: 'error' as const, error: err instanceof Error ? err.message : 'Gemini error' };
    }
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string) {
    const table: Record<string, { i: number; o: number }> = {
      'gemini-1.5-pro': { i: 0.00125, o: 0.005 },
      'gemini-1.5-flash': { i: 0.000075, o: 0.0003 },
      'gemini-2.0-flash': { i: 0.0001, o: 0.0004 },
      'gemini-2.5-pro': { i: 0.00125, o: 0.005 },
      'gemini-2.5-flash': { i: 0.0001, o: 0.0004 },
    };
    const m = table[model] || { i: 0.0005, o: 0.002 };
    return (inputTokens / 1000) * m.i + (outputTokens / 1000) * m.o;
  }
}

export function createGeminiClient(deps: { apiKey: string; baseUrl?: string }): GeminiProvider {
  return new GeminiProvider(deps.apiKey, deps.baseUrl);
}
