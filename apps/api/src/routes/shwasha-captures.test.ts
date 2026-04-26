/**
 * Al-Mulakhkhis Screen Capture: regression tests for the /captures handler
 * and the JSON-salvage helper that recovers truncated vision responses.
 *
 * These tests do NOT touch a real Anthropic client — they swap in a fake
 * UnifiedProvider that yields controlled chunks. The goal is to lock down:
 *  - autoDetect=true returns 422 when the model couldn't read a page number
 *  - the schema accepts detected_* fields as null, missing, or valid integers
 *  - paperTitle is NOT overwritten on subsequent captures
 *  - salvageTruncatedJson handles edge cases that previously crashed the parse
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Logger } from 'pino';

import { registerShwashaRoutes, salvageTruncatedJson } from './shwasha.js';
import type { StoreData, ReadingSessionRecord } from '../store/types.js';
import type { UnifiedProvider } from '../services/llm/index.js';

// ─── salvageTruncatedJson — the most-used recovery path ────────────────────

describe('salvageTruncatedJson', () => {
  it('returns null on empty input', () => {
    expect(salvageTruncatedJson('')).toBeNull();
  });

  it('returns null when there is no opening brace or bracket', () => {
    expect(salvageTruncatedJson('hello world no json here')).toBeNull();
    expect(salvageTruncatedJson('}}]')).toBeNull();
  });

  it('returns the original JSON when input is already valid', () => {
    const r = salvageTruncatedJson('{"a":1,"b":[1,2,3]}');
    expect(r).toBe('{"a":1,"b":[1,2,3]}');
    expect(JSON.parse(r!)).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it('strips a markdown fence then salvages', () => {
    const r = salvageTruncatedJson('```json\n{"a":1}\n```');
    expect(r).toBe('{"a":1}');
  });

  it('closes a single open brace at the end', () => {
    // {"a":1, ← truncated mid-pair
    const r = salvageTruncatedJson('{"a":1,');
    expect(r).not.toBeNull();
    expect(JSON.parse(r!)).toEqual({ a: 1 });
  });

  it('closes nested objects in the right order', () => {
    const r = salvageTruncatedJson('{"a":{"b":[1,2,');
    expect(r).not.toBeNull();
    // Last safe boundary is after `2`, then close `[`, then close `{` (b's value),
    // then close `{` (top). The result must parse and contain the partial data.
    const parsed = JSON.parse(r!);
    expect(parsed.a.b).toEqual([1, 2]);
  });

  it('handles truncation mid-string by trimming back to the previous safe boundary', () => {
    // `"d":"world` was truncated mid-string. We can recover {"a":"hi","b":"world too"}
    // up through the comma after the last complete value.
    const raw = '{"a":"hi","b":"world too","c":1,"d":"part';
    const r = salvageTruncatedJson(raw);
    expect(r).not.toBeNull();
    const parsed = JSON.parse(r!);
    expect(parsed.a).toBe('hi');
    expect(parsed.b).toBe('world too');
    expect(parsed.c).toBe(1);
    expect(parsed.d).toBeUndefined();
  });

  it('handles strings with embedded escaped quotes correctly', () => {
    // The escaped quote inside the string must NOT be treated as the end.
    const raw = '{"text":"he said \\"hi\\"","next":42}';
    const r = salvageTruncatedJson(raw);
    expect(r).not.toBeNull();
    const parsed = JSON.parse(r!);
    expect(parsed.text).toBe('he said "hi"');
    expect(parsed.next).toBe(42);
  });

  it('drops dangling commas before closing brackets', () => {
    const r = salvageTruncatedJson('{"items":[1,2,3,],');
    expect(r).not.toBeNull();
    const parsed = JSON.parse(r!);
    expect(parsed.items).toEqual([1, 2, 3]);
  });

  it('handles deeply nested truncation by rolling back to last safe boundary', () => {
    // The salvager only trusts values up to the last comma boundary. Here the
    // trailing `3` has no comma or close-bracket after it, so it's dropped.
    const raw = '{"a":{"b":{"c":{"d":{"e":[1,2,3';
    const r = salvageTruncatedJson(raw);
    expect(r).not.toBeNull();
    const parsed = JSON.parse(r!);
    expect(parsed.a.b.c.d.e).toEqual([1, 2]);
  });

  it('keeps the trailing token when it is followed by a close-bracket', () => {
    const raw = '{"a":{"b":{"c":{"d":{"e":[1,2,3]';
    const r = salvageTruncatedJson(raw);
    expect(r).not.toBeNull();
    const parsed = JSON.parse(r!);
    expect(parsed.a.b.c.d.e).toEqual([1, 2, 3]);
  });

  it('handles a string truncated right after an escape character', () => {
    // The escape eats the next char (which doesn't exist). The salvager treats
    // the unfinished string as garbage, falls back to last comma-boundary.
    const raw = '{"a":"hello","b":"world\\';
    const r = salvageTruncatedJson(raw);
    expect(r).not.toBeNull();
    const parsed = JSON.parse(r!);
    expect(parsed.a).toBe('hello');
  });
});

// ─── /captures handler — schema + autoDetect + paperTitle invariants ───────

interface FakeChunk {
  type: 'text' | 'usage' | 'error' | 'done';
  content?: string;
  usage?: { inputTokens: number; outputTokens: number; cachedTokens: number };
  error?: string;
}

function makeFakeProvider(scriptedChunks: FakeChunk[]): UnifiedProvider {
  return {
    name: 'fake',
    async *chat() {
      for (const c of scriptedChunks) yield c as never;
    },
    estimateCost: (input: number, output: number) => (input * 0.000003) + (output * 0.000015),
    testConnection: async () => ({ ok: true }),
  } as unknown as UnifiedProvider;
}

const VALID_VISION_JSON = JSON.stringify({
  content_type: 'text',
  extracted_content: 'A paragraph of text from the page.',
  description: 'A page from a research paper on BIM.',
  mermaid_diagram: null,
  data_table: null,
  phd_relevance: 'Discusses BIM adoption in Gulf construction projects.',
  highlights: [
    { text: 'BIM adoption', color: 'yellow', reason: 'Main concept' },
  ],
  detected_page_number: 42,
  detected_source_title: 'BIM in Kuwait Construction',
  detected_pages: null,
});

const NULL_DETECTED_VISION_JSON = JSON.stringify({
  content_type: 'photo',
  extracted_content: '',
  description: 'A blurry image with no readable text.',
  mermaid_diagram: null,
  data_table: null,
  phd_relevance: 'Cannot determine.',
  highlights: [],
  detected_page_number: null,
  detected_source_title: null,
});

const MISSING_DETECTED_VISION_JSON = JSON.stringify({
  content_type: 'text',
  extracted_content: 'Some text.',
  description: 'A page.',
  mermaid_diagram: null,
  data_table: null,
  phd_relevance: 'N/A',
  highlights: [],
  // detected_* fields are absent — schema is .optional()
});

function makeStore(): StoreData {
  return {
    providers: [],
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
    readingSessions: [],
    pageAnalyses: [],
  } as unknown as StoreData;
}

function makeSession(overrides: Partial<ReadingSessionRecord> = {}): ReadingSessionRecord {
  const now = new Date().toISOString();
  return {
    id: 'sess-1',
    paperId: 'p-1',
    paperTitle: 'Screen capture session',
    source: 'screen-capture',
    sourceRef: null,
    totalPages: 0,
    currentPage: 1,
    language: 'en',
    status: 'active',
    mindOverride: null,
    totalCost: 0,
    readingMode: 'rolling',
    pages: [],
    pageImages: {},
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...overrides,
  };
}

function makeApp(store: StoreData, provider: UnifiedProvider) {
  const app = new Hono();
  registerShwashaRoutes(app, {
    getStore: () => store,
    saveStore: () => {},
    logger: { info() {}, error() {}, warn() {}, debug() {} } as unknown as Logger,
    logActivity: () => {},
    pickProviderForModel: () => provider,
    builtinSystemPrompts: {},
    getApiKey: () => 'fake-key',
    splitIntoSections: (t: string) => [{ title: '', content: t }],
    ensurePapersDir: () => {},
    papersDir: '/tmp',
  });
  return app;
}

describe('POST /api/shwasha/sessions/:id/captures', () => {
  let store: StoreData;
  let session: ReadingSessionRecord;

  beforeEach(() => {
    store = makeStore();
    session = makeSession();
    store.readingSessions = [session];
  });

  it('happy path: valid vision returns 200 with detected fields and cost meter', async () => {
    const provider = makeFakeProvider([
      { type: 'text', content: VALID_VISION_JSON },
      { type: 'usage', usage: { inputTokens: 1500, outputTokens: 900, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    const app = makeApp(store, provider);

    const res = await app.request(`/api/shwasha/sessions/${session.id}/captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: 'aGk=',
        mimeType: 'image/png',
        autoDetect: true,
        pageNumber: 1,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      pageAnalysis: { pageNumber: number };
      detected: { pageNumber: number | null; sourceTitle: string | null; pages: number[] | null };
      cost: { usd: number; sessionUsd: number; thresholdCrossed: boolean };
    };
    expect(body.detected.pageNumber).toBe(42);
    expect(body.detected.sourceTitle).toBe('BIM in Kuwait Construction');
    expect(body.detected.pages).toBeNull();
    expect(body.cost.usd).toBeGreaterThan(0);
    expect(body.pageAnalysis.pageNumber).toBe(42);
    expect(session.paperTitle).toBe('BIM in Kuwait Construction');
  });

  it('autoDetect=true returns 422 when model returns null for page number', async () => {
    const provider = makeFakeProvider([
      { type: 'text', content: NULL_DETECTED_VISION_JSON },
      { type: 'usage', usage: { inputTokens: 800, outputTokens: 200, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    const app = makeApp(store, provider);

    const res = await app.request(`/api/shwasha/sessions/${session.id}/captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: 'aGk=',
        mimeType: 'image/png',
        autoDetect: true,
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string; detectedTitle: string | null };
    expect(body.error).toMatch(/page number/i);
    expect(body.detectedTitle).toBeNull();
  });

  it('schema accepts detected_* fields as missing (optional)', async () => {
    const provider = makeFakeProvider([
      { type: 'text', content: MISSING_DETECTED_VISION_JSON },
      { type: 'usage', usage: { inputTokens: 500, outputTokens: 300, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    const app = makeApp(store, provider);

    // autoDetect=false with manual page number → no 422 even when detected fields missing.
    const res = await app.request(`/api/shwasha/sessions/${session.id}/captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: 'aGk=',
        mimeType: 'image/png',
        autoDetect: false,
        pageNumber: 7,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { pageAnalysis: { pageNumber: number }; detected: { pageNumber: number | null } };
    expect(body.pageAnalysis.pageNumber).toBe(7);
    expect(body.detected.pageNumber).toBeNull();
  });

  it('does NOT overwrite a user-set paperTitle even when it starts with "Screen Capture"', async () => {
    // Regression: the prior regex /^untitled|^screen capture|^standalone/i
    // would clobber any title the user typed that happened to start with
    // "Screen Capture" (e.g. "Screen Capture from Lecture 3"). The new flag
    // `paperTitleSource: 'user'` keeps it locked.
    session.paperTitle = 'Screen Capture from Lecture 3';
    session.paperTitleSource = 'user';
    const provider = makeFakeProvider([
      { type: 'text', content: VALID_VISION_JSON },
      { type: 'usage', usage: { inputTokens: 1000, outputTokens: 500, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    const app = makeApp(store, provider);
    await app.request(`/api/shwasha/sessions/${session.id}/captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'aGk=', mimeType: 'image/png', autoDetect: true }),
    });
    expect(session.paperTitle).toBe('Screen Capture from Lecture 3');
    expect(session.paperTitleSource).toBe('user');
  });

  it('spread detection stores an aliasOf reference, not a duplicate base64', async () => {
    const spreadJson = JSON.stringify({
      ...JSON.parse(VALID_VISION_JSON),
      detected_page_number: 12,
      detected_pages: [12, 13],
    });
    const provider = makeFakeProvider([
      { type: 'text', content: spreadJson },
      { type: 'usage', usage: { inputTokens: 1500, outputTokens: 900, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    const app = makeApp(store, provider);

    await app.request(`/api/shwasha/sessions/${session.id}/captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: 'longbase64payloadhere==',
        mimeType: 'image/png',
        autoDetect: true,
      }),
    });

    // Primary page holds the bytes
    const p12 = session.pageImages!['12'];
    expect(p12).toBeDefined();
    expect('base64' in p12).toBe(true);
    if ('base64' in p12) expect(p12.base64).toBe('longbase64payloadhere==');

    // Secondary page holds an alias, NOT a duplicate
    const p13 = session.pageImages!['13'];
    expect(p13).toBeDefined();
    expect('aliasOf' in p13).toBe(true);
    if ('aliasOf' in p13) expect(p13.aliasOf).toBe(12);
  });

  it('does NOT overwrite paperTitle on subsequent captures', async () => {
    // First capture: detect a title, set session.paperTitle.
    const p1 = makeFakeProvider([
      { type: 'text', content: VALID_VISION_JSON },
      { type: 'usage', usage: { inputTokens: 1000, outputTokens: 500, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    let app = makeApp(store, p1);
    await app.request(`/api/shwasha/sessions/${session.id}/captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'aGk=', mimeType: 'image/png', autoDetect: true }),
    });
    expect(session.paperTitle).toBe('BIM in Kuwait Construction');

    // Second capture from a DIFFERENT detected source — must NOT replace title.
    const differentTitle = JSON.stringify({
      ...JSON.parse(VALID_VISION_JSON),
      detected_source_title: 'Some Other Book',
      detected_page_number: 5,
    });
    const p2 = makeFakeProvider([
      { type: 'text', content: differentTitle },
      { type: 'usage', usage: { inputTokens: 1000, outputTokens: 500, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    app = makeApp(store, p2);
    await app.request(`/api/shwasha/sessions/${session.id}/captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'aGk=', mimeType: 'image/png', autoDetect: true }),
    });
    expect(session.paperTitle).toBe('BIM in Kuwait Construction');
  });

  it('truncated JSON is salvaged and parsed — handler still succeeds', async () => {
    // Build a truncated payload (missing trailing braces) and let the handler
    // recover it via salvageTruncatedJson.
    const truncated = VALID_VISION_JSON.slice(0, VALID_VISION_JSON.length - 50);
    const provider = makeFakeProvider([
      { type: 'text', content: truncated },
      { type: 'usage', usage: { inputTokens: 1500, outputTokens: 4000, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    const app = makeApp(store, provider);

    const res = await app.request(`/api/shwasha/sessions/${session.id}/captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: 'aGk=',
        mimeType: 'image/png',
        autoDetect: true,
        pageNumber: 1,
      }),
    });
    // The salvaged JSON drops `detected_pages: null` (the last field). Schema
    // still accepts because that field is .nullable().optional() — and the
    // detected_page_number was read before the truncation point.
    expect(res.status).toBe(200);
    const body = await res.json() as { detected: { pageNumber: number | null } };
    expect(body.detected.pageNumber).toBe(42);
  });

  it('rejects when autoDetect=false and pageNumber is missing', async () => {
    const provider = makeFakeProvider([{ type: 'done' }]);
    const app = makeApp(store, provider);

    const res = await app.request(`/api/shwasha/sessions/${session.id}/captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'aGk=', mimeType: 'image/png' }),
    });
    expect(res.status).toBe(400);
  });

  it('crosses cost threshold when sessionUsd >= $0.50', async () => {
    // Pre-cost the session just under the threshold.
    session.totalCost = 0.49;
    const provider = makeFakeProvider([
      { type: 'text', content: VALID_VISION_JSON },
      { type: 'usage', usage: { inputTokens: 5000, outputTokens: 3000, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    const app = makeApp(store, provider);

    const res = await app.request(`/api/shwasha/sessions/${session.id}/captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'aGk=', mimeType: 'image/png', autoDetect: true }),
    });
    const body = await res.json() as { cost: { thresholdCrossed: boolean; sessionUsd: number } };
    expect(body.cost.thresholdCrossed).toBe(true);
    expect(body.cost.sessionUsd).toBeGreaterThanOrEqual(0.5);
  });

  it('PATCH /analyses/:id/correct updates the analysis pageNumber and locks the title', async () => {
    // Seed: a captured analysis at p42 with auto-detected title.
    const provider = makeFakeProvider([
      { type: 'text', content: VALID_VISION_JSON },
      { type: 'usage', usage: { inputTokens: 1000, outputTokens: 500, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    const app = makeApp(store, provider);
    const captureRes = await app.request(`/api/shwasha/sessions/${session.id}/captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'aGk=', mimeType: 'image/png', autoDetect: true }),
    });
    const cap = await captureRes.json() as { pageAnalysis: { id: string; pageNumber: number } };
    expect(cap.pageAnalysis.pageNumber).toBe(42);
    expect(session.paperTitleSource).toBe('auto');

    // Correction: page should be 7, title is wrong (re-confirm with the right one).
    const corrRes = await app.request(`/api/shwasha/analyses/${cap.pageAnalysis.id}/correct`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageNumber: 7, sourceTitle: 'BIM Mandate in Kuwait (corrected)' }),
    });
    expect(corrRes.status).toBe(200);
    const stored = (store.pageAnalyses || []).find((p) => p.id === cap.pageAnalysis.id)!;
    expect(stored.pageNumber).toBe(7);
    expect(stored.humanEdited).toBe(true);
    expect(session.paperTitle).toBe('BIM Mandate in Kuwait (corrected)');
    expect(session.paperTitleSource).toBe('user');
  });

  it('PATCH /analyses/:id/correct rejects negative pageNumber', async () => {
    store.pageAnalyses = [{
      id: 'a-1', sessionId: session.id, pageNumber: 1, version: 1, parentVersionId: null,
      analysis: {}, refinementRequest: null, modelUsed: 'x', providerUsed: 'fake',
      tokenCostUsd: 0, inputTokens: 0, outputTokens: 0, rawText: null,
      createdAt: new Date().toISOString(),
    }];
    const provider = makeFakeProvider([{ type: 'done' }]);
    const app = makeApp(store, provider);
    const res = await app.request('/api/shwasha/analyses/a-1/correct', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageNumber: -3 }),
    });
    expect(res.status).toBe(400);
  });

  it('persists fileName mapping for smart-fileName auto-fill', async () => {
    const provider = makeFakeProvider([
      { type: 'text', content: VALID_VISION_JSON },
      { type: 'usage', usage: { inputTokens: 1000, outputTokens: 500, cachedTokens: 0 } },
      { type: 'done' },
    ]);
    const app = makeApp(store, provider);

    await app.request(`/api/shwasha/sessions/${session.id}/captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: 'aGk=',
        mimeType: 'image/png',
        autoDetect: true,
        fileName: 'kuwait-bim.pdf',
      }),
    });
    expect(session.fileNameBySource).toBeDefined();
    expect(session.fileNameBySource!['bim in kuwait construction']).toBe('kuwait-bim.pdf');
  });
});
