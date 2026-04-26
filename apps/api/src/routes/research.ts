// Background research — extracted from index.ts (REL-01 stage 2d).
// Exposes createResearchService() which returns { runResearch, register }.
// register(app) mounts:
//   POST /api/research
//   GET  /api/tasks
//   GET  /api/tasks/:id

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Hono } from 'hono';
import type { Queue } from 'bullmq';
import type { StoreData } from '../store/types.js';
import type { createLogActivity } from '../services/activity.js';
import type { taskStore as TaskStore, updateTask as UpdateTask } from '../state/tasks-store.js';

export interface TaskRecord {
  id: string;
  type: string;
  status: string;
  query: string;
  depth?: 'quick' | 'deep';
  language?: 'en' | 'ar';
  progress: number;
  createdAt: string;
  updatedAt: string;
  result?: string;
  error?: string;
}

export interface AnthropicLike {
  chat(params: {
    model: string;
    systemPrompt?: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens?: number;
  }): AsyncIterable<{ type: string; content?: string }>;
}

export interface ResearchServiceDeps {
  getStore: () => StoreData;
  taskStore: typeof TaskStore;
  updateTask: typeof UpdateTask;
  getProvider: () => AnthropicLike | null;
  getResearchQueue: () => Queue | null;
  logActivity: ReturnType<typeof createLogActivity>;
  logger: { info: (msg: string) => void; error: (obj: { err: unknown }, msg: string) => void };
  researchDir: string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u0600-\u06FF]+/g, (m) => m)
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'research';
}

