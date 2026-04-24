/**
 * Meetings agent routes (عبدان / Abdan).
 * Chat → structured meeting record → Obsidian note (matching the Supervision
 * Interaction Points template) + optional Zotero note injection.
 */
import crypto from 'node:crypto';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Logger } from 'pino';
import type { StoreData, TaskItem } from '../store/types.js';
import type { UnifiedProvider } from '../services/llm/index.js';
import {
  buildMeetingExtractPrompt,
  buildMeetingChatPrompt,
  MeetingRecordSchema,
  writeNoteRaw,
  listNotes,
  writeFrontmatter,
} from '@ruhool/core';
import type { MeetingRecord } from '@ruhool/core';

export interface MeetingsRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  logger: Logger;
  pickProviderForModel: (model: string) => UnifiedProvider | undefined;
}

interface MeetingSessionRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  record: MeetingRecord | null;
  obsidianPath: string | null;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  draft: string; // raw free-form notes from the user
}

function getMeetingSessions(store: StoreData): MeetingSessionRecord[] {
  const s = store as unknown as { meetingSessions?: MeetingSessionRecord[] };
  if (!s.meetingSessions) s.meetingSessions = [];
  return s.meetingSessions;
}

function findSession(store: StoreData, id: string): MeetingSessionRecord | undefined {
  return getMeetingSessions(store).find((s) => s.id === id);
}

function stripJsonFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .replace(/:\s*undefined\b/g, ': null')
    .replace(/,(\s*[}\]])/g, '$1')
    .trim();
}

function getDefaultModel(store: StoreData): string {
  const override = (store.builtinAgentModels as Record<string, string> | undefined)?.meetings;
  return override ?? 'claude-sonnet-4-6';
}

function getVoiceProfile(store: StoreData): string {
  return store.userVoiceProfile?.content ?? '';
}

function getLanguage(store: StoreData): 'en' | 'ar' {
  return (store.shwashaSettings?.defaultLanguage as 'en' | 'ar') ?? 'en';
}

