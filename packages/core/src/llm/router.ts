import { eventBus } from '../events/index.js';

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

interface LLMProviderLike {
  id: string;
  name: { en: string; ar: string };
  testConnection(): Promise<{ ok: boolean; error?: string }>;
  chat(params: ChatParams): AsyncIterable<ChatChunk>;
  estimateCost(inputTokens: number, outputTokens: number, model: string): number;
}

interface RegisteredProvider {
  instance: LLMProviderLike;
  enabled: boolean;
}

class LLMRouter {
  private providers = new Map<string, RegisteredProvider>();
  private defaultProviderId: string | null = null;

  register(provider: LLMProviderLike, enabled = true) {
    this.providers.set(provider.id, { instance: provider, enabled });
    if (!this.defaultProviderId && enabled) {
      this.defaultProviderId = provider.id;
    }
  }

  unregister(providerId: string) {
    this.providers.delete(providerId);
    if (this.defaultProviderId === providerId) {
      const first = [...this.providers.entries()].find(([, p]) => p.enabled);
      this.defaultProviderId = first ? first[0] : null;
    }
  }

  setDefault(providerId: string) {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider "${providerId}" not registered`);
    }
    this.defaultProviderId = providerId;
  }

  getProvider(providerId?: string): LLMProviderLike {
    const id = providerId || this.defaultProviderId;
    if (!id) throw new Error('No LLM provider available');

    const reg = this.providers.get(id);
    if (!reg) throw new Error(`Provider "${id}" not found`);
    if (!reg.enabled) throw new Error(`Provider "${id}" is disabled`);

    return reg.instance;
  }

  listProviders() {
    return [...this.providers.entries()].map(([id, reg]) => ({
      id,
      name: reg.instance.name,
      enabled: reg.enabled,
    }));
  }

  async *chat(
    params: ChatParams & {
      providerId?: string;
      agentId?: string;
      conversationId?: string;
    }
  ): AsyncIterable<ChatChunk> {
    const startTime = Date.now();
    const provider = this.getProvider(params.providerId);
    let totalInput = 0;
    let totalOutput = 0;
    let totalCached = 0;
    let success = true;
    let errorMsg: string | undefined;

    try {
      for await (const chunk of provider.chat(params)) {
        if (chunk.type === 'usage' && chunk.usage) {
          totalInput = chunk.usage.inputTokens;
          totalOutput = chunk.usage.outputTokens;
          totalCached = chunk.usage.cachedTokens || 0;
        }
        if (chunk.type === 'error') {
          success = false;
          errorMsg = chunk.error;
        }
        yield chunk;
      }
    } catch (err) {
      success = false;
      errorMsg = err instanceof Error ? err.message : String(err);
      yield { type: 'error', error: errorMsg };
    } finally {
      const durationMs = Date.now() - startTime;
      const cost = provider.estimateCost(totalInput, totalOutput, params.model);

      eventBus.emit({
        type: 'api:usage',
        record: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          provider: provider.id,
          model: params.model,
          agentId: params.agentId,
          conversationId: params.conversationId,
          inputTokens: totalInput,
          outputTokens: totalOutput,
          cachedTokens: totalCached,
          inputCostUsd: 0,
          outputCostUsd: 0,
          totalCostUsd: cost,
          durationMs,
          success,
          error: errorMsg,
        },
      });
    }
  }

  async testConnection(providerId: string) {
    const provider = this.getProvider(providerId);
    return provider.testConnection();
  }

  setEnabled(providerId: string, enabled: boolean) {
    const reg = this.providers.get(providerId);
    if (!reg) throw new Error(`Provider "${providerId}" not found`);
    reg.enabled = enabled;
  }
}

export const llmRouter = new LLMRouter();
export type { LLMRouter };
