import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';
import { AnthropicProvider } from '../services/llm/index.js';

export interface ClippyRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  builtinSystemPrompts: Record<string, string>;
  anthropicCache: { current: AnthropicProvider | null };
}

/**
 * Clippy quip generator + quip preferences.
 */
export function registerClippyRoutes(app: Hono, deps: ClippyRoutesDeps): void {
  const { getStore, saveStore, builtinSystemPrompts, anthropicCache } = deps;
  const recentQuips: string[] = [];

  app.get('/api/clippy/quip', async (c) => {
    try {
      const store = getStore();
      const anthropicRow = store.providers.find((p) => p.type === 'anthropic' && p.enabled && p.apiKey);
      if (!anthropicRow?.apiKey) return c.json({ quip: null });
      if (!anthropicCache.current) anthropicCache.current = new AnthropicProvider(anthropicRow.apiKey, anthropicRow.baseUrl || undefined);

      const sys = builtinSystemPrompts.clippy || '';
      const userMsg = `أصدر quip واحد فقط: دعابة خفيفة أو تحفيز قصير. سطر واحد، أقل من 80 حرف، بدون علامات اقتباس.\n\nآخر quips (لا تكررها): ${recentQuips.slice(-3).join(' | ') || '(لا يوجد)'}`;

      let out = '';
      for await (const chunk of anthropicCache.current.chat({
        model: 'claude-haiku-4-5-20251001',
        systemPrompt: sys,
        messages: [{ role: 'user', content: userMsg }],
        maxTokens: 80,
        temperature: 0.9,
      })) {
        if (chunk.type === 'text') out += chunk.content;
        if (chunk.type === 'done' || chunk.type === 'error') break;
      }
      const quip = out.trim().replace(/^["'«»]+|["'«»]+$/g, '').split('\n')[0].slice(0, 160);
      if (quip) {
        recentQuips.push(quip);
        if (recentQuips.length > 10) recentQuips.shift();
      }
      return c.json({ quip });
    } catch (err: unknown) {
      return c.json({ quip: null, error: err instanceof Error ? err.message : 'failed' });
    }
  });

  app.get('/api/clippy/settings', (c) => {
    const store = getStore();
    const s = ((store as unknown as { clippySettings?: { quipsEnabled?: boolean; intervalMinutes?: number } }).clippySettings) || {};
    return c.json({ quipsEnabled: s.quipsEnabled ?? true, intervalMinutes: s.intervalMinutes ?? 4 });
  });

  app.put('/api/clippy/settings', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ quipsEnabled?: boolean; intervalMinutes?: number }>();
    const storeAny = store as unknown as { clippySettings?: { quipsEnabled?: boolean; intervalMinutes?: number } };
    if (!storeAny.clippySettings) storeAny.clippySettings = {};
    if (body.quipsEnabled !== undefined) storeAny.clippySettings.quipsEnabled = body.quipsEnabled;
    if (body.intervalMinutes !== undefined) storeAny.clippySettings.intervalMinutes = Math.max(1, Math.min(60, body.intervalMinutes));
    saveStore();
    return c.json({ ok: true, ...storeAny.clippySettings });
  });
}