export function registerMeetingsRoutes(app: Hono, deps: MeetingsRoutesDeps): void {
  const { getStore, saveStore, pickProviderForModel } = deps;

  // ── List sessions ──────────────────────────────────────────────────
  app.get('/api/meetings/sessions', (c) => {
    const sessions = getMeetingSessions(getStore()).map(({ chatHistory: _ch, ...s }) => s);
    c.header('Cache-Control', 'private, max-age=60');
    return c.json(sessions);
  });

  // ── Create session ──────────────────────────────────────────────────
  app.post('/api/meetings/sessions', async (c) => {
    const store = getStore();
    const body = await c.req.json<{
      title?: string;
      draft?: string;
      suggestedNo?: number;
      suggestedDate?: string;
      suggestedLocation?: string;
      suggestedAttendees?: string[];
    }>();
    const session: MeetingSessionRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: body.title ?? `Meeting ${new Date().toLocaleDateString()}`,
      record: null,
      obsidianPath: null,
      chatHistory: [],
      draft: body.draft ?? '',
    };

    if (body.suggestedNo) {
      // Build confirmation message
      const dateStr = body.suggestedDate
        ? new Date(body.suggestedDate).toLocaleString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'TBD';
      const loc = body.suggestedLocation || 'TBD';
      const attendees = body.suggestedAttendees?.join(', ') || 'Dr Davies';

      const confirmMsg = `**Meeting #${body.suggestedNo}**\n\nBased on the previous meeting, here's what I have:\n\n📅 **Date & Time:** ${dateStr}\n📍 **Location:** ${loc}\n👥 **Expected attendees:** ${attendees}\n\n---\n\nIs everything correct? Let me know if:\n- The date or time changed\n- The location is different\n- Someone else attended\n\nOnce confirmed, just start writing your notes and I'll help structure them.`;

      session.chatHistory = [{ role: 'assistant', content: confirmMsg }];

      // Pre-fill record
      session.record = {
        No: body.suggestedNo,
        date: body.suggestedDate ?? null,
        Location: body.suggestedLocation ?? null,
        Summary: '',
        Attendees: body.suggestedAttendees ?? [],
        GRS2_Input: null,
        GRS2_Respond: null,
        GRS2_confirmed: false,
        Next_Meeting: null,
        Next_Location: null,
        action_plan_previous: [],
        agenda: [],
        discussion: '',
        action_plan_next: [],
        arabic_summary: [],
        tags: [],
      };
    }

    getMeetingSessions(store).push(session);
    saveStore();
    return c.json(session);
  });

  // ── Get session ─────────────────────────────────────────────────────
  app.get('/api/meetings/sessions/:id', (c) => {
    const session = findSession(getStore(), c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    return c.json(session);
  });

  // ── Update draft notes ──────────────────────────────────────────────
  app.patch('/api/meetings/sessions/:id', async (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<{ title?: string; draft?: string; record?: MeetingRecord }>();
    if (body.title !== undefined) session.title = body.title;
    if (body.draft !== undefined) session.draft = body.draft;
    if (body.record !== undefined) session.record = body.record;
    session.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(session);
  });

  // ── Extract meeting record from notes (SSE stream) ──────────────────
  app.post('/api/meetings/sessions/:id/extract', async (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);

    const rawBody = await c.req.json<{ notes?: string; language?: 'en' | 'ar' }>().catch(() => ({ notes: undefined, language: undefined }));
    const notes = rawBody.notes ?? session.draft;
    if (!notes.trim()) return c.json({ error: 'No notes to extract from' }, 400);

    const language = rawBody.language ?? getLanguage(store);
    const model = getDefaultModel(store);
    const provider = pickProviderForModel(model);
    if (!provider) return c.json({ error: `No provider for model "${model}"` }, 400);

    // Get last 3 meetings for context
    const sessions = getMeetingSessions(store)
      .filter((s) => s.id !== session.id && s.record)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 3);
    const vaultContext = sessions
      .map((s) => `Meeting (${s.record!.date ?? 'unknown date'}): ${s.record!.Summary}`)
      .join('\n');

    const systemPrompt = buildMeetingExtractPrompt({
      voiceProfile: getVoiceProfile(store),
      language,
      vaultContext,
    });

    return streamSSE(c, async (stream) => {
      let buffer = '';
      let usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
      try {
        await stream.writeSSE({ data: JSON.stringify({ type: 'start' }), event: 'message.start' });
        for await (const chunk of provider.chat({
          model,
          systemPrompt,
          messages: [{ role: 'user', content: `Extract a meeting record from these notes:\n\n${notes}` }],
        })) {
          if (chunk.type === 'text') {
            buffer += chunk.content;
            await stream.writeSSE({ data: JSON.stringify({ text: chunk.content }), event: 'message.delta' });
          } else if (chunk.type === 'usage') {
            usage = { inputTokens: chunk.usage.inputTokens ?? 0, outputTokens: chunk.usage.outputTokens ?? 0, cachedTokens: chunk.usage.cachedTokens ?? 0 };
          }
        }
        const cleaned = stripJsonFences(buffer);
        const parsed = MeetingRecordSchema.safeParse(JSON.parse(cleaned));
        if (!parsed.success) {
          await stream.writeSSE({ data: JSON.stringify({ error: 'Parse failed', raw: cleaned }), event: 'error' });
          return;
        }
        session.record = parsed.data;
        if (!session.chatHistory) session.chatHistory = [];
        session.chatHistory.push({ role: 'user', content: `[Extract from notes]` });
        session.chatHistory.push({ role: 'assistant', content: cleaned });
        session.updatedAt = new Date().toISOString();

        // Auto-create tasks from action_plan_next
        const actionItems = parsed.data.action_plan_next ?? [];
        if (actionItems.length > 0 && store.tasks) {
          const meetingRef = `Meeting ${parsed.data.No ?? session.id} — ${(parsed.data.date ?? '').slice(0, 10)}`;
          for (const item of actionItems) {
            const taskId = crypto.randomUUID();
            store.tasks.push({
              id: taskId,
              title: item,
              notes: '',
              completed: false,
              priority: 'none',
              dueDate: null,
              dueTime: null,
              list: 'مهام من الاجتماعات',
              tags: [],
              color: '',
              pinned: false,
              checklist: [],
              reminder: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              completedAt: null,
              origin: 'agent',
              metadata: { sourceRef: { meetingSessionId: session.id, meetingTitle: meetingRef } },
            } as TaskItem);
          }
        }

        saveStore();
        await stream.writeSSE({
          data: JSON.stringify({ record: parsed.data, usage }),
          event: 'message.done',
        });
      } catch (err) {
        await stream.writeSSE({ data: JSON.stringify({ error: String(err) }), event: 'error' });
      }
      await stream.writeSSE({ data: '[DONE]', event: 'done' });
    });
  });

  // ── Chat with the meetings agent (SSE) ─────────────────────────────
  app.post('/api/meetings/sessions/:id/chat', async (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json<{ message: string; language?: 'en' | 'ar' }>();
    if (!body.message) return c.json({ error: 'message required' }, 400);

    const language = body.language ?? getLanguage(store);
    const model = getDefaultModel(store);
    const provider = pickProviderForModel(model);
    if (!provider) return c.json({ error: `No provider for model "${model}"` }, 400);

    const systemPrompt = buildMeetingChatPrompt({
      voiceProfile: getVoiceProfile(store),
      language,
    });

    if (!session.chatHistory) session.chatHistory = [];
    const messages = [
      ...session.chatHistory.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user' as const, content: body.message },
    ];

    return streamSSE(c, async (stream) => {
      let reply = '';
      try {
        await stream.writeSSE({ data: JSON.stringify({ type: 'start' }), event: 'message.start' });
        for await (const chunk of provider.chat({ model, systemPrompt, messages })) {
          if (chunk.type === 'text') {
            reply += chunk.content;
            await stream.writeSSE({ data: JSON.stringify({ text: chunk.content }), event: 'message.delta' });
          }
        }
        // ── Parse inline edit commands ──────────────────────────────
        // %%UPDATE_DRAFT%%\n<content>\n%%END_DRAFT%%
        const draftMatch = reply.match(/%%UPDATE_DRAFT%%\r?\n([\s\S]*?)\r?\n%%END_DRAFT%%/);
        if (draftMatch) {
          session.draft = draftMatch[1];
        }
        // %%UPDATE_FIELD%%\n{"field":"...","value":"..."}\n%%END_FIELD%%
        const fieldMatch = reply.match(/%%UPDATE_FIELD%%\r?\n(\{[\s\S]*?\})\r?\n%%END_FIELD%%/);
        if (fieldMatch) {
          try {
            const payload = JSON.parse(fieldMatch[1]) as { field: string; value: unknown };
            if (payload.field && session.record) {
              (session.record as Record<string, unknown>)[payload.field] = payload.value;
            }
          } catch {
            // ignore malformed JSON in field block
          }
        }

        if (!session.chatHistory) session.chatHistory = [];
        session.chatHistory.push({ role: 'user', content: body.message });
        session.chatHistory.push({ role: 'assistant', content: reply });
        session.updatedAt = new Date().toISOString();
        saveStore();
        await stream.writeSSE({ data: JSON.stringify({ reply }), event: 'message.done' });
      } catch (err) {
        await stream.writeSSE({ data: JSON.stringify({ error: String(err) }), event: 'error' });
      }
      await stream.writeSSE({ data: '[DONE]', event: 'done' });
    });
  });

  // ── Save to Obsidian ────────────────────────────────────────────────
  app.post('/api/meetings/sessions/:id/save', async (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    if (!session.record) return c.json({ error: 'No meeting record yet. Run extract first.' }, 400);

    const r = session.record;

    // Auto-number: find highest existing meeting number
    let meetingNo = r.No;
    if (!meetingNo) {
      try {
        const paths = await listNotes({ subPath: '01 PhD/04 Supervision/Supervision Interaction Points' });
        const nums = paths.map((p) => {
          const m = p.match(/(\d+)\.md$/);
          return m ? Number(m[1]) : 0;
        });
        meetingNo = nums.length > 0 ? Math.max(...nums) + 1 : 1;
      } catch {
        meetingNo = 1;
      }
    }

    const notePath = `01 PhD/04 Supervision/Supervision Interaction Points/${meetingNo}.md`;

    // Build the note using the Obsidian template format
    const fields = {
      type: 'supervision-meeting',
      'No.': meetingNo,
      date: r.date ?? '',
      Location: r.Location ?? '',
      Summary: r.Summary,
      Attendees: r.Attendees,
      GRS2_Input: r.GRS2_Input ?? '',
      GRS2_Respond: r.GRS2_Respond ?? '',
      GRS2_confirmed: r.GRS2_confirmed,
      Next_Meeting: r.Next_Meeting ?? '',
      Next_Location: r.Next_Location ?? '',
      related: null,
    };
    const keyOrder = ['type', 'No.', 'date', 'Location', 'Summary', 'Attendees',
      'GRS2_Input', 'GRS2_Respond', 'GRS2_confirmed', 'Next_Meeting', 'Next_Location', 'related'];

    const lines: string[] = [
      '---',
      writeFrontmatter(fields, keyOrder),
      '---',
      '',
      '> [[🏠 Home]] → 🎓 [[PhD Dashboard]] → 📊 [[Supervision Dashboard]]',
      '',
      '## 🎯 Action Plan From Last Meeting',
      '',
    ];
    if (r.action_plan_previous.length > 0) {
      for (const item of r.action_plan_previous) lines.push(`- [ ] ${item}`);
    } else {
      lines.push('N/A');
    }
    lines.push('', '## 📋 Meeting Notes', '', '### Agenda:', '');
    for (const item of r.agenda) lines.push(`- [ ] ${item}`);
    lines.push('', '### Discussion & Feedback', '');
    lines.push(r.discussion);
    lines.push('', `_Next meeting: ${r.Next_Meeting ?? 'TBD'}_`, '');
    lines.push('---', '', '## 🎯 Action Plan Until Next Meeting', '');
    for (const item of r.action_plan_next) lines.push(`- [ ] ${item}`);
    if (r.arabic_summary.length > 0) {
      lines.push('', '## 📌 ملخص', '');
      for (const b of r.arabic_summary) lines.push(`- ${b}`);
    }
    lines.push('', '---', '', '## 🔗 Related', '', '%%', '[[MOC - Supervision Interaction Points]]', '%%');

    const markdown = lines.join('\n');
    await writeNoteRaw(notePath, markdown);

    session.obsidianPath = notePath;
    session.record.No = meetingNo;
    session.updatedAt = new Date().toISOString();
    saveStore();

    return c.json({ ok: true, path: notePath, meetingNo });
  });

  // ── Extract tasks from draft checkboxes ────────────────────────────
  app.post('/api/meetings/sessions/:id/extract-tasks', (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);

    const draft = session.draft ?? '';
    const checkboxRe = /^[ \t]*-\s+\[\s*\]\s+(.+)$/gm;
    const extracted: TaskItem[] = [];
    let match: RegExpExecArray | null;

    if (!store.tasks) store.tasks = [];

    while ((match = checkboxRe.exec(draft)) !== null) {
      const title = match[1].trim();
      const now = new Date().toISOString();
      const task: TaskItem = {
        id: crypto.randomUUID(),
        title,
        notes: '',
        completed: false,
        priority: 'none',
        dueDate: null,
        dueTime: null,
        list: 'مهام من الاجتماعات',
        tags: [],
        color: '',
        pinned: false,
        checklist: [],
        reminder: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        metadata: {
          sourceRef: {
            meetingSessionId: session.id,
            meetingTitle: session.title,
          },
        },
      };
      store.tasks.push(task);
      extracted.push(task);
    }

    if (extracted.length > 0) saveStore();

    return c.json({ extracted: extracted.length, tasks: extracted });
  });

  // ── Get tasks linked to a session ──────────────────────────────────
  app.get('/api/meetings/sessions/:id/tasks', (c) => {
    const store = getStore();
    const session = findSession(store, c.req.param('id'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    const tasks = (store.tasks ?? []).filter((t) => {
      const meta = t.metadata as { sourceRef?: { meetingSessionId?: string } } | undefined;
      return meta?.sourceRef?.meetingSessionId === session.id;
    });
    return c.json(tasks);
  });

  // ── Delete session ──────────────────────────────────────────────────
  app.delete('/api/meetings/sessions/:id', (c) => {
    const store = getStore();
    const sessions = getMeetingSessions(store);
    const idx = sessions.findIndex((s) => s.id === c.req.param('id'));
    if (idx === -1) return c.json({ error: 'Not found' }, 404);
    sessions.splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });
}
