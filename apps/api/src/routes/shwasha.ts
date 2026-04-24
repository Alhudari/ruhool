/**
 * Shwasha reading-companion routes.
 *
 * SSE streaming for page analysis + prose chat; non-streaming JSON for refine,
 * vision, and export (save to Zotero / Obsidian / vectors).
 *
 * All LLM dispatch goes through `selectShwashaModel()` in @ruhool/core so model
 * choice can flip between Claude and local Ollama via OLLAMA_ENABLED. Provider
 * resolution is via the router's `pickProviderForModel(...)`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Logger } from 'pino';

import type { ActivityRecord, MemoryRecord, PageAnalysisRecord, ReadingMode, ReadingSessionRecord, StoreData } from '../store/types.js';
import type { UnifiedProvider } from '../services/llm/index.js';
import {
  DEFAULT_MIND_BLOCK,
  DEFAULT_AGENT_INTEGRATIONS,
  buildAnalyzePrompt,
  buildFullContextAnalyzePrompt,
  buildSynthesisUpdatePrompt,
  buildRefinePrompt,
  buildChatPrompt,
  buildVisionPrompt,
  buildClippingsPrompt,
  selectShwashaModel,
  AnalyzeResultSchema,
  VisionResultSchema,
  injectHighlights,
  injectTags,
  injectNotes,
  writeNote,
  parseClippings,
  splitIntoChapters,
  fetchZoteroPaper,
  type ShwashaTask,
  type ZoteroHighlight,
  type ZoteroHighlightColor,
  type Clipping,
} from '@ruhool/core';

const nodeRequire = createRequire(import.meta.url);
// pdf-parse v2 is a class-based API. Wrap it so callers keep the v1 shape.
const { PDFParse } = nodeRequire('pdf-parse') as { PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string; numpages: number }>; destroy?: () => Promise<void> } };
async function pdfParseSources(data: Buffer): Promise<{ text: string; numpages: number }> {
  const p = new PDFParse({ data });
  try {
    return await p.getText();
  } finally {
    if (p.destroy) await p.destroy().catch(() => undefined);
  }
}

const CHUNK_CHARS = 3000;

function sniffContentType(raw: string | null, buffer?: Buffer): string {
  const ct = (raw || '').split(';')[0].trim().toLowerCase();
  if (ct) return ct;
  if (buffer && buffer.length >= 4 && buffer.slice(0, 4).toString('ascii') === '%PDF') {
    return 'application/pdf';
  }
  return 'application/octet-stream';
}

function stripHtmlToPages(html: string, chunkChars: number = CHUNK_CHARS): { title: string; pages: string[] } {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const titleMatch = stripped.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';
  const blockified = stripped
    .replace(/<(p|h[1-6]|li|br|div|section|article)[^>]*>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|div|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  const text = decodeEntities(blockified).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const pages: string[] = [];
  for (let i = 0; i < text.length; i += chunkChars) {
    const slice = text.slice(i, i + chunkChars).trim();
    if (slice) pages.push(slice);
  }
  return { title, pages: pages.length > 0 ? pages : [text] };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function chunkTextByChars(text: string, chunkChars: number = CHUNK_CHARS): string[] {
  const pages: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) return [];
  for (let i = 0; i < trimmed.length; i += chunkChars) {
    const slice = trimmed.slice(i, i + chunkChars).trim();
    if (slice) pages.push(slice);
  }
  return pages;
}

function extractDoi(url: string): string | undefined {
  const m = url.match(/10\.\d{4,9}\/[^\s&?#]+/);
  return m ? m[0] : undefined;
}

function extractDriveId(url: string): string | null {
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

function formatClippingsAsPage(clippings: Clipping[]): string {
  const highlights = clippings.filter((c) => c.type !== 'bookmark');
  const body = highlights
    .map((c) => `• [p.${c.page ?? '?'}] ${c.text.trim()}`)
    .join('\n\n');
  return `Highlights\n\n${body}`;
}

export type ShwashaLogActivity = (
  type: ActivityRecord['type'],
  action: string,
  details: string,
  opts?: { agentId?: string; metadata?: Record<string, unknown>; requestId?: string | null }
) => ActivityRecord | void;

export interface ShwashaRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  logger: Logger;
  logActivity: ShwashaLogActivity;
  pickProviderForModel: (model: string) => UnifiedProvider | null;
  builtinSystemPrompts: Record<string, string>;
  getApiKey: (service: string) => string | undefined;
  splitIntoSections: (text: string) => { title: string; content: string }[];
  ensurePapersDir: () => void;
  papersDir: string;
}

interface ShwashaSettingsResolved {
  mindBlock: string;
  agentIntegrations: string;
  defaultLanguage: 'en' | 'ar';
  ollamaEnabled: boolean;
  ollamaBaseUrl: string;
  voiceProfile: string;
}

function resolveSettings(store: StoreData): ShwashaSettingsResolved {
  const s = store.shwashaSettings;
  return {
    mindBlock: s?.mindBlock ?? DEFAULT_MIND_BLOCK,
    agentIntegrations: s?.agentIntegrations ?? DEFAULT_AGENT_INTEGRATIONS,
    defaultLanguage: s?.defaultLanguage ?? 'en',
    // Settings toggle is the source of truth; OLLAMA_ENABLED env stays as a boot-time fallback.
    ollamaEnabled: s?.ollamaEnabled ?? (process.env.OLLAMA_ENABLED === 'true'),
    ollamaBaseUrl: s?.ollamaBaseUrl ?? (process.env.OLLAMA_BASE_URL || 'http://localhost:11434'),
    voiceProfile: store.userVoiceProfile?.content ?? '',
  };
}

function findSession(store: StoreData, id: string): ReadingSessionRecord | undefined {
  return (store.readingSessions || []).find((s) => s.id === id);
}

function sessionPageAnalyses(store: StoreData, sessionId: string): PageAnalysisRecord[] {
  return (store.pageAnalyses || []).filter((p) => p.sessionId === sessionId);
}

function nextVersionForPage(existing: PageAnalysisRecord[], pageNumber: number): { version: number; parentVersionId: string | null } {
  const onPage = existing.filter((p) => p.pageNumber === pageNumber).sort((a, b) => b.version - a.version);
  if (onPage.length === 0) return { version: 1, parentVersionId: null };
  return { version: onPage[0].version + 1, parentVersionId: onPage[0].id };
}

function toZoteroColor(color: string): ZoteroHighlightColor {
  const allowed: ZoteroHighlightColor[] = ['yellow', 'green', 'red', 'blue', 'purple', 'orange'];
  return (allowed as string[]).includes(color) ? (color as ZoteroHighlightColor) : 'yellow';
}

// ─── Memory helpers (reading-helper agent) ───

function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .split(/[^a-z0-9\u0600-\u06ff]+/i)
    .filter((t) => t.length >= 3);
}

function relevantReadingMemories(store: StoreData, session: ReadingSessionRecord, limit = 5): string[] {
  const all = (store.memories || []).filter((m) => m.agentId === 'reading-helper');
  if (all.length === 0) return [];
  const titleTokens = new Set(tokenize(session.paperTitle));
  const matched = all.filter((m) => {
    const meta = m.metadata || {};
    if (meta.paperId && meta.paperId === session.paperId) return true;
    const otherTitle = typeof meta.paperTitle === 'string' ? meta.paperTitle : '';
    if (!otherTitle) return false;
    const other = tokenize(otherTitle);
    return other.some((t) => titleTokens.has(t));
  });
  matched.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return matched.slice(0, limit).map((m) => m.content);
}

function upsertPageMemory(
  store: StoreData,
  session: ReadingSessionRecord,
  pageNumber: number,
  analysisId: string,
  mainIdea: string,
  tags: string[]
): void {
  if (!store.memories) store.memories = [];
  const content = `[${session.paperTitle}] p.${pageNumber}: ${mainIdea} | tags: ${(tags || []).join(',')}`;
  const now = new Date().toISOString();
  const existing = store.memories.find(
    (m) =>
      m.agentId === 'reading-helper' &&
      m.metadata?.sessionId === session.id &&
      m.metadata?.pageNumber === pageNumber
  );
  if (existing) {
    existing.content = content;
    existing.updatedAt = now;
    existing.metadata = {
      ...(existing.metadata || {}),
      sessionId: session.id,
      paperId: session.paperId,
      pageNumber,
      analysisId,
      paperTitle: session.paperTitle,
    };
    return;
  }
  const mem: MemoryRecord = {
    id: crypto.randomUUID(),
    agentId: 'reading-helper',
    tier: 'long-term',
    content,
    createdAt: now,
    updatedAt: now,
    metadata: {
      sessionId: session.id,
      paperId: session.paperId,
      pageNumber,
      analysisId,
      paperTitle: session.paperTitle,
    },
  };
  store.memories.push(mem);
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    : trimmed;
  // Repair common LLM JSON defects: literal `undefined`, trailing commas,
  // and single-quoted keys/values. Keep surgical — never touch strings.
  return unfenced
    .replace(/:\s*undefined\b/g, ': null')
    .replace(/,\s*([}\]])/g, '$1');
}

export function registerShwashaRoutes(app: Hono, deps: ShwashaRoutesDeps): void {
  const { getStore, saveStore, logger, logActivity, pickProviderForModel, getApiKey, splitIntoSections, ensurePapersDir, papersDir } = deps;

  // ─── Sessions CRUD ───
  app.post('/api/shwasha/sessions', async (c) => {
    const store = getStore();
    const body = await c.req.json<{
      paperId: string;
      paperTitle: string;
      paperMeta?: ReadingSessionRecord['paperMeta'];
      source: ReadingSessionRecord['source'];
      sourceRef?: string | null;
      totalPages: number;
      language?: 'en' | 'ar';
      pages?: string[];
      readingMode?: ReadingMode;
    }>();
    if (!body.paperId || !body.paperTitle || !body.source || typeof body.totalPages !== 'number') {
      return c.json({ error: 'paperId, paperTitle, source, totalPages required' }, 400);
    }
    const settings = resolveSettings(store);
    const now = new Date().toISOString();
    const session: ReadingSessionRecord = {
      id: crypto.randomUUID(),
      paperId: body.paperId,
      paperTitle: body.paperTitle,
      paperMeta: body.paperMeta,
      source: body.source,
      sourceRef: body.sourceRef ?? null,
      totalPages: body.totalPages,
      currentPage: 1,
      language: body.language || settings.defaultLanguage,
      status: 'active',
      mindOverride: null,
      totalCost: 0,
      readingMode: body.readingMode || 'rolling',
      pages: Array.isArray(body.pages) ? body.pages : undefined,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    if (!store.readingSessions) store.readingSessions = [];
    store.readingSessions.push(session);
    saveStore();
    logActivity('system', `Shwasha session started: ${session.paperTitle}`, `source=${session.source}, pages=${session.totalPages}`, { agentId: 'reading-helper', metadata: { sessionId: session.id, paperId: session.paperId } });
    return c.json(session, 201);
  });

  // ─── Per-page text (for client PaperView) ───
  app.get('/api/shwasha/sessions/:id/pages/:n', (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    const n = parseInt(c.req.param('n'), 10);
    if (!Number.isFinite(n) || n < 1) return c.json({ error: 'Invalid page number' }, 400);
    const imageRequested = c.req.query('image') === '1';
    const pages = session.pages || [];
    const total = pages.length || session.totalPages || 0;
    const text = pages[n - 1] ?? '';

    const pageImage = session.pageImages?.[String(n)];
    const imageUrl = pageImage ? `data:${pageImage.mimeType};base64,${pageImage.base64}` : null;

    if (imageRequested) {
      return c.json({
        number: n,
        text,
        imageUrl,
        totalPages: total,
      });
    }

    return c.json({
      number: n,
      text,
      imageUrl,
      totalPages: total,
    });
  });

  app.get('/api/shwasha/sessions', (c) => {
    const store = getStore();
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10), 1), 200);
    const offset = Math.max(parseInt(c.req.query('offset') || '0', 10), 0);
    const all = (store.readingSessions || []).slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const items = all.slice(offset, offset + limit);
    return c.json({ items, total: all.length, limit, offset });
  });

  app.get('/api/shwasha/sessions/:id', (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    const analyses = sessionPageAnalyses(store, session.id)
      .slice()
      .sort((a, b) => (a.pageNumber - b.pageNumber) || (a.version - b.version));
    return c.json({ session, pageAnalyses: analyses });
  });

  app.patch('/api/shwasha/sessions/:id', async (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<Partial<Pick<ReadingSessionRecord, 'currentPage' | 'status' | 'language' | 'mindOverride' | 'readingMode' | 'paperTitle' | 'paperMeta'>>>();
    if (body.currentPage !== undefined) session.currentPage = body.currentPage;
    if (body.status !== undefined) session.status = body.status;
    if (body.language !== undefined) session.language = body.language;
    if (body.mindOverride !== undefined) session.mindOverride = body.mindOverride;
    if (body.readingMode !== undefined) session.readingMode = body.readingMode;
    if (body.paperTitle !== undefined) session.paperTitle = body.paperTitle;
    if (body.paperMeta !== undefined) session.paperMeta = body.paperMeta;
    session.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(session);
  });

  app.delete('/api/shwasha/sessions/:id', (c) => {
    const store = getStore();
    if (!store.readingSessions) return c.json({ error: 'Not found' }, 404);
    const idx = store.readingSessions.findIndex((s) => s.id === c.req.param('id'));
    if (idx === -1) return c.json({ error: 'Not found' }, 404);
    const sessionId = store.readingSessions[idx].id;
    store.readingSessions.splice(idx, 1);
    store.pageAnalyses = (store.pageAnalyses || []).filter((p) => p.sessionId !== sessionId);
    saveStore();
    return c.json({ ok: true });
  });

  // ─── Settings ───
  app.get('/api/shwasha/settings', (c) => {
    return c.json(resolveSettings(getStore()));
  });

  app.put('/api/shwasha/settings', async (c) => {
    const store = getStore();
    const body = await c.req.json<Partial<ShwashaSettingsResolved>>();
    const current = resolveSettings(store);
    const next: ShwashaSettingsResolved = {
      mindBlock: body.mindBlock !== undefined ? body.mindBlock : current.mindBlock,
      agentIntegrations: body.agentIntegrations !== undefined ? body.agentIntegrations : current.agentIntegrations,
      defaultLanguage: body.defaultLanguage !== undefined ? body.defaultLanguage : current.defaultLanguage,
      ollamaEnabled: body.ollamaEnabled !== undefined ? body.ollamaEnabled : current.ollamaEnabled,
      ollamaBaseUrl: body.ollamaBaseUrl !== undefined ? body.ollamaBaseUrl : current.ollamaBaseUrl,
      // voiceProfile is owned by /api/settings/voice-profile, not Shwasha settings.
      // We re-resolve it on read; Shwasha PUT just preserves whatever's currently saved.
      voiceProfile: current.voiceProfile,
    };
    store.shwashaSettings = {
      mindBlock: next.mindBlock,
      agentIntegrations: next.agentIntegrations,
      defaultLanguage: next.defaultLanguage,
      ollamaEnabled: next.ollamaEnabled,
      ollamaBaseUrl: next.ollamaBaseUrl,
    };

    // Reflect the toggle in the providers table so pickProviderForModel honors
    // the switch. Does not create the Ollama provider instance here — that's
    // done at boot — but flipping `enabled` is enough for runtime routing.
    const ollamaRow = store.providers.find((p) => p.type === 'ollama');
    if (ollamaRow && ollamaRow.enabled !== next.ollamaEnabled) {
      ollamaRow.enabled = next.ollamaEnabled;
      ollamaRow.baseUrl = next.ollamaBaseUrl;
      ollamaRow.updatedAt = new Date().toISOString();
    }

    saveStore();
    return c.json(next);
  });

  // ─── Source ingestion ───
  function buildSession(input: {
    paperId: string;
    paperTitle: string;
    paperMeta?: ReadingSessionRecord['paperMeta'];
    source: ReadingSessionRecord['source'];
    sourceRef?: string | null;
    pages: string[];
    language: 'en' | 'ar';
    mindOverride?: string | null;
    pageImages?: Record<string, { base64: string; mimeType: string }>;
    totalPagesOverride?: number;
    readingMode?: ReadingMode;
  }): ReadingSessionRecord {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      paperId: input.paperId,
      paperTitle: input.paperTitle,
      paperMeta: input.paperMeta,
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      totalPages: input.totalPagesOverride ?? (input.pages.length || 1),
      currentPage: 1,
      language: input.language,
      status: 'active',
      mindOverride: input.mindOverride || null,
      totalCost: 0,
      readingMode: input.readingMode || 'rolling',
      pages: input.pages,
      pageImages: input.pageImages,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
  }

  function pushSession(store: StoreData, session: ReadingSessionRecord): void {
    if (!store.readingSessions) store.readingSessions = [];
    store.readingSessions.push(session);
    logActivity(
      'system',
      `Shwasha session started: ${session.paperTitle}`,
      `source=${session.source}, pages=${session.totalPages}`,
      { agentId: 'reading-helper', metadata: { sessionId: session.id, paperId: session.paperId } }
    );
  }

  app.post('/api/shwasha/sources/link', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ url: string; mindOverride?: string | null; language?: 'en' | 'ar' }>();
    const url = (body.url || '').trim();
    if (!url) return c.json({ error: 'url required' }, 400);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return c.json({ error: 'Invalid URL' }, 400);
    }

    const settings = resolveSettings(store);
    const language = body.language || settings.defaultLanguage;

    let res: Response;
    try {
      res = await fetch(url, { redirect: 'follow' });
    } catch (err) {
      return c.json({ error: `Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
    if (!res.ok) return c.json({ error: `Fetch failed with status ${res.status}` }, 502);

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const contentType = sniffContentType(res.headers.get('content-type'), buffer);

    let pages: string[] = [];
    let title = '';
    if (contentType === 'application/pdf') {
      try {
        const parsed = await pdfParseSources(buffer);
        const sections = splitIntoSections(parsed.text);
        pages = sections.map((s) => (s.title ? `${s.title}\n\n${s.content}` : s.content));
        title = decodeURIComponent(parsedUrl.pathname.split('/').filter(Boolean).pop() || url);
      } catch (err) {
        return c.json({ error: `PDF parse failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
      }
    } else if (contentType.startsWith('text/html') || contentType === 'application/xhtml+xml') {
      const html = buffer.toString('utf8');
      const extracted = stripHtmlToPages(html);
      pages = extracted.pages;
      title = extracted.title || parsedUrl.hostname + parsedUrl.pathname;
    } else {
      return c.json({ error: `Unsupported content-type "${contentType}" — only PDF and HTML are supported.` }, 415);
    }

    if (pages.length === 0) return c.json({ error: 'No readable text extracted from URL' }, 422);

    const doi = extractDoi(url);
    const paperId = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
    const session = buildSession({
      paperId,
      paperTitle: title || url,
      paperMeta: doi ? { doi } : undefined,
      source: 'link',
      sourceRef: url,
      pages,
      language,
      mindOverride: body.mindOverride ?? null,
    });
    pushSession(store, session);
    saveStore();
    return c.json(session, 201);
  });

  app.post('/api/shwasha/sources/kindle-clippings', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ clippings: string; mindOverride?: string | null; language?: 'en' | 'ar' }>();
    if (!body.clippings || !body.clippings.trim()) {
      return c.json({ error: 'clippings required' }, 400);
    }

    const settings = resolveSettings(store);
    const language = body.language || settings.defaultLanguage;

    const parsed = parseClippings(body.clippings);
    if (parsed.length === 0) {
      return c.json({ error: 'No clippings could be parsed from the input.' }, 422);
    }

    const byBook = new Map<string, Clipping[]>();
    for (const clip of parsed) {
      const arr = byBook.get(clip.book) || [];
      arr.push(clip);
      byBook.set(clip.book, arr);
    }

    const createdSessions: ReadingSessionRecord[] = [];
    for (const [bookName, clips] of byBook) {
      const pageText = formatClippingsAsPage(clips);
      const authorsSet = new Set(clips.map((c) => c.author).filter(Boolean) as string[]);
      const session = buildSession({
        paperId: crypto.createHash('sha256').update(`kindle:${bookName}`).digest('hex').slice(0, 16),
        paperTitle: bookName,
        paperMeta: authorsSet.size > 0 ? { authors: Array.from(authorsSet).join(', ') } : undefined,
        source: 'kindle-clippings',
        sourceRef: null,
        pages: [pageText],
        totalPagesOverride: 1,
        language,
        mindOverride: body.mindOverride ?? null,
      });
      pushSession(store, session);

      // Kick off an initial analyze for page 1 synchronously so the user sees a real summary immediately.
      try {
        const mindBlock = session.mindOverride || settings.mindBlock;
        const systemPrompt = buildClippingsPrompt({
          mindBlock,
          agentIntegrations: settings.agentIntegrations,
          language: session.language,
          voiceProfile: settings.voiceProfile,
        });
        const { model } = selectShwashaModel('analyze_page', { localAvailable: settings.ollamaEnabled });
        const provider = pickProviderForModel(model);
        if (provider) {
          let fullText = '';
          let usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
          for await (const chunk of provider.chat({
            model,
            systemPrompt,
            messages: [{ role: 'user', content: `Book: ${bookName}\n\n${pageText}` }],
            temperature: 0.2,
            maxTokens: 2000,
          })) {
            if (chunk.type === 'text') fullText += chunk.content;
            else if (chunk.type === 'usage') usage = chunk.usage;
            else if (chunk.type === 'error') break;
          }
          try {
            const parsedJson = JSON.parse(stripJsonFences(fullText));
            const safe = AnalyzeResultSchema.safeParse(parsedJson);
            if (safe.success) {
              const tokenCostUsd = provider.estimateCost(usage.inputTokens, usage.outputTokens, model);
              const analysisRecord: PageAnalysisRecord = {
                id: crypto.randomUUID(),
                sessionId: session.id,
                pageNumber: 1,
                version: 1,
                parentVersionId: null,
                analysis: safe.data as unknown as Record<string, unknown>,
                refinementRequest: null,
                modelUsed: model,
                providerUsed: provider.name,
                tokenCostUsd,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                rawText: fullText,
                createdAt: new Date().toISOString(),
              };
              if (!store.pageAnalyses) store.pageAnalyses = [];
              store.pageAnalyses.push(analysisRecord);
              session.totalCost = (session.totalCost || 0) + tokenCostUsd;
              session.updatedAt = new Date().toISOString();
            }
          } catch (err) {
            logger.warn({ err, sessionId: session.id }, 'Initial clippings analyze parse failed — continuing without it');
          }
        }
      } catch (err) {
        logger.warn({ err }, 'Initial clippings analyze failed — session created anyway');
      }

      createdSessions.push(session);
    }

    saveStore();
    return c.json(createdSessions[0], 201);
  });

  app.post('/api/shwasha/sources/kindle-book', async (c) => {
    const store = getStore();
    const form = await c.req.parseBody();
    const file = form['file'];
    if (!file || typeof file === 'string') {
      return c.json({ error: 'file required (multipart field "file")' }, 400);
    }
    const fileObj = file as File;
    const languageField = form['language'];
    const mindField = form['mindOverride'];
    const settings = resolveSettings(store);
    const language: 'en' | 'ar' =
      languageField === 'ar' || languageField === 'en' ? (languageField as 'en' | 'ar') : settings.defaultLanguage;
    const mindOverride = typeof mindField === 'string' ? mindField : null;

    const ext = (fileObj.name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
    if (ext === 'mobi' || ext === 'azw' || ext === 'azw3') {
      return c.json({ error: 'EPUB is supported — convert with Calibre first.' }, 415);
    }

    const buffer = Buffer.from(await fileObj.arrayBuffer());
    let pages: string[] = [];
    let title = fileObj.name.replace(/\.[^.]+$/, '');
    let authors: string | undefined;

    if (ext === 'epub') {
      const tmpPath = path.join(os.tmpdir(), `shwasha-${crypto.randomUUID()}.epub`);
      fs.writeFileSync(tmpPath, buffer);
      try {
        const epubModule = await import('epub2');
        const EPub: any = (epubModule as any).default ?? (epubModule as any).EPub ?? epubModule; // eslint-disable-line @typescript-eslint/no-explicit-any
        const epub: any = await EPub.createAsync(fs.createReadStream(tmpPath)); // eslint-disable-line @typescript-eslint/no-explicit-any
        const meta = epub.metadata || {};
        title = (typeof meta.title === 'string' && meta.title) || title;
        authors = typeof meta.creator === 'string' ? meta.creator : undefined;
        const chapterPages: string[] = [];
        for (const flow of epub.flow || []) {
          try {
            const html = await epub.getChapterAsync(flow.id);
            const extracted = stripHtmlToPages(html || '', Infinity);
            const chapterText = extracted.pages.join('\n\n').trim();
            if (chapterText) {
              const header = flow.title ? `${flow.title}\n\n` : '';
              chapterPages.push(header + chapterText);
            }
          } catch (err) {
            logger.warn({ err, chapterId: flow.id }, 'Skipping EPUB chapter that failed to load');
          }
        }
        pages = chapterPages;
      } catch (err) {
        return c.json({ error: `EPUB parse failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
      } finally {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    } else if (ext === 'txt') {
      const text = buffer.toString('utf8');
      const chapters = splitIntoChapters(text);
      pages = chapters.map((c) => (c.title ? `${c.title}\n\n${c.content}` : c.content));
    } else {
      return c.json({ error: `Unsupported file type ".${ext}". Use .epub or .txt.` }, 415);
    }

    if (pages.length === 0) return c.json({ error: 'No readable text extracted from book.' }, 422);

    const session = buildSession({
      paperId: crypto.createHash('sha256').update(`kindle-book:${fileObj.name}`).digest('hex').slice(0, 16),
      paperTitle: title,
      paperMeta: authors ? { authors } : undefined,
      source: 'kindle-book',
      sourceRef: fileObj.name,
      pages,
      language,
      mindOverride,
    });
    pushSession(store, session);
    saveStore();
    return c.json(session, 201);
  });

  app.post('/api/shwasha/sources/zotero', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ zoteroKey: string; mindOverride?: string | null; language?: 'en' | 'ar' }>();
    const zoteroKey = (body.zoteroKey || '').trim();
    if (!zoteroKey) return c.json({ error: 'zoteroKey required' }, 400);

    const settings = resolveSettings(store);
    const language = body.language || settings.defaultLanguage;

    let fetched;
    try {
      fetched = await fetchZoteroPaper(zoteroKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const unreachable = /unreachable|ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg);
      if (unreachable) {
        return c.json(
          {
            error:
              'Zotero is not reachable at http://localhost:23119. Make sure Zotero is open with Local API enabled (Edit → Preferences → Advanced → Config Editor → extensions.zotero.httpServer.enabled = true).',
          },
          502
        );
      }
      return c.json({ error: msg }, 502);
    }

    const fullText = fetched.fullText || '';
    let pages: string[];
    if (fullText.includes('\f')) {
      pages = fullText.split('\f').map((p) => p.trim()).filter((p) => p.length > 0);
    } else {
      pages = chunkTextByChars(fullText);
    }
    if (pages.length === 0) pages = [fetched.meta.abstractNote || ''];

    const paperMeta: ReadingSessionRecord['paperMeta'] = {
      authors: fetched.meta.authors,
      year: typeof fetched.meta.year === 'number' ? fetched.meta.year : null,
      journal: fetched.meta.journal,
      doi: fetched.meta.doi,
      abstractNote: fetched.meta.abstractNote,
    };

    const session = buildSession({
      paperId: zoteroKey,
      paperTitle: fetched.meta.title || zoteroKey,
      paperMeta,
      source: 'zotero',
      sourceRef: zoteroKey,
      pages,
      language,
      mindOverride: body.mindOverride ?? null,
    });
    pushSession(store, session);
    saveStore();
    return c.json(session, 201);
  });

  app.post('/api/shwasha/sources/screenshot', async (c) => {
    const store = getStore();
    const form = await c.req.parseBody();
    const file = form['file'];
    if (!file || typeof file === 'string') {
      return c.json({ error: 'file required (multipart field "file")' }, 400);
    }
    const fileObj = file as File;
    const languageField = form['language'];
    const mindField = form['mindOverride'];
    const settings = resolveSettings(store);
    const language: 'en' | 'ar' =
      languageField === 'ar' || languageField === 'en' ? (languageField as 'en' | 'ar') : settings.defaultLanguage;
    const mindOverride = typeof mindField === 'string' ? mindField : null;

    const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
    const mimeType = (fileObj.type || '').toLowerCase() || 'image/png';
    if (!allowed.has(mimeType)) {
      return c.json({ error: `Unsupported image type "${mimeType}". Use PNG, JPG, or WEBP.` }, 415);
    }

    const buffer = Buffer.from(await fileObj.arrayBuffer());
    const base64 = buffer.toString('base64');
    const title = fileObj.name.replace(/\.[^.]+$/, '') || 'Screenshot';

    const session = buildSession({
      paperId: crypto.createHash('sha256').update(`camera:${fileObj.name}:${buffer.length}`).digest('hex').slice(0, 16),
      paperTitle: title,
      source: 'camera',
      sourceRef: fileObj.name,
      pages: ['[Image-only page — use Vision analysis]'],
      totalPagesOverride: 1,
      language,
      mindOverride,
      pageImages: { '1': { base64, mimeType } },
    });
    pushSession(store, session);
    saveStore();
    return c.json(session, 201);
  });

  app.post('/api/shwasha/sources/drive', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ publicUrl: string; mindOverride?: string | null; language?: 'en' | 'ar' }>();
    const publicUrl = (body.publicUrl || '').trim();
    if (!publicUrl) return c.json({ error: 'publicUrl required' }, 400);

    const driveId = extractDriveId(publicUrl);
    if (!driveId) {
      return c.json(
        { error: 'Use a public Drive share link. OAuth-based private files are not yet supported.' },
        400
      );
    }

    const settings = resolveSettings(store);
    const language = body.language || settings.defaultLanguage;
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${driveId}`;

    let res: Response;
    try {
      res = await fetch(downloadUrl, { redirect: 'follow' });
    } catch (err) {
      return c.json({ error: `Failed to fetch Drive file: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
    if (!res.ok) return c.json({ error: `Drive fetch failed with status ${res.status}` }, 502);

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = sniffContentType(res.headers.get('content-type'), buffer);

    let pages: string[] = [];
    let title = `Drive file ${driveId}`;
    if (contentType === 'application/pdf') {
      try {
        const parsed = await pdfParseSources(buffer);
        const sections = splitIntoSections(parsed.text);
        pages = sections.map((s) => (s.title ? `${s.title}\n\n${s.content}` : s.content));
        // Persist the downloaded PDF so vision/preview can pick it up later.
        ensurePapersDir();
        const safeName = `drive-${driveId}.pdf`;
        fs.writeFileSync(path.join(papersDir, safeName), buffer);
      } catch (err) {
        return c.json({ error: `PDF parse failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
      }
    } else if (contentType.startsWith('text/html')) {
      const html = buffer.toString('utf8');
      const extracted = stripHtmlToPages(html);
      pages = extracted.pages;
      title = extracted.title || title;
    } else {
      return c.json({ error: `Unsupported Drive file content-type "${contentType}".` }, 415);
    }

    if (pages.length === 0) return c.json({ error: 'No readable text extracted from Drive file.' }, 422);

    const session = buildSession({
      paperId: driveId,
      paperTitle: title,
      source: 'drive',
      sourceRef: publicUrl,
      pages,
      language,
      mindOverride: body.mindOverride ?? null,
    });
    pushSession(store, session);
    saveStore();
    return c.json(session, 201);
  });

  // ─── Analyze (SSE) ───
  app.post('/api/shwasha/analyze', async (c) => {
    const store = getStore();
    const body = await c.req.json<{
      sessionId: string;
      pageNumber: number;
      pageText: string;
      paperContext?: { title?: string; authors?: string; year?: number | null };
    }>();
    const session = findSession(store, body.sessionId);
    if (!session) return c.json({ error: 'Session not found' }, 404);
    if (typeof body.pageNumber !== 'number' || !body.pageText) {
      return c.json({ error: 'pageNumber and pageText required' }, 400);
    }

    const mode: ReadingMode = session.readingMode || 'rolling';
    if (mode === 'tac') {
      return c.json({ error: 'Use POST /api/shwasha/tac instead' }, 400);
    }

    const settings = resolveSettings(store);
    const mindBlock = session.mindOverride || settings.mindBlock;
    const ctx = {
      mindBlock,
      agentIntegrations: settings.agentIntegrations,
      language: session.language,
      voiceProfile: settings.voiceProfile,
    } as const;
    const recentMemories = relevantReadingMemories(store, session, 5);
    let systemPrompt: string;
    if (mode === 'full') {
      const fullPaper = (session.pages || []).join('\n\n--- Page break ---\n\n');
      systemPrompt = buildFullContextAnalyzePrompt(ctx, fullPaper, {
        recentMemories,
      });
    } else {
      systemPrompt = buildAnalyzePrompt(ctx, {
        runningSynthesis: mode === 'rolling' ? session.runningSynthesis : undefined,
        recentMemories,
      });
    }
    const { model } = selectShwashaModel('analyze_page', { localAvailable: settings.ollamaEnabled });
    const provider = pickProviderForModel(model);
    if (!provider) {
      return c.json({ error: `No provider configured for model "${model}". Add its API key in Settings.` }, 400);
    }

    return streamSSE(c, async (stream) => {
      const messageId = crypto.randomUUID();
      const startedAt = new Date().toISOString();

      await stream.writeSSE({
        event: 'message.start',
        data: JSON.stringify({
          messageId,
          sessionId: session.id,
          pageNumber: body.pageNumber,
          agentId: 'reading-helper',
          createdAt: startedAt,
        }),
      });

      const userContent = body.paperContext
        ? `Paper: ${body.paperContext.title || session.paperTitle}\nAuthors: ${body.paperContext.authors || ''}\nYear: ${body.paperContext.year ?? ''}\n\n--- Page ${body.pageNumber} text ---\n${body.pageText}`
        : `--- Page ${body.pageNumber} text ---\n${body.pageText}`;

      let fullText = '';
      let usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
      try {
        for await (const chunk of provider.chat({
          model,
          systemPrompt,
          messages: [{ role: 'user', content: userContent }],
          temperature: 0.2,
          maxTokens: 2000,
        })) {
          if (chunk.type === 'text') {
            fullText += chunk.content;
            await stream.writeSSE({
              event: 'message.delta',
              data: JSON.stringify({ messageId, text: chunk.content }),
            });
          } else if (chunk.type === 'usage') {
            usage = chunk.usage;
          } else if (chunk.type === 'error') {
            await stream.writeSSE({
              event: 'message.error',
              data: JSON.stringify({ messageId, error: chunk.error }),
            });
            await stream.writeSSE({ event: 'done', data: '{}' });
            return;
          }
        }
      } catch (err) {
        await stream.writeSSE({
          event: 'message.error',
          data: JSON.stringify({ messageId, error: err instanceof Error ? err.message : 'stream failed' }),
        });
        await stream.writeSSE({ event: 'done', data: '{}' });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(stripJsonFences(fullText));
      } catch (err) {
        await stream.writeSSE({
          event: 'message.error',
          data: JSON.stringify({
            messageId,
            error: err instanceof Error ? err.message : 'parse failed',
            raw: fullText,
          }),
        });
        await stream.writeSSE({ event: 'done', data: '{}' });
        return;
      }

      const safe = AnalyzeResultSchema.safeParse(parsed);
      if (!safe.success) {
        await stream.writeSSE({
          event: 'message.error',
          data: JSON.stringify({
            messageId,
            error: safe.error.message,
            raw: fullText,
          }),
        });
        await stream.writeSSE({ event: 'done', data: '{}' });
        return;
      }

      const existing = sessionPageAnalyses(store, session.id);
      const { version, parentVersionId } = nextVersionForPage(existing, body.pageNumber);
      const tokenCostUsd = provider.estimateCost(usage.inputTokens, usage.outputTokens, model);
      const analysisRecord: PageAnalysisRecord = {
        id: crypto.randomUUID(),
        sessionId: session.id,
        pageNumber: body.pageNumber,
        version,
        parentVersionId,
        analysis: safe.data as unknown as Record<string, unknown>,
        refinementRequest: null,
        modelUsed: model,
        providerUsed: provider.name,
        tokenCostUsd,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        rawText: fullText,
        createdAt: new Date().toISOString(),
      };
      if (!store.pageAnalyses) store.pageAnalyses = [];
      store.pageAnalyses.push(analysisRecord);
      session.totalCost = (session.totalCost || 0) + tokenCostUsd;
      session.updatedAt = new Date().toISOString();

      // Persist a per-page memory for cross-paper recall.
      upsertPageMemory(
        store,
        session,
        body.pageNumber,
        analysisRecord.id,
        safe.data.main_idea,
        safe.data.tags || []
      );

      // Rolling mode: update the running synthesis via a cheap Haiku call.
      if (mode === 'rolling') {
        try {
          const { model: synthModel } = selectShwashaModel('quick_chat', { localAvailable: settings.ollamaEnabled });
          const synthProvider = pickProviderForModel(synthModel);
          if (synthProvider) {
            const synthPrompt = buildSynthesisUpdatePrompt({
              runningSynthesis: session.runningSynthesis || '',
              newPageMainIdea: safe.data.main_idea,
              language: session.language,
            });
            let synthText = '';
            let synthUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
            for await (const chunk of synthProvider.chat({
              model: synthModel,
              systemPrompt: synthPrompt,
              messages: [{ role: 'user', content: 'Update the synthesis now.' }],
              temperature: 0.3,
              maxTokens: 200,
            })) {
              if (chunk.type === 'text') synthText += chunk.content;
              else if (chunk.type === 'usage') synthUsage = chunk.usage;
              else if (chunk.type === 'error') break;
            }
            const cleaned = synthText.trim().replace(/^"|"$/g, '');
            if (cleaned) session.runningSynthesis = cleaned;
            const synthCost = synthProvider.estimateCost(synthUsage.inputTokens, synthUsage.outputTokens, synthModel);
            session.totalCost = (session.totalCost || 0) + synthCost;
          }
        } catch (err) {
          logger.warn({ err, sessionId: session.id }, 'synthesis update failed — continuing');
        }
      }

      saveStore();

      await stream.writeSSE({
        event: 'message.done',
        data: JSON.stringify({
          messageId,
          analysisId: analysisRecord.id,
          analysis: safe.data,
          version,
          modelUsed: model,
          tokenCost: tokenCostUsd,
          runningSynthesis: session.runningSynthesis,
          costWarning: mode === 'full',
          usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: tokenCostUsd, model },
        }),
      });
      await stream.writeSSE({ event: 'done', data: '{}' });
    });
  });

  // ─── Refine (non-SSE) ───
  app.post('/api/shwasha/refine', async (c) => {
    const store = getStore();
    const body = await c.req.json<{
      sessionId: string;
      pageAnalysisId: string;
      refinementRequest: string;
      useDeepModel?: boolean;
    }>();
    const session = findSession(store, body.sessionId);
    if (!session) return c.json({ error: 'Session not found' }, 404);
    const original = (store.pageAnalyses || []).find((p) => p.id === body.pageAnalysisId && p.sessionId === session.id);
    if (!original) return c.json({ error: 'pageAnalysis not found' }, 404);
    if (!body.refinementRequest) return c.json({ error: 'refinementRequest required' }, 400);

    const settings = resolveSettings(store);
    const mindBlock = session.mindOverride || settings.mindBlock;
    const systemPrompt = buildRefinePrompt({
      mindBlock,
      agentIntegrations: settings.agentIntegrations,
      language: session.language,
      voiceProfile: settings.voiceProfile,
    });
    const { model } = selectShwashaModel('refine_analysis', { deep: !!body.useDeepModel, localAvailable: settings.ollamaEnabled });
    const provider = pickProviderForModel(model);
    if (!provider) return c.json({ error: `No provider configured for model "${model}".` }, 400);

    const userContent = [
      `Page ${original.pageNumber} previous analysis (JSON):`,
      JSON.stringify(original.analysis, null, 2),
      '',
      'User refinement request:',
      body.refinementRequest,
    ].join('\n');

    let fullText = '';
    let usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    try {
      for await (const chunk of provider.chat({
        model,
        systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        temperature: 0.2,
        maxTokens: 2000,
      })) {
        if (chunk.type === 'text') fullText += chunk.content;
        else if (chunk.type === 'usage') usage = chunk.usage;
        else if (chunk.type === 'error') return c.json({ error: chunk.error }, 502);
      }
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'stream failed' }, 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFences(fullText));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'parse failed', raw: fullText }, 502);
    }
    const safe = AnalyzeResultSchema.safeParse(parsed);
    if (!safe.success) {
      return c.json({ error: safe.error.message, raw: fullText }, 502);
    }

    const tokenCostUsd = provider.estimateCost(usage.inputTokens, usage.outputTokens, model);
    const existing = sessionPageAnalyses(store, session.id);
    const { version } = nextVersionForPage(existing, original.pageNumber);
    const refined: PageAnalysisRecord = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      pageNumber: original.pageNumber,
      version,
      parentVersionId: original.id,
      analysis: safe.data as unknown as Record<string, unknown>,
      refinementRequest: body.refinementRequest,
      modelUsed: model,
      providerUsed: provider.name,
      tokenCostUsd,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      rawText: fullText,
      createdAt: new Date().toISOString(),
    };
    if (!store.pageAnalyses) store.pageAnalyses = [];
    store.pageAnalyses.push(refined);
    session.totalCost = (session.totalCost || 0) + tokenCostUsd;
    session.updatedAt = new Date().toISOString();
    upsertPageMemory(store, session, original.pageNumber, refined.id, safe.data.main_idea, safe.data.tags || []);
    saveStore();

    return c.json({ analysis: refined, modelUsed: model, tokenCost: tokenCostUsd });
  });

  // ─── Chat (SSE prose) ───
  app.post('/api/shwasha/chat', async (c) => {
    const store = getStore();
    const body = await c.req.json<{
      sessionId: string;
      pageNumber?: number;
      message: string;
      conversationId?: string;
    }>();
    const session = findSession(store, body.sessionId);
    if (!session) return c.json({ error: 'Session not found' }, 404);
    if (!body.message) return c.json({ error: 'message required' }, 400);

    const settings = resolveSettings(store);
    const systemPrompt = buildChatPrompt({
      mindBlock: session.mindOverride || settings.mindBlock,
      agentIntegrations: settings.agentIntegrations,
      language: session.language,
      voiceProfile: settings.voiceProfile,
    });
    const { model } = selectShwashaModel('quick_chat', { localAvailable: settings.ollamaEnabled });
    const provider = pickProviderForModel(model);
    if (!provider) return c.json({ error: `No provider configured for model "${model}".` }, 400);

    const convId = body.conversationId || `shwasha-${session.id}`;
    const userContent = body.pageNumber !== undefined
      ? `Context: page ${body.pageNumber} of "${session.paperTitle}".\n\n${body.message}`
      : `Context: paper "${session.paperTitle}".\n\n${body.message}`;

    const userMsgId = crypto.randomUUID();
    const userCreatedAt = new Date().toISOString();
    if (!store.messages) store.messages = [];
    store.messages.push({
      id: userMsgId,
      conversationId: convId,
      role: 'user',
      content: body.message,
      createdAt: userCreatedAt,
      agentId: 'reading-helper',
    });
    saveStore();

    return streamSSE(c, async (stream) => {
      const assistantId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      await stream.writeSSE({
        event: 'message.start',
        data: JSON.stringify({
          messageId: assistantId,
          sessionId: session.id,
          agentId: 'reading-helper',
          kind: 'text',
          createdAt: startedAt,
        }),
      });

      let fullText = '';
      let usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
      try {
        for await (const chunk of provider.chat({
          model,
          systemPrompt,
          messages: [{ role: 'user', content: userContent }],
          temperature: 0.4,
          maxTokens: 1500,
        })) {
          if (chunk.type === 'text') {
            fullText += chunk.content;
            await stream.writeSSE({
              event: 'message.delta',
              data: JSON.stringify({ messageId: assistantId, text: chunk.content }),
            });
          } else if (chunk.type === 'usage') {
            usage = chunk.usage;
          } else if (chunk.type === 'error') {
            await stream.writeSSE({
              event: 'message.error',
              data: JSON.stringify({ messageId: assistantId, error: chunk.error }),
            });
            await stream.writeSSE({ event: 'done', data: '{}' });
            return;
          }
        }
      } catch (err) {
        await stream.writeSSE({
          event: 'message.error',
          data: JSON.stringify({ messageId: assistantId, error: err instanceof Error ? err.message : 'stream failed' }),
        });
        await stream.writeSSE({ event: 'done', data: '{}' });
        return;
      }

      const costUsd = provider.estimateCost(usage.inputTokens, usage.outputTokens, model);
      store.messages.push({
        id: assistantId,
        conversationId: convId,
        role: 'assistant',
        content: fullText,
        createdAt: startedAt,
        agentId: 'reading-helper',
      });
      session.totalCost = (session.totalCost || 0) + costUsd;
      session.updatedAt = new Date().toISOString();
      saveStore();

      await stream.writeSSE({
        event: 'message.done',
        data: JSON.stringify({
          messageId: assistantId,
          agentId: 'reading-helper',
          usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd, model },
        }),
      });
      await stream.writeSSE({ event: 'done', data: '{}' });
    });
  });

  // ─── Vision (non-SSE) ───
  app.post('/api/shwasha/vision', async (c) => {
    const store = getStore();
    const body = await c.req.json<{
      sessionId: string;
      pageNumber: number;
      imageBase64: string;
      task: 'extract_table' | 'describe_figure' | 'full_page';
      mediaType?: string;
    }>();
    const session = findSession(store, body.sessionId);
    if (!session) return c.json({ error: 'Session not found' }, 404);
    if (!body.imageBase64 || !body.task) return c.json({ error: 'imageBase64 and task required' }, 400);

    const settings = resolveSettings(store);
    const systemPrompt = buildVisionPrompt({
      mindBlock: session.mindOverride || settings.mindBlock,
      agentIntegrations: settings.agentIntegrations,
      language: session.language,
      voiceProfile: settings.voiceProfile,
    });
    const shwashaTask: ShwashaTask = body.task === 'full_page' ? 'vision_hard' : 'vision_normal';
    const { model } = selectShwashaModel(shwashaTask, { localAvailable: settings.ollamaEnabled });
    const provider = pickProviderForModel(model);
    if (!provider) return c.json({ error: `No provider configured for model "${model}".` }, 400);

    const taskDirective = body.task === 'extract_table'
      ? 'Extract the tabular data from this image as a markdown table.'
      : body.task === 'describe_figure'
        ? 'Describe the figure and interpret what it shows for the thesis.'
        : 'Analyze the full page image: text, figures, and tables together.';

    // Anthropic-style image content block. Gemini / Ollama will currently
    // see the content via JSON.stringify which is acceptable for now; model
    // selector routes vision tasks to Claude by default.
    const userContent: Array<{ type: string; [k: string]: unknown }> = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: body.mediaType || 'image/png',
          data: body.imageBase64,
        },
      },
      { type: 'text', text: `Page ${body.pageNumber} of "${session.paperTitle}". ${taskDirective}` },
    ];

    let fullText = '';
    let usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    try {
      for await (const chunk of provider.chat({
        model,
        systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        temperature: 0.2,
        maxTokens: 2000,
      })) {
        if (chunk.type === 'text') fullText += chunk.content;
        else if (chunk.type === 'usage') usage = chunk.usage;
        else if (chunk.type === 'error') return c.json({ error: chunk.error }, 502);
      }
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'vision failed' }, 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFences(fullText));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'parse failed', raw: fullText }, 502);
    }
    const safe = VisionResultSchema.safeParse(parsed);
    if (!safe.success) return c.json({ error: safe.error.message, raw: fullText }, 502);

    const costUsd = provider.estimateCost(usage.inputTokens, usage.outputTokens, model);
    session.totalCost = (session.totalCost || 0) + costUsd;
    session.updatedAt = new Date().toISOString();
    saveStore();

    return c.json({
      result: safe.data,
      modelUsed: model,
      tokenCost: costUsd,
      usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd, model },
    });
  });

  // ─── Save / export ───
  app.post('/api/shwasha/save', async (c) => {
    const store = getStore();
    const body = await c.req.json<{
      sessionId: string;
      targets: Array<'zotero' | 'obsidian' | 'vectors'>;
    }>();
    const session = findSession(store, body.sessionId);
    if (!session) return c.json({ error: 'Session not found' }, 404);
    if (!body.targets || body.targets.length === 0) return c.json({ error: 'targets required' }, 400);

    const analyses = sessionPageAnalyses(store, session.id)
      .slice()
      .sort((a, b) => (a.pageNumber - b.pageNumber) || (a.version - b.version));
    const latestPerPage = new Map<number, PageAnalysisRecord>();
    for (const a of analyses) latestPerPage.set(a.pageNumber, a);
    const latest = Array.from(latestPerPage.values()).sort((a, b) => a.pageNumber - b.pageNumber);

    // Aggregate highlights + tags + markdown summary across latest analyses.
    const zoteroHighlights: ZoteroHighlight[] = [];
    const allTags = new Set<string>();
    const mdLines: string[] = [`# ${session.paperTitle}`, ''];
    if (session.paperMeta?.authors) mdLines.push(`**Authors:** ${session.paperMeta.authors}`);
    if (session.paperMeta?.year) mdLines.push(`**Year:** ${session.paperMeta.year}`);
    if (session.paperMeta?.doi) mdLines.push(`**DOI:** ${session.paperMeta.doi}`);
    mdLines.push('');

    for (const a of latest) {
      const analysis = a.analysis as {
        main_idea?: string;
        phd_relevance?: string;
        tags?: string[];
        highlights?: Array<{ text: string; color: string; reason: string }>;
        question?: string | null;
      };
      mdLines.push(`## Page ${a.pageNumber}`);
      if (analysis.main_idea) mdLines.push(analysis.main_idea);
      if (analysis.phd_relevance) {
        mdLines.push('');
        mdLines.push(`**PhD relevance:** ${analysis.phd_relevance}`);
      }
      if (analysis.highlights && analysis.highlights.length > 0) {
        mdLines.push('');
        mdLines.push('### Highlights');
        for (const h of analysis.highlights) {
          mdLines.push(`- [${h.color}] "${h.text}" — ${h.reason}`);
          zoteroHighlights.push({
            text: h.text,
            color: toZoteroColor(h.color),
            reason: h.reason,
            page: a.pageNumber,
          });
        }
      }
      if (analysis.question) {
        mdLines.push('');
        mdLines.push(`**Question:** ${analysis.question}`);
      }
      for (const t of analysis.tags || []) allTags.add(t);
      mdLines.push('');
    }
    const markdown = mdLines.join('\n');
    const aggregatedTags = Array.from(allTags);

    const results: {
      zoteroResult?: { ok: boolean; steps: Array<{ step: string; ok: boolean; error?: string }> };
      obsidianResult?: { ok: boolean; path?: string; error?: string };
      vectorResult?: { ok: boolean; note: string };
    } = {};

    if (body.targets.includes('zotero')) {
      const steps: Array<{ step: string; ok: boolean; error?: string }> = [];
      if (session.source !== 'zotero' || !session.sourceRef) {
        steps.push({ step: 'resolve', ok: false, error: 'session.source is not zotero or sourceRef missing' });
        results.zoteroResult = { ok: false, steps };
      } else {
        const itemKey = session.sourceRef;
        try { await injectHighlights(itemKey, zoteroHighlights); steps.push({ step: 'highlights', ok: true }); }
        catch (err) { steps.push({ step: 'highlights', ok: false, error: err instanceof Error ? err.message : String(err) }); }
        try { await injectTags(itemKey, aggregatedTags); steps.push({ step: 'tags', ok: true }); }
        catch (err) { steps.push({ step: 'tags', ok: false, error: err instanceof Error ? err.message : String(err) }); }
        try { await injectNotes(itemKey, [markdown]); steps.push({ step: 'notes', ok: true }); }
        catch (err) { steps.push({ step: 'notes', ok: false, error: err instanceof Error ? err.message : String(err) }); }
        results.zoteroResult = { ok: steps.every((s) => s.ok), steps };
      }
    }

    if (body.targets.includes('obsidian')) {
      const safeTitle = session.paperTitle.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
      const notePath = `${safeTitle}.md`;
      try {
        await writeNote(notePath, markdown);
        results.obsidianResult = { ok: true, path: notePath };
      } catch (err) {
        results.obsidianResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    if (body.targets.includes('vectors')) {
      // pgvector integration ships in Phase 2; log the call here so we can
      // audit intent without shipping the ingest path yet.
      logger.info({ sessionId: session.id, pages: latest.length }, 'shwasha.save vectors requested — Phase 2 pgvector integration pending');
      results.vectorResult = { ok: true, note: 'pgvector integration comes in Phase 2' };
    }

    // Silence getApiKey unused warning while still exposing the dep for
    // future provider-gated behavior (e.g. Zotero web API fallback).
    void getApiKey;

    session.status = 'completed';
    session.completedAt = new Date().toISOString();
    session.updatedAt = session.completedAt;

    // Paper-level long-term memory summarising the read.
    const aggregated = session.runningSynthesis
      || latest.map((a) => (a.analysis as { main_idea?: string }).main_idea || '').filter(Boolean).join(' • ');
    if (!store.memories) store.memories = [];
    const paperMemContent = `[READ] ${session.paperTitle} by ${session.paperMeta?.authors || 'unknown'}. Synthesis: ${aggregated || '(no synthesis)'}`;
    const now = new Date().toISOString();
    const existingPaperMem = store.memories.find(
      (m) =>
        m.agentId === 'reading-helper' &&
        m.metadata?.sessionId === session.id &&
        m.metadata?.status === 'read'
    );
    if (existingPaperMem) {
      existingPaperMem.content = paperMemContent;
      existingPaperMem.updatedAt = now;
    } else {
      store.memories.push({
        id: crypto.randomUUID(),
        agentId: 'reading-helper',
        tier: 'long-term',
        content: paperMemContent,
        createdAt: now,
        updatedAt: now,
        metadata: {
          paperId: session.paperId,
          sessionId: session.id,
          status: 'read',
          finalCost: session.totalCost,
          paperTitle: session.paperTitle,
        },
      });
    }

    saveStore();
    logActivity('system', `Shwasha session saved: ${session.paperTitle}`, `targets=${body.targets.join(',')}`, { agentId: 'reading-helper', metadata: { sessionId: session.id, targets: body.targets } });

    return c.json(results);
  });

  // ─── Integration diagnostics ───
  app.get('/api/shwasha/test/zotero', async (c) => {
    const zoteroBase = process.env.ZOTERO_LOCAL_URL || 'http://localhost:23119/api';
    const hint =
      'Open Zotero. Enable Edit → Preferences → Advanced → Config Editor → extensions.zotero.httpServer.enabled = true. Restart Zotero.';
    try {
      const res = await fetch(`${zoteroBase}/users/0/items?limit=1`);
      if (!res.ok) {
        return c.json({ ok: false, error: `Zotero responded ${res.status}`, hint });
      }
      const json = (await res.json().catch(() => [])) as unknown[];
      const sampleCount = Array.isArray(json) ? json.length : 0;
      return c.json({ ok: true, sampleCount });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ ok: false, error: message, hint });
    }
  });

  // Obsidian connection check — uses the unified filesystem-based vault reader
  // (same path used by all platform features). The legacy "Local REST API plugin"
  // requirement was removed: we read the vault directly from disk via getVaultRoot().
  app.get('/api/shwasha/test/obsidian', async (c) => {
    try {
      const { getVaultRoot, listTopLevelFolders } = await import('@ruhool/core');
      const root = getVaultRoot();
      const folders = await listTopLevelFolders().catch(() => []);
      if (folders.length === 0) {
        return c.json({
          ok: false,
          error: `Vault path exists but has no folders: ${root}`,
          hint: 'Initialize the vault from /setup, or change the vault path via POST /api/vault/active.',
        });
      }
      return c.json({
        ok: true,
        mode: 'filesystem',
        vaultPath: root,
        topFolders: folders.length,
        sampleFolders: folders.slice(0, 5),
        note: 'Using unified filesystem access (same as the rest of the platform). No REST API plugin needed.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({
        ok: false,
        error: message,
        hint: 'Vault path not accessible. Set it from /setup → "Use this path now".',
      });
    }
  });

  // ─── Phase 3: standalone, auto-save, undo/redo, Zotero search, save-to-Obsidian enhanced ───

  // 3.1 — Create standalone (no-source) session
  app.post('/api/shwasha/sources/standalone', async (c) => {
    const store = getStore();
    const body = await c.req.json<{
      title?: string;
      language?: 'en' | 'ar';
    }>().catch(() => ({ title: undefined, language: undefined }));
    const settings = resolveSettings(store);
    const now = new Date().toISOString();
    const session: ReadingSessionRecord = {
      id: crypto.randomUUID(),
      paperId: `standalone-${Date.now()}`,
      paperTitle: body.title ?? (settings.defaultLanguage === 'ar' ? 'ملاحظات حرة' : 'Free Notes'),
      source: 'standalone',
      totalPages: 1,
      currentPage: 1,
      language: body.language ?? settings.defaultLanguage,
      status: 'active',
      mindOverride: null,
      totalCost: 0,
      readingMode: 'rolling',
      pages: [''],
      draftNotes: '',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    if (!store.readingSessions) store.readingSessions = [];
    store.readingSessions.push(session);
    saveStore();
    return c.json(session, 201);
  });

  // 3.2 — Search Zotero by title / filename
  app.get('/api/shwasha/zotero/search', async (c) => {
    const q = c.req.query('q');
    if (!q) return c.json({ error: 'q required' }, 400);
    try {
      const { zoteroSearchByTitle, zoteroFilenameToQuery } = await import('@ruhool/core');
      const query = q.includes('.') ? zoteroFilenameToQuery(q) : q;
      const results = await zoteroSearchByTitle(query);
      return c.json({ results, query });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // Link a Zotero item to a session
  app.post('/api/shwasha/sessions/:id/link-zotero', async (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<{ itemKey: string }>();
    if (!body.itemKey) return c.json({ error: 'itemKey required' }, 400);
    session.linkedZoteroKey = body.itemKey;
    session.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true, linkedZoteroKey: body.itemKey });
  });

  // 3.3 — Vision: extract paper metadata from screenshot then search Zotero
  app.post('/api/shwasha/vision/identify', async (c) => {
    const body = await c.req.json<{ imageBase64: string; mimeType?: string }>();
    if (!body.imageBase64) return c.json({ error: 'imageBase64 required' }, 400);
    const model = 'claude-sonnet-4-6'; // vision
    const provider = pickProviderForModel(model);
    if (!provider) return c.json({ error: 'No vision provider configured' }, 400);

    const systemPrompt = `Extract bibliographic metadata from this screenshot of a research paper cover page or title area.
Return a JSON object with exactly these keys:
{
  "title": string | null,
  "authors": string[] | null,
  "year": number | null,
  "doi": string | null,
  "journal": string | null,
  "itemType": "journalArticle" | "conferencePaper" | "book" | "thesis" | "report" | "other"
}
Return ONLY the JSON. No prose.`;

    let fullText = '';
    for await (const chunk of provider.chat({
      model,
      systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: body.mimeType ?? 'image/png', data: body.imageBase64 } },
          { type: 'text', text: 'Extract bibliographic metadata from this paper.' },
        ] as unknown as string,
      }],
    })) {
      if (chunk.type === 'text') fullText += chunk.content;
    }

    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(stripJsonFences(fullText)); } catch { /* empty */ }

    let zoteroResults: unknown[] = [];
    if (meta.title) {
      try {
        const { zoteroSearchByTitle } = await import('@ruhool/core');
        zoteroResults = await zoteroSearchByTitle(String(meta.title));
      } catch { /* Zotero not running */ }
    }
    return c.json({ meta, zoteroResults });
  });

  // 3.5 — Polish/improve notes while preserving meaning
  app.post('/api/shwasha/sessions/:id/polish-notes', async (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<{ text: string; language?: 'en' | 'ar' }>();
    if (!body.text?.trim()) return c.json({ error: 'text required' }, 400);

    const settings = resolveSettings(store);
    const language = body.language ?? session.language;
    const model = 'claude-sonnet-4-6';
    const provider = pickProviderForModel(model);
    if (!provider) return c.json({ error: 'No provider configured' }, 400);

    const voiceNote = settings.voiceProfile
      ? `\nThe user's writing voice:\n${settings.voiceProfile}\nMatch their style — preserve idiosyncrasies.\n`
      : '';

    const systemPrompt = [
      language === 'ar'
        ? 'أنت مساعد تحرير أكاديمي. مهمتك تحسين الملاحظات دون تغيير معناها أو حذف معلومات.'
        : 'You are an academic editing assistant. Polish the notes without changing meaning or removing information.',
      voiceNote,
      'Rules: preserve all facts, citations, page numbers. Fix grammar/structure only.',
      'Return a JSON object: { "polished": string, "changes": string[] - short list of what was improved }',
      'Return ONLY the JSON.',
    ].join('\n');

    let fullText = '';
    for await (const chunk of provider.chat({
      model,
      systemPrompt,
      messages: [{ role: 'user', content: body.text }],
    })) {
      if (chunk.type === 'text') fullText += chunk.content;
    }

    try {
      const result = JSON.parse(stripJsonFences(fullText));
      return c.json({ ok: true, ...result });
    } catch {
      return c.json({ ok: false, polished: body.text, changes: [], raw: fullText });
    }
  });

  // 3.7 — Undo: push/pop on session's undoStack
  app.post('/api/shwasha/sessions/:id/undo-push', async (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<{ field: string; previousValue: unknown }>();
    if (!session.undoStack) session.undoStack = [];
    session.undoStack.push({ id: crypto.randomUUID(), ts: new Date().toISOString(), field: body.field, previousValue: body.previousValue });
    // Keep max 50 undo steps
    if (session.undoStack.length > 50) session.undoStack = session.undoStack.slice(-50);
    session.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true, stackSize: session.undoStack.length });
  });

  app.post('/api/shwasha/sessions/:id/undo-pop', (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    const stack = session.undoStack ?? [];
    if (stack.length === 0) return c.json({ ok: false, message: 'Nothing to undo' });
    const entry = stack.pop();
    session.undoStack = stack;
    session.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true, entry });
  });

  app.get('/api/shwasha/sessions/:id/undo-stack', (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    return c.json({ stack: session.undoStack ?? [], size: (session.undoStack ?? []).length });
  });

  // 3.6 — General assistant action executor
  // Actions are discrete, reversible mutations the chat can trigger.
  // Each returns { ok, result, undoPayload } so the frontend can push to undo stack.
  app.post('/api/shwasha/sessions/:id/action', async (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);

    const body = await c.req.json<{
      action: string;
      params?: Record<string, unknown>;
    }>();

    switch (body.action) {
      case 'rename': {
        const prev = session.paperTitle;
        session.paperTitle = String(body.params?.title ?? prev);
        session.updatedAt = new Date().toISOString();
        saveStore();
        return c.json({ ok: true, result: { newTitle: session.paperTitle }, undoPayload: { field: 'paperTitle', previousValue: prev } });
      }
      case 'set-language': {
        const prev = session.language;
        const lang = body.params?.language as 'en' | 'ar' | undefined;
        if (lang !== 'en' && lang !== 'ar') return c.json({ error: 'language must be en or ar' }, 400);
        session.language = lang;
        session.updatedAt = new Date().toISOString();
        saveStore();
        return c.json({ ok: true, result: { language: lang }, undoPayload: { field: 'language', previousValue: prev } });
      }
      case 'set-reading-mode': {
        const prev = session.readingMode;
        const mode = body.params?.mode as ReadingMode | undefined;
        if (!mode) return c.json({ error: 'mode required' }, 400);
        session.readingMode = mode;
        session.updatedAt = new Date().toISOString();
        saveStore();
        return c.json({ ok: true, result: { readingMode: mode }, undoPayload: { field: 'readingMode', previousValue: prev } });
      }
      case 'update-draft-notes': {
        const prev = session.draftNotes;
        session.draftNotes = String(body.params?.notes ?? '');
        session.draftSavedAt = new Date().toISOString();
        session.updatedAt = session.draftSavedAt;
        saveStore();
        return c.json({ ok: true, result: { saved: true }, undoPayload: { field: 'draftNotes', previousValue: prev } });
      }
      case 'set-mind-override': {
        const prev = session.mindOverride;
        session.mindOverride = body.params?.mindOverride != null ? String(body.params.mindOverride) : null;
        session.updatedAt = new Date().toISOString();
        saveStore();
        return c.json({ ok: true, result: { mindOverride: session.mindOverride }, undoPayload: { field: 'mindOverride', previousValue: prev } });
      }
      case 'complete-session': {
        const prev = session.status;
        session.status = 'completed';
        session.completedAt = new Date().toISOString();
        session.updatedAt = session.completedAt;
        saveStore();
        return c.json({ ok: true, result: { status: 'completed' }, undoPayload: { field: 'status', previousValue: prev } });
      }
      default:
        return c.json({ error: `Unknown action: ${body.action}` }, 400);
    }
  });

  // 3.8 — Auto-save draft notes
  app.put('/api/shwasha/sessions/:id/draft', async (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<{ draftNotes: string }>();
    session.draftNotes = body.draftNotes ?? '';
    session.draftSavedAt = new Date().toISOString();
    session.updatedAt = session.draftSavedAt;
    saveStore();
    return c.json({ ok: true, savedAt: session.draftSavedAt });
  });

  // 3.4 — Enhanced save-to-Obsidian: create Zotero stub + write note matching lit-review template
  app.post('/api/shwasha/sessions/:id/save-to-obsidian', async (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);

    const { renderLitNote, createZoteroItem } = await import('@ruhool/core');

    const meta = session.paperMeta ?? {};
    const citekey = (meta.citekey as string | undefined)
      ?? `${(meta.authors as string | undefined)?.split(',')[0]?.split(' ').pop()?.toLowerCase() ?? 'unknown'}${meta.year ?? new Date().getFullYear()}`;

    // Gather all analyses highlights for this session
    const analyses = ((store.pageAnalyses ?? []).filter((a) => a.sessionId === session.id) as PageAnalysisRecord[]);
    const allHighlights: Array<{ text: string; color: string; reason: string }> = [];
    const allTags = new Set<string>();
    let phdRelevance = '';
    let arabicTakeaway: string[] = [];

    for (const a of analyses) {
      const analysis = a.analysis as Record<string, unknown>;
      if (Array.isArray(analysis.highlights)) {
        for (const h of analysis.highlights as Array<{ text: string; color: string; reason: string }>) {
          allHighlights.push(h);
        }
      }
      if (Array.isArray(analysis.tags)) {
        for (const t of analysis.tags as string[]) allTags.add(t);
      }
      if (!phdRelevance && typeof analysis.phd_relevance === 'string') {
        phdRelevance = analysis.phd_relevance;
      }
      if (arabicTakeaway.length === 0 && Array.isArray(analysis.arabic_takeaway)) {
        arabicTakeaway = analysis.arabic_takeaway as string[];
      }
    }

    // Optional: create Zotero stub if not linked yet
    let zoteroItemKey = session.linkedZoteroKey ?? null;
    if (!zoteroItemKey && session.source !== 'zotero') {
      try {
        const authorsRaw = meta.authors as string | undefined;
        const authorParts = authorsRaw
          ? authorsRaw.split(',').map((a) => {
              const parts = a.trim().split(' ');
              return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] ?? '' };
            })
          : [];
        zoteroItemKey = await createZoteroItem({
          title: session.paperTitle,
          authors: authorParts,
          year: meta.year as number | undefined,
          doi: meta.doi as string | undefined,
          abstractNote: meta.abstractNote as string | undefined,
          tags: [...allTags],
        });
        session.linkedZoteroKey = zoteroItemKey;
      } catch { /* Zotero not running — skip */ }
    }

    const markdown = renderLitNote({
      citekey,
      type: meta.itemType as string | undefined ?? 'journalArticle',
      year: meta.year as number | undefined,
      authors: meta.authors as string | undefined,
      tags: [...allTags],
      phdRelevance,
      highlights: allHighlights,
      arabicTakeaway,
      myNotes: session.draftNotes ?? undefined,
      zoteroItemKey: zoteroItemKey ?? undefined,
      abstract: meta.abstractNote as string | undefined,
    });

    const notePath = `01 PhD/02 Literature Review/Academic Literature/${citekey}.md`;
    await writeNote(notePath, markdown);
    session.updatedAt = new Date().toISOString();
    saveStore();

    return c.json({ ok: true, notePath, citekey, zoteroItemKey });
  });

  // ─── Modes + editing + memory ───

  app.post('/api/shwasha/sources/screen-capture', async (c) => {
    const store = getStore();
    const body = await c.req.json<{
      paperTitle?: string;
      language?: 'en' | 'ar';
      mindOverride?: string | null;
      readingMode?: ReadingMode;
    }>().catch(() => ({} as Record<string, never>));
    const settings = resolveSettings(store);
    const language = body.language || settings.defaultLanguage;
    const now = new Date().toISOString();
    const session: ReadingSessionRecord = {
      id: crypto.randomUUID(),
      paperId: crypto.randomUUID(),
      paperTitle: body.paperTitle || 'Screen capture session',
      source: 'screen-capture',
      sourceRef: null,
      totalPages: 0,
      currentPage: 1,
      language,
      status: 'active',
      mindOverride: body.mindOverride ?? null,
      totalCost: 0,
      readingMode: body.readingMode || 'rolling',
      pages: [],
      pageImages: {},
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    if (!store.readingSessions) store.readingSessions = [];
    store.readingSessions.push(session);
    saveStore();
    logActivity('system', `Shwasha screen-capture session started`, `title=${session.paperTitle}`, {
      agentId: 'reading-helper',
      metadata: { sessionId: session.id, paperId: session.paperId },
    });
    return c.json({ id: session.id }, 201);
  });

  app.post('/api/shwasha/sessions/:id/captures', async (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Session not found' }, 404);
    const body = await c.req.json<{
      pageNumber: number;
      fileName?: string;
      label?: string;
      imageBase64: string;
      mimeType: string;
      specialPrompt?: string;
      deep?: boolean;
    }>();
    if (typeof body.pageNumber !== 'number' || body.pageNumber < 1) {
      return c.json({ error: 'pageNumber (>=1) required' }, 400);
    }
    if (!body.imageBase64 || !body.mimeType) {
      return c.json({ error: 'imageBase64 and mimeType required' }, 400);
    }

    if (!session.pageImages) session.pageImages = {};
    session.pageImages[String(body.pageNumber)] = {
      base64: body.imageBase64,
      mimeType: body.mimeType,
    };
    if (!session.pages) session.pages = [];
    const placeholder = '[screen capture — use vision]';
    while (session.pages.length < body.pageNumber) session.pages.push(placeholder);
    // Ensure the slot for this page carries the placeholder if empty.
    if (!session.pages[body.pageNumber - 1]) session.pages[body.pageNumber - 1] = placeholder;
    session.totalPages = Math.max(session.totalPages || 0, body.pageNumber);

    const settings = resolveSettings(store);
    const shwashaTask: ShwashaTask = body.deep === true ? 'vision_hard' : 'vision_normal';
    const { model } = selectShwashaModel(shwashaTask, { localAvailable: settings.ollamaEnabled });
    const provider = pickProviderForModel(model);
    if (!provider) return c.json({ error: `No provider configured for model "${model}".` }, 400);

    const baseVisionPrompt = buildVisionPrompt({
      mindBlock: session.mindOverride || settings.mindBlock,
      agentIntegrations: settings.agentIntegrations,
      language: session.language,
      voiceProfile: settings.voiceProfile,
    });
    const systemPrompt = body.specialPrompt
      ? `${baseVisionPrompt}\n\nAdditional user instructions:\n${body.specialPrompt}`
      : baseVisionPrompt;

    const userContent: Array<{ type: string; [k: string]: unknown }> = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: body.mimeType,
          data: body.imageBase64,
        },
      },
      {
        type: 'text',
        text: `Page ${body.pageNumber} of "${session.paperTitle}"${body.label ? ` (${body.label})` : ''}. Analyze the full page image: text, figures, tables.`,
      },
    ];

    let fullText = '';
    let usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    try {
      for await (const chunk of provider.chat({
        model,
        systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        temperature: 0.2,
        maxTokens: 2000,
      })) {
        if (chunk.type === 'text') fullText += chunk.content;
        else if (chunk.type === 'usage') usage = chunk.usage;
        else if (chunk.type === 'error') return c.json({ error: chunk.error }, 502);
      }
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'vision failed' }, 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFences(fullText));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'parse failed', raw: fullText }, 502);
    }
    const safe = VisionResultSchema.safeParse(parsed);
    if (!safe.success) return c.json({ error: safe.error.message, raw: fullText }, 502);

    // Map vision output → analyze-style page analysis for UI uniformity.
    const vision = safe.data;
    const mainIdea = vision.extracted_content || vision.description;
    const highlights = vision.highlights;
    const mappedAnalysis: Record<string, unknown> = {
      main_idea: mainIdea,
      table_data: vision.data_table || '',
      library_link: { exists: false, paper: null, note: null },
      phd_relevance: vision.phd_relevance,
      tags: [],
      highlights,
      question: null,
      arabic_takeaway: [],
      source: 'vision',
      content_type: vision.content_type,
      mermaid_diagram: vision.mermaid_diagram,
    };

    const tokenCostUsd = provider.estimateCost(usage.inputTokens, usage.outputTokens, model);
    const existing = sessionPageAnalyses(store, session.id);
    const { version, parentVersionId } = nextVersionForPage(existing, body.pageNumber);
    const record: PageAnalysisRecord = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      pageNumber: body.pageNumber,
      version,
      parentVersionId,
      analysis: mappedAnalysis,
      refinementRequest: null,
      modelUsed: model,
      providerUsed: provider.name,
      tokenCostUsd,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      rawText: fullText,
      createdAt: new Date().toISOString(),
    };
    if (!store.pageAnalyses) store.pageAnalyses = [];
    store.pageAnalyses.push(record);
    session.totalCost = (session.totalCost || 0) + tokenCostUsd;
    session.updatedAt = new Date().toISOString();

    upsertPageMemory(store, session, body.pageNumber, record.id, mainIdea, []);

    saveStore();
    return c.json({ pageAnalysis: record, session });
  });

  app.patch('/api/shwasha/analyses/:id', async (c) => {
    const store = getStore();
    const id = c.req.param('id');
    const record = (store.pageAnalyses || []).find((p) => p.id === id);
    if (!record) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<{
      mainIdea?: string;
      tableData?: string;
      phdRelevance?: string;
      tags?: string[];
      highlights?: Array<{ text: string; color: string; reason: string }>;
      question?: string | null;
      arabicTakeaway?: string[];
      libraryLink?: { exists: boolean; paper?: string | null; note?: string | null };
    }>();

    const analysis = { ...(record.analysis as Record<string, unknown>) };
    if (body.mainIdea !== undefined) analysis.main_idea = body.mainIdea;
    if (body.tableData !== undefined) analysis.table_data = body.tableData;
    if (body.phdRelevance !== undefined) analysis.phd_relevance = body.phdRelevance;
    if (body.tags !== undefined) analysis.tags = body.tags;
    if (body.highlights !== undefined) analysis.highlights = body.highlights;
    if (body.question !== undefined) analysis.question = body.question;
    if (body.arabicTakeaway !== undefined) analysis.arabic_takeaway = body.arabicTakeaway;
    if (body.libraryLink !== undefined) analysis.library_link = body.libraryLink;
    record.analysis = analysis;
    record.humanEdited = true;
    record.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ pageAnalysis: record });
  });

  app.patch('/api/shwasha/sessions/:id/notes', async (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Session not found' }, 404);
    const body = await c.req.json<{ pageNumber: number; content: string }>();
    if (typeof body.pageNumber !== 'number') return c.json({ error: 'pageNumber required' }, 400);
    if (!session.userNotes) session.userNotes = {};
    const key = String(body.pageNumber);
    if (typeof body.content === 'string' && body.content.length > 0) {
      session.userNotes[key] = body.content;
    } else {
      delete session.userNotes[key];
    }
    session.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ userNotes: session.userNotes });
  });

  app.post('/api/shwasha/tac', async (c) => {
    const store = getStore();
    const body = await c.req.json<{
      sessionId: string;
      sectionIndexes?: [number, number, number];
    }>();
    const session = findSession(store, body.sessionId);
    if (!session) return c.json({ error: 'Session not found' }, 404);
    const pages = session.pages || [];
    if (pages.length === 0) return c.json({ error: 'Session has no pages to analyze' }, 400);

    let indexes = body.sectionIndexes;
    if (!indexes || indexes.length !== 3) {
      const abstractRe = /(abstract|الملخص|ملخص)/i;
      const conclusionRe = /(conclusions?|الخاتمة|الاستنتاج)/i;
      const abstractHits: number[] = [];
      const conclusionHits: number[] = [];
      for (let i = 0; i < pages.length; i++) {
        const t = pages[i] || '';
        if (abstractRe.test(t)) abstractHits.push(i);
        if (conclusionRe.test(t)) conclusionHits.push(i);
      }
      if (abstractHits.length > 1 && conclusionHits.length > 1) {
        const candidates = [
          ...abstractHits.map((i) => ({ index: i, title: 'abstract-candidate', snippet: (pages[i] || '').slice(0, 200) })),
          ...conclusionHits.map((i) => ({ index: i, title: 'conclusion-candidate', snippet: (pages[i] || '').slice(0, 200) })),
        ];
        return c.json({ ambiguous: true, candidates });
      }
      const titleIdx = 0;
      const abstractIdx = abstractHits[0] ?? Math.min(1, pages.length - 1);
      const conclusionIdx = conclusionHits[0] ?? Math.max(0, pages.length - 1);
      indexes = [titleIdx, abstractIdx, conclusionIdx];
    }

    const [a, b, d] = indexes;
    const combined = [pages[a] || '', pages[b] || '', pages[d] || '']
      .filter(Boolean)
      .join('\n\n--- Section break ---\n\n');

    const settings = resolveSettings(store);
    const systemPrompt = buildAnalyzePrompt(
      {
        mindBlock: session.mindOverride || settings.mindBlock,
        agentIntegrations: settings.agentIntegrations,
        language: session.language,
        voiceProfile: settings.voiceProfile,
      },
      { recentMemories: relevantReadingMemories(store, session, 5) }
    );
    const { model } = selectShwashaModel('analyze_page', { localAvailable: settings.ollamaEnabled });
    const provider = pickProviderForModel(model);
    if (!provider) return c.json({ error: `No provider configured for model "${model}".` }, 400);

    const userContent = `TAC digest for "${session.paperTitle}" — Title + Abstract + Conclusion combined.\n\n${combined}`;
    let fullText = '';
    let usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    try {
      for await (const chunk of provider.chat({
        model,
        systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        temperature: 0.2,
        maxTokens: 2000,
      })) {
        if (chunk.type === 'text') fullText += chunk.content;
        else if (chunk.type === 'usage') usage = chunk.usage;
        else if (chunk.type === 'error') return c.json({ error: chunk.error }, 502);
      }
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'stream failed' }, 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFences(fullText));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'parse failed', raw: fullText }, 502);
    }
    const safe = AnalyzeResultSchema.safeParse(parsed);
    if (!safe.success) return c.json({ error: safe.error.message, raw: fullText }, 502);

    const tokenCostUsd = provider.estimateCost(usage.inputTokens, usage.outputTokens, model);
    const existing = sessionPageAnalyses(store, session.id);
    const { version, parentVersionId } = nextVersionForPage(existing, 0);
    const record: PageAnalysisRecord = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      pageNumber: 0,
      version,
      parentVersionId,
      analysis: safe.data as unknown as Record<string, unknown>,
      refinementRequest: null,
      modelUsed: model,
      providerUsed: provider.name,
      tokenCostUsd,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      rawText: fullText,
      createdAt: new Date().toISOString(),
    };
    if (!store.pageAnalyses) store.pageAnalyses = [];
    store.pageAnalyses.push(record);
    session.totalCost = (session.totalCost || 0) + tokenCostUsd;
    session.updatedAt = new Date().toISOString();

    upsertPageMemory(store, session, 0, record.id, safe.data.main_idea, safe.data.tags || []);

    saveStore();
    return c.json({ pageAnalysis: record });
  });
}
