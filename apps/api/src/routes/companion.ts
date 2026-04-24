/**
 * Companion memory routes — persistent research diary for رمّان (research-companion).
 *
 * GET  /api/companion/memory          — list all memory entries
 * POST /api/companion/memory          — add a new entry
 * DELETE /api/companion/memory/:id    — remove an entry
 * GET  /api/companion/context         — returns formatted context string for system prompt injection
 */
import type { Hono } from 'hono';
import type { StoreData, CompanionMemoryEntry, CompanionMemoryCategory } from '../store/types.js';

interface Deps {
  getStore: () => StoreData;
  saveStore: () => void;
}

// Parse [REMEMBER category="X" tags="Y,Z"]...[/REMEMBER] blocks from agent response text.
// Returns extracted entries (without IDs — caller assigns them).
export function parseCompanionMemoryActions(
  text: string,
  conversationId?: string,
): Omit<CompanionMemoryEntry, 'id'>[] {
  const entries: Omit<CompanionMemoryEntry, 'id'>[] = [];
  const regex = /\[REMEMBER(?:\s+category="([^"]*)")?(?:\s+tags="([^"]*)")?\]([\s\S]*?)\[\/REMEMBER\]/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawCat = (match[1] ?? 'note').toLowerCase().trim();
    const validCats: CompanionMemoryCategory[] = ['insight', 'idea', 'decision', 'concern', 'goal', 'progress', 'note'];
    const category: CompanionMemoryCategory = (validCats.includes(rawCat as CompanionMemoryCategory)
      ? rawCat
      : 'note') as CompanionMemoryCategory;
    const tags = match[2] ? match[2].split(',').map((t) => t.trim()).filter(Boolean) : [];
    const content = match[3].trim();
    if (content) {
      entries.push({
        category,
        content,
        date: new Date().toISOString().slice(0, 10),
        conversationId,
        tags,
      });
    }
  }
  return entries;
}

