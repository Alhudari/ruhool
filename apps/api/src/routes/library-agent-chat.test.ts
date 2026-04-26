/**
 * Library Agent Chat — backend tests.
 *
 * Covers:
 *  - validateToolInput: input validation per tool name
 *  - dispatchReadTool: read-only tool execution against an in-memory store
 *  - SSE chat handler: streams text + tool_call + done events; persists the
 *    assistant message; auto-executes read tools; pauses on proposal tools
 *  - tool-results endpoint: applies accepted/edited proposals via the matrix
 *  - DELETE conversation: removes the thread
 *  - regression: a follow-up turn after a pending proposal carries a
 *    placeholder tool_result so Anthropic doesn't 400
 *
 * The Anthropic provider is faked end-to-end (no network).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';

import {
  registerLibraryAgentChatRoutes,
  validateToolInput,
  dispatchReadTool,
  estimateTokens,
} from './library-agent-chat.js';
import type { StoreData, LibraryEntity } from '../store/types.js';
import type { AnthropicProvider } from '../services/llm/anthropic.js';

// ─── Fakes ──────────────────────────────────────────────────────────────────

function makeStore(): StoreData {
  return {
    providers: [{ id: 'p1', type: 'anthropic', enabled: true, apiKey: 'sk-fake' }],
    conversations: [],
    messages: [],
    usage: [],
    customAgents: [],
    memories: [],
    papers: [],
    notes: [],
    workflows: [],
    tools: [],
    approvals: [],
    activityLog: [],
    schedules: [],
    tasks: [],
    taskLists: [],
    libraryEntities: [],
    matrixSchemas: [],
    libraryAgentConversations: [],
  } as unknown as StoreData;
}

function makeEntity(over: Partial<LibraryEntity> = {}): LibraryEntity {
  const now = new Date().toISOString();
  return {
    id: 'e-1',
    type: 'paper',
    title: 'Sample paper',
    notes: '',
    subNotes: [],
    links: [],
    tags: ['bim'],
    authors: 'Doe, J',
    year: 2025,
    abstract: 'About BIM in Kuwait.',
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

interface ScriptedChunk {
  type: 'text' | 'tool_use' | 'usage' | 'done' | 'error';
  content?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  usage?: { inputTokens: number; outputTokens: number; cachedTokens: number };
  error?: string;
}

function fakeProvider(chunks: ScriptedChunk[]): AnthropicProvider {
  return {
    name: 'anthropic',
    async *chat() {
      for (const c of chunks) yield c as never;
    },
    estimateCost: (input: number, output: number) => (input * 0.000003) + (output * 0.000015),
  } as unknown as AnthropicProvider;
}

function makeApp(store: StoreData, provider: AnthropicProvider) {
  const app = new Hono();
  registerLibraryAgentChatRoutes(app, {
    getStore: () => store,
    saveStore: () => {},
    pickProviderForModel: () => provider,
  });
  return app;
}

// Hono's app.request return type is Response | Promise<Response>; this helper
// awaits + JSON-parses to keep call sites tidy.
async function reqJson<T>(p: Response | Promise<Response>): Promise<T> {
  const r = await p;
  return (await r.json()) as T;
}

async function newConversation(app: Hono, body: { entityId: string | null; entityType: string; scope: string }): Promise<{ id: string }> {
  const r = await reqJson<{ conversation: { id: string } }>(
    app.request('/api/library/agent/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return r.conversation;
}

async function readSSE(res: Response): Promise<Array<{ event: string; data: string }>> {
  if (!res.body) return [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const events: Array<{ event: string; data: string }> = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }
  for (const block of buf.split('\n\n')) {
    if (!block.trim()) continue;
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (data.length > 0) events.push({ event, data: data.join('\n') });
  }
  return events;
}

// ─── validateToolInput ────────────────────────────────────────────────────

describe('validateToolInput', () => {
  it('propose_cell_value requires entityId, columnKey, value', () => {
    expect(validateToolInput('propose_cell_value', {}).ok).toBe(false);
    expect(validateToolInput('propose_cell_value', { entityId: 'e1' }).ok).toBe(false);
    expect(validateToolInput('propose_cell_value', { entityId: 'e1', columnKey: 'aims' }).ok).toBe(false);
    expect(validateToolInput('propose_cell_value', { entityId: 'e1', columnKey: 'aims', value: null }).ok).toBe(true);
    expect(validateToolInput('propose_cell_value', { entityId: 'e1', columnKey: 'aims', value: 'x' }).ok).toBe(true);
  });

  it('propose_new_column requires key, labels, and a known kind', () => {
    expect(validateToolInput('propose_new_column', {}).ok).toBe(false);
    expect(validateToolInput('propose_new_column', { key: 'foo', labelEn: 'Foo' }).ok).toBe(false);
    expect(validateToolInput('propose_new_column', { key: 'foo', labelEn: 'Foo', labelAr: 'فو', kind: 'unknown' }).ok).toBe(false);
    expect(validateToolInput('propose_new_column', { key: 'foo', labelEn: 'Foo', labelAr: 'فو', kind: 'string' }).ok).toBe(true);
  });

  it('read_entities accepts empty input', () => {
    expect(validateToolInput('read_entities', {}).ok).toBe(true);
    expect(validateToolInput('read_entities', { limit: -1 }).ok).toBe(false);
  });

  it('read_zotero_metadata requires zoteroKey', () => {
    expect(validateToolInput('read_zotero_metadata', {}).ok).toBe(false);
    expect(validateToolInput('read_zotero_metadata', { zoteroKey: 'ABC' }).ok).toBe(true);
  });

  it('search_library requires non-empty query', () => {
    expect(validateToolInput('search_library', { query: '' }).ok).toBe(false);
    expect(validateToolInput('search_library', { query: '   ' }).ok).toBe(false);
    expect(validateToolInput('search_library', { query: 'BIM' }).ok).toBe(true);
  });
});

// ─── estimateTokens (Arabic-aware) ────────────────────────────────────────

describe('estimateTokens', () => {
  it('uses ~4 chars/token for ASCII text', () => {
    // 100 chars of ASCII → ~25 tokens
    const t = 'a'.repeat(100);
    expect(estimateTokens(t)).toBe(25);
  });

  it('uses ~2 chars/token for Arabic text (UTF-8 multi-byte)', () => {
    // 100 chars of Arabic → ~50 tokens (double the ASCII rate)
    const t = 'ا'.repeat(100);
    expect(estimateTokens(t)).toBe(50);
  });

  it('mixed text adds the two ratios together', () => {
    // 40 ASCII + 40 Arabic = 10 + 20 = 30
    const t = 'a'.repeat(40) + 'ا'.repeat(40);
    expect(estimateTokens(t)).toBe(30);
  });

  it('does NOT undercount a heavy Arabic conversation', () => {
    // ~6000 Arabic chars used to estimate ~1500 tokens (6000/4) under the
    // old heuristic — too low, the rolling-summary trim would never fire.
    // Now ~3000 tokens → near the 12k threshold for normal conversations.
    const t = 'هذا نص عربي طويل جداً يصف موضوع البحث بكل تفاصيله. '.repeat(120);
    const oldEstimate = Math.ceil(t.length / 4);
    const newEstimate = estimateTokens(t);
    expect(newEstimate).toBeGreaterThan(oldEstimate);
    expect(newEstimate).toBeGreaterThanOrEqual(Math.floor(oldEstimate * 1.5));
  });
});

// ─── dispatchReadTool ────────────────────────────────────────────────────

describe('dispatchReadTool', () => {
  it('read_entities returns a capped slice with stripped abstracts', () => {
    const store = makeStore();
    store.libraryEntities = [
      makeEntity({ id: 'a', abstract: 'x'.repeat(2000) }),
      makeEntity({ id: 'b' }),
      makeEntity({ id: 'c', deletedAt: new Date().toISOString() }),
    ];
    const r = dispatchReadTool('read_entities', { limit: 5 }, store) as { count: number; entities: Array<{ id: string; abstract?: string }> };
    expect(r.count).toBe(2);
    expect(r.entities.find((e) => e.id === 'c')).toBeUndefined();
    expect((r.entities[0].abstract ?? '').length).toBeLessThanOrEqual(600);
  });

  it('read_entities filters by ids', () => {
    const store = makeStore();
    store.libraryEntities = [makeEntity({ id: 'a' }), makeEntity({ id: 'b' })];
    const r = dispatchReadTool('read_entities', { ids: ['b'] }, store) as { count: number };
    expect(r.count).toBe(1);
  });

  it('search_library matches title/authors/abstract substring', () => {
    const store = makeStore();
    store.libraryEntities = [
      makeEntity({ id: 'a', title: 'BIM in Gulf', abstract: 'On building information modeling.' }),
      makeEntity({ id: 'b', title: 'IoT only', abstract: 'mentions BIM in passing' }),
      makeEntity({ id: 'c', title: 'Unrelated', abstract: 'general topic with no match' }),
    ];
    const r = dispatchReadTool('search_library', { query: 'bim' }, store) as { count: number };
    expect(r.count).toBe(2);
  });

  it('read_zotero_metadata reports missing snapshot', () => {
    const store = makeStore();
    const r = dispatchReadTool('read_zotero_metadata', { zoteroKey: 'X' }, store) as { error?: string };
    expect(r.error).toMatch(/snapshot/i);
  });
});

// ─── SSE chat handler ───────────────────────────────────────────────────

describe('POST /api/library/agent/conversations/:id/messages (SSE)', () => {
  let store: StoreData;
  beforeEach(() => {
    store = makeStore();
    store.libraryEntities = [makeEntity()];
  });

  it('streams text deltas and persists the assistant message', async () => {
    const provider = fakeProvider([
      { type: 'text', content: 'Hello, ' },
      { type: 'text', content: 'world.' },
      { type: 'usage', usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    const app = makeApp(store, provider);
    const conv = await newConversation(app, { entityId: 'e-1', entityType: 'paper', scope: 'entity' });
    const res = await app.request(`/api/library/agent/conversations/${conv.id}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hi' }),
    });
    expect(res.status).toBe(200);
    const events = await readSSE(res as Response);
    const textDeltas = events.filter((e) => e.event === 'text').map((e) => JSON.parse(e.data).delta as string);
    expect(textDeltas.join('')).toBe('Hello, world.');
    const done = events.find((e) => e.event === 'done');
    expect(done).toBeDefined();

    const stored = store.libraryAgentConversations![0];
    const lastAsst = stored.messages.find((m) => m.role === 'assistant');
    expect(lastAsst?.content).toBe('Hello, world.');
    expect(lastAsst?.outputTokens).toBe(50);
    expect(lastAsst?.costUsd).toBeGreaterThan(0);
  });

  it('auto-executes read_entities and emits a tool_call event with result', async () => {
    const provider = fakeProvider([
      { type: 'text', content: 'Looking up siblings.' },
      { type: 'tool_use', id: 'tu-1', name: 'read_entities', input: { limit: 3 } },
      { type: 'usage', usage: { inputTokens: 80, outputTokens: 30, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    const app = makeApp(store, provider);
    const conv = await newConversation(app, { entityId: 'e-1', entityType: 'paper', scope: 'entity' });
    const res = await app.request(`/api/library/agent/conversations/${conv.id}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'find similar' }),
    });
    const events = await readSSE(res as Response);
    const toolEvents = events.filter((e) => e.event === 'tool_call').map((e) => JSON.parse(e.data).toolCall);
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0].name).toBe('read_entities');
    expect(toolEvents[0].status).toBe('accepted');
    expect(toolEvents[0].result).toBeDefined();
  });

  it('emits a pending tool_call for propose_cell_value (no auto-apply)', async () => {
    store.matrixSchemas = [{
      type: 'paper',
      columns: [{ key: 'aims', labelEn: 'Aims', labelAr: 'أهداف', kind: 'text', visible: true, order: 0, source: 'custom' }],
      updatedAt: new Date().toISOString(),
    }];
    const provider = fakeProvider([
      { type: 'tool_use', id: 'tu-2', name: 'propose_cell_value', input: { entityId: 'e-1', columnKey: 'aims', value: 'Investigate BIM adoption.' } },
      { type: 'usage', usage: { inputTokens: 50, outputTokens: 20, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    const app = makeApp(store, provider);
    const conv = await newConversation(app, { entityId: 'e-1', entityType: 'paper', scope: 'entity' });
    const res = await app.request(`/api/library/agent/conversations/${conv.id}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'fill aims' }),
    });
    const events = await readSSE(res as Response);
    const tc = JSON.parse(events.find((e) => e.event === 'tool_call')!.data).toolCall;
    expect(tc.status).toBe('pending');
    expect(store.libraryEntities![0].customFields?.aims).toBeUndefined();
  });

  it('rejects send when content is empty', async () => {
    const provider = fakeProvider([{ type: 'done' }]);
    const app = makeApp(store, provider);
    const conv = await newConversation(app, { entityId: 'e-1', entityType: 'paper', scope: 'entity' });
    const res = await app.request(`/api/library/agent/conversations/${conv.id}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects send when no Anthropic provider is configured', async () => {
    store.providers = [];
    const provider = fakeProvider([{ type: 'done' }]);
    const app = makeApp(store, provider);
    const conv = await newConversation(app, { entityId: 'e-1', entityType: 'paper', scope: 'entity' });
    const res = await app.request(`/api/library/agent/conversations/${conv.id}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hi' }),
    });
    expect(res.status).toBe(503);
  });
});

// ─── Regression: multi-turn after a pending proposal ─────────────────────
// Anthropic's Messages API rejects the request with `tool_use ids were found
// without tool_result blocks` if a prior assistant message contains tool_use
// but the next user message has no matching tool_result. We synthesize a
// "deferred" tool_result for any pending tool_call. This test asserts that
// the message we send to Anthropic on turn 2 contains a tool_result block
// referencing the pending tool_use_id from turn 1.

describe('multi-turn flow when a proposal is still pending', () => {
  it('the next turn includes a placeholder tool_result for the pending proposal', async () => {
    const store = makeStore();
    store.libraryEntities = [makeEntity()];
    store.matrixSchemas = [{
      type: 'paper',
      columns: [{ key: 'aims', labelEn: 'Aims', labelAr: 'أهداف', kind: 'text', visible: true, order: 0, source: 'custom' }],
      updatedAt: new Date().toISOString(),
    }];

    let capturedMessages: Array<{ role: string; content: unknown }> | null = null;

    const turn1 = fakeProvider([
      { type: 'tool_use', id: 'tu-keep', name: 'propose_cell_value', input: { entityId: 'e-1', columnKey: 'aims', value: 'A' } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    const turn2: AnthropicProvider = {
      name: 'anthropic',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async *chat(params: any) {
        capturedMessages = params.messages;
        yield { type: 'text', content: 'OK' };
        yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0 } };
        yield { type: 'done' };
      },
      estimateCost: () => 0.001,
    } as unknown as AnthropicProvider;

    let provider: AnthropicProvider = turn1;
    const app = new Hono();
    registerLibraryAgentChatRoutes(app, {
      getStore: () => store,
      saveStore: () => {},
      pickProviderForModel: () => provider,
    });

    const conv = await newConversation(app, { entityId: 'e-1', entityType: 'paper', scope: 'entity' });

    const r1 = await app.request(`/api/library/agent/conversations/${conv.id}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'fill aims please' }),
    });
    await readSSE(r1 as Response);

    const stored = store.libraryAgentConversations![0];
    const tc = stored.messages.find((m) => m.role === 'assistant')!.toolCalls!.find((t) => t.id === 'tu-keep')!;
    expect(tc.status).toBe('pending');

    provider = turn2;
    const r2 = await app.request(`/api/library/agent/conversations/${conv.id}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'actually, also tell me about it' }),
    });
    await readSSE(r2 as Response);

    expect(capturedMessages).not.toBeNull();
    const userBlocks = capturedMessages!.flatMap((m) => Array.isArray(m.content) ? (m.content as Array<Record<string, unknown>>) : []);
    const toolResults = userBlocks.filter((b) => b.type === 'tool_result');
    expect(toolResults.length).toBeGreaterThan(0);
    expect(toolResults.some((b) => b.tool_use_id === 'tu-keep')).toBe(true);
  });
});

// ─── tool-results endpoint ────────────────────────────────────────────────

describe('POST /api/library/agent/conversations/:id/tool-results', () => {
  let store: StoreData;
  let convId: string;
  beforeEach(async () => {
    store = makeStore();
    store.libraryEntities = [makeEntity()];
    store.matrixSchemas = [{
      type: 'paper',
      columns: [{ key: 'aims', labelEn: 'Aims', labelAr: 'أهداف', kind: 'text', visible: true, order: 0, source: 'custom' }],
      updatedAt: new Date().toISOString(),
    }];
    const provider = fakeProvider([
      { type: 'tool_use', id: 'tu-9', name: 'propose_cell_value', input: { entityId: 'e-1', columnKey: 'aims', value: 'Initial value' } },
      { type: 'usage', usage: { inputTokens: 50, outputTokens: 20, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    const app = makeApp(store, provider);
    const conv = await newConversation(app, { entityId: 'e-1', entityType: 'paper', scope: 'entity' });
    convId = conv.id;
    const seedRes = await app.request(`/api/library/agent/conversations/${convId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'go' }),
    });
    await readSSE(seedRes as Response);
  });

  it('accepted decision applies the proposal and mutates the entity', async () => {
    const provider = fakeProvider([{ type: 'done' }]);
    const app = makeApp(store, provider);
    const res = await app.request(`/api/library/agent/conversations/${convId}/tool-results`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolCallId: 'tu-9', decision: 'accepted' }),
    });
    expect(res.status).toBe(200);
    expect(store.libraryEntities![0].customFields?.aims).toBe('Initial value');
  });

  it('edited decision applies the EDITED value, not the original', async () => {
    const provider = fakeProvider([{ type: 'done' }]);
    const app = makeApp(store, provider);
    const res = await app.request(`/api/library/agent/conversations/${convId}/tool-results`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolCallId: 'tu-9',
        decision: 'edited',
        editedInput: { entityId: 'e-1', columnKey: 'aims', value: 'User-corrected' },
      }),
    });
    expect(res.status).toBe(200);
    expect(store.libraryEntities![0].customFields?.aims).toBe('User-corrected');
  });

  it('rejected decision does NOT mutate the entity', async () => {
    const provider = fakeProvider([{ type: 'done' }]);
    const app = makeApp(store, provider);
    const res = await app.request(`/api/library/agent/conversations/${convId}/tool-results`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolCallId: 'tu-9', decision: 'rejected', rejectionReason: 'wrong source' }),
    });
    expect(res.status).toBe(200);
    expect(store.libraryEntities![0].customFields?.aims).toBeUndefined();
  });

  it('a second decision on the same call returns 409 (already resolved)', async () => {
    const provider = fakeProvider([{ type: 'done' }]);
    const app = makeApp(store, provider);
    await app.request(`/api/library/agent/conversations/${convId}/tool-results`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolCallId: 'tu-9', decision: 'accepted' }),
    });
    const res2 = await app.request(`/api/library/agent/conversations/${convId}/tool-results`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolCallId: 'tu-9', decision: 'rejected' }),
    });
    expect(res2.status).toBe(409);
  });
});

// ─── DELETE ────────────────────────────────────────────────────────────────

describe('DELETE /api/library/agent/conversations/:id', () => {
  it('removes the thread', async () => {
    const store = makeStore();
    const provider = fakeProvider([{ type: 'done' }]);
    const app = makeApp(store, provider);
    const conv = await newConversation(app, { entityId: null, entityType: 'paper', scope: 'global' });
    expect(store.libraryAgentConversations).toHaveLength(1);
    const res = await app.request(`/api/library/agent/conversations/${conv.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(store.libraryAgentConversations).toHaveLength(0);
  });

  it('writes an audit entry to activityLog with the thread metadata', async () => {
    const store = makeStore();
    store.activityLog = [];
    const provider = fakeProvider([{ type: 'done' }]);
    const app = makeApp(store, provider);
    const conv = await newConversation(app, { entityId: 'e-9', entityType: 'paper', scope: 'entity' });
    const res = await app.request(`/api/library/agent/conversations/${conv.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(store.activityLog).toHaveLength(1);
    const entry = store.activityLog[0];
    expect(entry.action).toBe('conversation_deleted');
    expect(entry.type).toBe('agent_deleted');
    expect((entry.metadata as { conversationId?: string })?.conversationId).toBe(conv.id);
    expect((entry.metadata as { entityId?: string })?.entityId).toBe('e-9');
    expect((entry.metadata as { scope?: string })?.scope).toBe('entity');
  });
});

// ─── Model fallback chain ──────────────────────────────────────────────────

describe('model fallback chain', () => {
  it('uses the first model that resolves to a provider', async () => {
    const store = makeStore();
    const provider = fakeProvider([
      { type: 'text', content: 'hi' },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    let calledFor: string | null = null;
    const app = new Hono();
    registerLibraryAgentChatRoutes(app, {
      getStore: () => store,
      saveStore: () => {},
      // First two models resolve to nothing; third matches.
      pickProviderForModel: (m) => {
        calledFor = m;
        if (m === 'claude-sonnet-4-6' || m === 'claude-sonnet-4-5') return null;
        return provider;
      },
    });
    store.libraryEntities = [makeEntity()];
    const conv = await newConversation(app, { entityId: 'e-1', entityType: 'paper', scope: 'entity' });
    const res = await app.request(`/api/library/agent/conversations/${conv.id}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hi' }),
    });
    await readSSE(res as Response);
    expect(res.status).toBe(200);
    // Last call: a Haiku-tier model.
    expect(calledFor).toMatch(/haiku/);
  });

  it('returns 503 when no model in the chain resolves', async () => {
    const store = makeStore();
    store.libraryEntities = [makeEntity()];
    const app = new Hono();
    registerLibraryAgentChatRoutes(app, {
      getStore: () => store,
      saveStore: () => {},
      pickProviderForModel: () => null,
    });
    const conv = await newConversation(app, { entityId: 'e-1', entityType: 'paper', scope: 'entity' });
    const res = await app.request(`/api/library/agent/conversations/${conv.id}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hi' }),
    });
    expect(res.status).toBe(503);
  });
});
