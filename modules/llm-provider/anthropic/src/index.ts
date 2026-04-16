import Anthropic from '@anthropic-ai/sdk';

interface LLMModel {
  id: string;
  name: string;
  provider: string;
  maxTokens: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
  inputCostPer1k: number;
  outputCostPer1k: number;
}

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatParams {
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

interface ChatChunk {
  type: 'text' | 'tool_call' | 'usage' | 'done' | 'error';
  content?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
  };
  error?: string;
}

const MODELS: LLMModel[] = [
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    maxTokens: 32768,
    supportsVision: true,
    supportsTools: true,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.075,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    maxTokens: 16384,
    supportsVision: true,
    supportsTools: true,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    maxTokens: 8192,
    supportsVision: true,
    supportsTools: true,
    inputCostPer1k: 0.001,
    outputCostPer1k: 0.005,
  },
];

export class AnthropicProvider {
  id = 'anthropic';
  name = { en: 'Anthropic Claude', ar: 'أنثروبيك كلود' };

  private client: Anthropic;

  constructor(apiKey: string, baseUrl?: string) {
    this.client = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async listModels(): Promise<LLMModel[]> {
    return MODELS;
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const systemPrompt = params.systemPrompt || params.messages.find(m => m.role === 'system')?.content;
    const filteredMessages = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    try {
      const stream = this.client.messages.stream({
        model: params.model,
        max_tokens: params.maxTokens || 4096,
        temperature: params.temperature ?? 0.7,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: filteredMessages,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield { type: 'text', content: event.delta.text };
        }
      }

      const finalMessage = await stream.finalMessage();
      yield {
        type: 'usage',
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
          cachedTokens: (finalMessage.usage as Record<string, number>).cache_read_input_tokens || 0,
        },
      };
      yield { type: 'done' };
    } catch (err) {
      yield {
        type: 'error',
        error: err instanceof Error ? err.message : 'Anthropic API error',
      };
    }
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    const modelInfo = MODELS.find((m) => m.id === model) || MODELS[1];
    return (
      (inputTokens / 1000) * modelInfo.inputCostPer1k +
      (outputTokens / 1000) * modelInfo.outputCostPer1k
    );
  }
}