// Build a compact context string to inject into رمّان's system prompt at chat time.
export function buildCompanionMemoryContext(entries: CompanionMemoryEntry[]): string {
  if (!entries || entries.length === 0) return '';

  const byCategory: Partial<Record<CompanionMemoryCategory, CompanionMemoryEntry[]>> = {};
  for (const e of entries) {
    if (!byCategory[e.category]) byCategory[e.category] = [];
    byCategory[e.category]!.push(e);
  }

  const categoryLabels: Record<CompanionMemoryCategory, string> = {
    insight: 'رؤى بحثية',
    idea: 'أفكار',
    decision: 'قرارات',
    concern: 'مخاوف',
    goal: 'أهداف',
    progress: 'تقدم',
    note: 'ملاحظات',
  };

  const lines: string[] = [
    '## ذاكرة رمّان — ما دوّنته من مسيرتك البحثية',
    '',
  ];

  for (const [cat, catEntries] of Object.entries(byCategory) as [CompanionMemoryCategory, CompanionMemoryEntry[]][]) {
    lines.push(`### ${categoryLabels[cat] ?? cat}`);
    for (const e of (catEntries ?? []).slice(-5)) { // keep last 5 per category
      const tagsStr = e.tags && e.tags.length > 0 ? ` [${e.tags.join(', ')}]` : '';
      lines.push(`- (${e.date})${tagsStr}: ${e.content}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function registerCompanionRoutes(
  app: Hono,
  { getStore, saveStore, anthropicCache }: Deps & { anthropicCache?: { current: import('../services/llm/index.js').AnthropicProvider | null } },
): void {

  // GET /api/companion/memory
  app.get('/api/companion/memory', (c) => {
    const store = getStore();
    return c.json(store.companionMemory ?? []);
  });

  // POST /api/companion/conversations/:id/compact
  // Summarize old messages (keep last 10) to reduce context size for long chats.
  // Uses Claude Haiku — cheap (~$0.01 per compact). User-triggered, not automatic.
  app.post('/api/companion/conversations/:id/compact', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ keepLast?: number }>().catch(() => ({} as { keepLast?: number }));
    const keepLast = body.keepLast ?? 10;

    const store = getStore();
    const conv = store.conversations?.find((cv) => cv.id === id);
    if (!conv) return c.json({ error: 'conversation not found' }, 404);
    const msgs = (store.messages ?? []).filter((m) => m.conversationId === id).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
    if (msgs.length <= keepLast + 5) return c.json({ skipped: true, reason: 'not long enough to compact', messageCount: msgs.length });

    // Check existing LLM provider
    const anthropicRow = store.providers?.find((p) => p.type === 'anthropic' && p.enabled && p.apiKey);
    if (!anthropicRow?.apiKey) return c.json({ error: 'No Anthropic provider configured' }, 503);
    if (anthropicCache) {
      if (!anthropicCache.current) {
        const { AnthropicProvider } = await import('../services/llm/index.js');
        anthropicCache.current = new AnthropicProvider(anthropicRow.apiKey, anthropicRow.baseUrl || undefined);
      }
    }
    if (!anthropicCache?.current) return c.json({ error: 'LLM not available' }, 503);

    const toSummarize = msgs.slice(0, msgs.length - keepLast);
    const textBlob = toSummarize.map((m) => `[${m.role}] ${m.content}`).join('\n\n').slice(0, 60000);

    const sys = `أنت مُلخّص خبير. اقرأ محادثة طويلة بين عبدالله ورمّان (رفيق البحث)، ولخّصها بصيغة أولى (أنا/قررت) كما يلخّصها عبدالله لنفسه. احفظ:
- القرارات البحثية المهمة
- الأفكار والنظريات المذكورة
- الأهداف والخطط
- المخاوف والأسئلة المفتوحة
- أي مصادر/أوراق مذكورة
- نقاط التقدم

اكتب بالعربية، منظّم بنقاط، موجز لكن كامل.`;

    let summary = '';
    for await (const chunk of anthropicCache.current.chat({
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: sys,
      messages: [{ role: 'user', content: `## المحادثة السابقة\n\n${textBlob}\n\n## لخّصها الآن` }],
      maxTokens: 2000,
      temperature: 0.4,
    })) {
      if (chunk.type === 'text') summary += chunk.content;
      if (chunk.type === 'done' || chunk.type === 'error') break;
    }

    // Replace old messages with a single system summary message
    const summaryMsg = {
      id: crypto.randomUUID(),
      conversationId: id,
      role: 'system' as const,
      content: `📜 **ملخص المحادثة السابقة (${toSummarize.length} رسالة)**\n\n${summary.trim()}`,
      createdAt: toSummarize[0].createdAt,
    };
    const remainingMsgs = msgs.slice(msgs.length - keepLast);
    store.messages = (store.messages ?? []).filter((m) => m.conversationId !== id);
    store.messages.push(summaryMsg, ...remainingMsgs);
    saveStore();

    return c.json({
      ok: true,
      summarized: toSummarize.length,
      kept: remainingMsgs.length,
      summaryLength: summary.length,
    });
  });


  // POST /api/companion/memory
  app.post('/api/companion/memory', async (c) => {
    const body = await c.req.json<{
      category?: CompanionMemoryCategory;
      content: string;
      tags?: string[];
      conversationId?: string;
    }>();
    if (!body.content?.trim()) return c.json({ error: 'content required' }, 400);
    const store = getStore();
    if (!store.companionMemory) store.companionMemory = [];
    const entry: CompanionMemoryEntry = {
      id: crypto.randomUUID(),
      category: body.category ?? 'note',
      content: body.content.trim(),
      date: new Date().toISOString().slice(0, 10),
      conversationId: body.conversationId,
      tags: body.tags ?? [],
    };
    store.companionMemory.push(entry);
    saveStore();
    return c.json(entry, 201);
  });

  // PATCH /api/companion/memory/:id — edit an existing entry
  app.patch('/api/companion/memory/:id', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json<{
      content?: string;
      category?: CompanionMemoryCategory;
      tags?: string[];
    }>();
    const store = getStore();
    const entry = (store.companionMemory ?? []).find((e) => e.id === id);
    if (!entry) return c.json({ error: 'not found' }, 404);
    if (body.content !== undefined) entry.content = body.content.trim();
    if (body.category !== undefined) entry.category = body.category;
    if (body.tags !== undefined) entry.tags = body.tags;
    saveStore();
    return c.json(entry);
  });

  // DELETE /api/companion/memory/:id
  app.delete('/api/companion/memory/:id', (c) => {
    const { id } = c.req.param();
    const store = getStore();
    const before = store.companionMemory?.length ?? 0;
    store.companionMemory = (store.companionMemory ?? []).filter((e) => e.id !== id);
    if (store.companionMemory.length === before) return c.json({ error: 'not found' }, 404);
    saveStore();
    return c.json({ ok: true });
  });

  // GET /api/companion/context — formatted context string for injection
  app.get('/api/companion/context', (c) => {
    const store = getStore();
    const ctx = buildCompanionMemoryContext(store.companionMemory ?? []);
    return c.json({ context: ctx });
  });
}