function formatAPA(sources: Array<{ url: string; title: string; publishedDate?: string }>): string {
  return sources.map((s, i) => {
    const host = (() => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    const year = s.publishedDate ? new Date(s.publishedDate).getFullYear() : 'n.d.';
    return `[${i + 1}] ${s.title}. (${year}). ${host}. ${s.url}`;
  }).join('\n');
}

export function createResearchService(deps: ResearchServiceDeps) {
  const { getStore, taskStore, updateTask, getProvider, getResearchQueue, logActivity, logger, researchDir } = deps;

  function ensureResearchDir(slug: string): string {
    const dir = path.join(researchDir, slug);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async function tavilySearch(query: string, maxResults = 5): Promise<Array<{ url: string; title: string; content: string; score?: number }>> {
    const store = getStore();
    const apiKeys = ((store as unknown as { apiKeys?: Record<string, string> }).apiKeys || {}) as Record<string, string>;
    const key = apiKeys.tavilyKey;
    if (!key) return [];
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: key, query, max_results: maxResults, include_answer: false, search_depth: 'advanced',
        }),
      });
      if (!res.ok) return [];
      const data = await res.json() as { results?: Array<{ url: string; title: string; content: string; score?: number }> };
      return data.results || [];
    } catch { return []; }
  }

  async function runResearch(taskId: string): Promise<void> {
    const task = taskStore.get(taskId) as TaskRecord | undefined;
    if (!task) return;

    const provider = getProvider();
    if (!provider) {
      updateTask(taskId, { status: 'failed', error: 'No API provider configured' });
      return;
    }

    try {
      updateTask(taskId, { status: 'searching', progress: 10 });

      const isDeep = task.depth === 'deep';
      const queryCount = isDeep ? 7 : 3;
      const store = getStore();
      const tavilyAvailable = !!(((store as unknown as { apiKeys?: Record<string, string> }).apiKeys || {}) as Record<string, string>).tavilyKey;
      const langInstruction = task.language === 'ar'
        ? 'اكتب بالعربية الفصحى. لا تستخدم إيموجي.'
        : 'Write in English. No emojis.';

      let queryGenResult = '';
      for await (const chunk of provider.chat({
        model: 'claude-sonnet-4-6',
        systemPrompt: `You are a research query generator. Given a topic, generate ${queryCount} specific search queries that would help research this topic comprehensively. Return ONLY the queries, one per line, numbered. ${langInstruction}`,
        messages: [{ role: 'user', content: task.query }],
        maxTokens: 500,
      })) {
        if (chunk.type === 'text') queryGenResult += chunk.content ?? '';
      }

      const queries = queryGenResult.split('\n').filter((l) => l.trim()).map((l) => l.replace(/^\d+[.)]\s*/, '').trim()).slice(0, queryCount);
      updateTask(taskId, { progress: 20 });

      const allSources: Array<{ url: string; title: string; content: string }> = [];
      const seenUrls = new Set<string>();
      if (tavilyAvailable) {
        updateTask(taskId, { status: 'searching', progress: 25 });
        for (let i = 0; i < queries.length; i++) {
          const results = await tavilySearch(queries[i], isDeep ? 5 : 3);
          for (const r of results) {
            if (seenUrls.has(r.url)) continue;
            seenUrls.add(r.url);
            allSources.push({ url: r.url, title: r.title, content: r.content.slice(0, 2000) });
          }
          updateTask(taskId, { progress: 25 + Math.round(((i + 1) / queries.length) * 15) });
        }
      }

      updateTask(taskId, { status: 'analyzing', progress: 45 });
      const analyses: string[] = [];

      for (let i = 0; i < queries.length; i++) {
        const querySources = tavilyAvailable
          ? allSources.filter((_, idx) => idx < (i + 1) * (isDeep ? 5 : 3) && idx >= i * (isDeep ? 5 : 3))
          : [];
        const sourcesBlock = querySources.length > 0
          ? '\n\nSources:\n' + querySources.map((s, si) => `[S${i}-${si + 1}] ${s.title} (${s.url})\n${s.content}`).join('\n\n')
          : '';

        let analysisResult = '';
        for await (const chunk of provider.chat({
          model: 'claude-sonnet-4-6',
          systemPrompt: `You are الباحث (Al-Bahith), a deep research agent. Analyze and synthesize information. When sources are provided, cite them using [S#-#] markers. Extract substantive findings only. Note methodologies, gaps, and conflicting views. ${langInstruction}`,
          messages: [{ role: 'user', content: `Research query: ${queries[i]}\n\nOriginal topic: ${task.query}${sourcesBlock}` }],
          maxTokens: isDeep ? 2000 : 1000,
        })) {
          if (chunk.type === 'text') analysisResult += chunk.content ?? '';
        }
        analyses.push(analysisResult);
        updateTask(taskId, { progress: 45 + Math.round(((i + 1) / queries.length) * 30) });
      }

      updateTask(taskId, { status: 'writing', progress: 75 });

      const compiledAnalyses = analyses.map((a, i) => `### Query ${i + 1}: ${queries[i]}\n\n${a}`).join('\n\n---\n\n');
      const apaReferences = allSources.length > 0 ? formatAPA(allSources.map((s) => ({ url: s.url, title: s.title }))) : '';

      let finalReport = '';
      for await (const chunk of provider.chat({
        model: 'claude-sonnet-4-6',
        systemPrompt: `You are الباحث (Al-Bahith), a deep research agent. Compile the research analyses into a unified, well-structured academic report with clear section headings. When you cite findings, map [S#-#] markers to numeric citations [1], [2], etc. matching the References list. The References list is already formatted in APA style and must be appended verbatim at the end under "## References". ${langInstruction}`,
        messages: [{ role: 'user', content: `Topic: ${task.query}\n\nResearch analyses:\n${compiledAnalyses}\n\nReferences (APA):\n${apaReferences || '(no web sources — no references)'}` }],
        maxTokens: isDeep ? 6000 : 2048,
      })) {
        if (chunk.type === 'text') finalReport += chunk.content ?? '';
      }

      updateTask(taskId, { progress: 95 });

      const slug = slugify(task.query);
      const dir = ensureResearchDir(slug);
      const reportPath = path.join(dir, 'report.md');
      fs.writeFileSync(reportPath, finalReport, 'utf-8');

      updateTask(taskId, { status: 'complete', progress: 100, result: finalReport });
      logActivity('task', `Research task completed`, `Query: ${task.query.slice(0, 100)}`, { agentId: 'research', metadata: { taskId, reportLength: finalReport.length } });
      logger.info(`[research] Task ${taskId.slice(0, 8)}... complete, saved to ${reportPath}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Research failed';
      updateTask(taskId, { status: 'failed', error: errMsg });
      logActivity('error', `Research task failed`, errMsg, { agentId: 'research', metadata: { taskId } });
      logger.error({ err }, `[research] Task ${taskId.slice(0, 8)}... failed`);
    }
  }

  function register(app: Hono): void {
    app.post('/api/research', async (c) => {
      const body = await c.req.json<{ query: string; depth?: 'quick' | 'deep'; language?: 'en' | 'ar' }>();
      if (!body.query?.trim()) return c.json({ error: 'query is required' }, 400);

      const taskId = crypto.randomUUID();
      const task: TaskRecord = {
        id: taskId,
        type: 'research',
        status: 'queued',
        query: body.query,
        depth: body.depth || 'quick',
        language: body.language || 'en',
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      taskStore.set(taskId, task as unknown as Parameters<typeof taskStore.set>[1]);

      const rq = getResearchQueue();
      if (rq) {
        rq.add('research', { taskId }, { jobId: taskId });
      } else {
        setTimeout(() => { void runResearch(taskId); }, 0);
      }

      return c.json({ taskId, status: 'queued' }, 202);
    });

    // Research-internal tasks — namespaced under /api/research to avoid collision
    // with user-facing /api/tasks (routes/tasks.ts). The `/api/tasks/:id` path
    // previously caught `/api/tasks/lists` and broke the tasks page.
    app.get('/api/research/tasks', (c) => {
      const tasks = Array.from(taskStore.values())
        .sort((a, b) => new Date((a as TaskRecord).createdAt).getTime() < new Date((b as TaskRecord).createdAt).getTime() ? 1 : -1);
      return c.json(tasks);
    });

    app.get('/api/research/tasks/:id', (c) => {
      const task = taskStore.get(c.req.param('id'));
      if (!task) return c.json({ error: 'Task not found' }, 404);
      return c.json(task);
    });
  }

  return { runResearch, register };
}
