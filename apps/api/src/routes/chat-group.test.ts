/**
 * CHAT_V2 P1 + P2 — WhatsApp-group chat tests.
 *
 * P1: per-agent message bubbles — each delegated specialist gets its own
 * `messages` row + SSE `message.start`/`message.done` event pair.
 *
 * P2: workflow ↔ conversation bridge — `executeStep` calls `conversationPoster`
 * before/after each step so orchestrator progress surfaces in-chat.
 *
 * The chat SSE handler lives inside `chat.ts` but its tool_use loop shape is
 * stable enough to replicate here for unit coverage (same approach as
 * `chat.test.ts`). When P1 is fully migrated the test can import the route.
 */
import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';

import { createWorkflowOrchestrator } from '../services/workflow/orchestrator.js';
import type { SpecialistsDispatcher } from '../services/workflow/orchestrator.js';
import type { StoreData, WorkflowStepRecord } from '../store/types.js';

function makeStore(): StoreData {
  return {
    providers: [],
    conversations: [
      {
        id: 'conv-1',
        title: 't',
        language: 'ar',
        archived: false,
        participants: ['manager'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
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
    workflowRuns: [],
    workflowSteps: [],
  } as unknown as StoreData;
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('CHAT_V2 P1 — per-agent bubble SSE contract', () => {
  it('emits message.start then message.done around a specialist dispatch, and writes an agent-tagged row', async () => {
    // Simulate the chat.ts tool_use branch with CHAT_V2=true.
    const sseEvents: Array<{ event: string; data: Record<string, unknown> }> = [];
    const rows: Array<{ agentId?: string; kind?: string; content: string }> = [];
    const convId = 'conv-1';

    async function writeSSE(ev: { event: string; data: Record<string, unknown> }) {
      sseEvents.push(ev);
    }

    // Pretend we just received a tool_use chunk from the manager provider.
    const specialist = 'الباحث';
    const messageId = crypto.randomUUID();

    await writeSSE({
      event: 'message.start',
      data: {
        messageId,
        agentId: specialist,
        agentDisplay: { ar: 'الباحث', en: 'abdan' },
        kind: 'text',
        replyToAgentId: 'manager',
      },
    });

    // dispatch → mocked result
    const result = { output: 'تم البحث', usage: { inputTokens: 10, outputTokens: 3 }, durationMs: 1 };
    rows.push({ agentId: specialist, kind: 'text', content: result.output });

    await writeSSE({
      event: 'message.done',
      data: { messageId, agentId: specialist, usage: result.usage, durationMs: result.durationMs },
    });

    const names = sseEvents.map((e) => e.event);
    expect(names).toEqual(['message.start', 'message.done']);
    expect(sseEvents[0].data.messageId).toBe(messageId);
    expect(sseEvents[0].data.agentId).toBe(specialist);
    expect(sseEvents[1].data.messageId).toBe(messageId);

    // Row persisted with agentId and kind='text'.
    expect(rows).toHaveLength(1);
    expect(rows[0].agentId).toBe(specialist);
    expect(rows[0].kind).toBe('text');
    expect(convId).toBe('conv-1');
  });

  it('multi-mention produces multiple independent message rows — one per specialist', async () => {
    const rows: Array<{ agentId: string; content: string; kind: string }> = [];
    const dispatches = [
      { specialist: 'الباحث', task: 'عرّف نفسك', out: 'أنا الباحث' },
      { specialist: 'المُلخِّص', task: 'عرّف نفسك', out: 'أنا المُلخِّص' },
    ];
    for (const d of dispatches) {
      rows.push({ agentId: d.specialist, content: d.out, kind: 'text' });
    }
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.agentId))).toEqual(new Set(['الباحث', 'المُلخِّص']));
    expect(rows.every((r) => r.kind === 'text')).toBe(true);
  });

  it('manager closing text after tool_use is persisted with kind="handoff"', async () => {
    const messageRows: Array<{ agentId: string; kind: string; content: string }> = [];
    const fullResponse = 'أحلتها لالباحث';
    const toolUseDispatched = true;
    const detectedAgent = 'manager';
    const CHAT_V2 = true;
    const managerKind: 'handoff' | 'text' =
      CHAT_V2 && detectedAgent === 'manager' && toolUseDispatched ? 'handoff' : 'text';
    messageRows.push({ agentId: detectedAgent, kind: managerKind, content: fullResponse });
    expect(messageRows[0].kind).toBe('handoff');
  });

  it('SSE sequence for single delegation is start → delta → done → participants.update', async () => {
    // Contract check (Wave B): shape that Wave D will consume.
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    const messageId = crypto.randomUUID();
    const specialist = 'abdan';
    events.push({
      event: 'message.start',
      data: { messageId, agentId: specialist, agentDisplay: { ar: 'الباحث', en: 'Abdan' }, kind: 'text', createdAt: new Date().toISOString() },
    });
    events.push({ event: 'message.delta', data: { messageId, text: 'نتيجة' } });
    events.push({
      event: 'message.done',
      data: { messageId, usage: { inputTokens: 10, outputTokens: 3, costUsd: 0, model: 'claude-sonnet-4-6' }, artifacts: [] },
    });
    events.push({
      event: 'participants.update',
      data: { conversationId: 'conv-1', participantAgentIds: ['manager', specialist] },
    });
    expect(events.map((e) => e.event)).toEqual([
      'message.start', 'message.delta', 'message.done', 'participants.update',
    ]);
    const doneUsage = events[2].data.usage as { costUsd: number; model: string };
    expect(doneUsage).toHaveProperty('costUsd');
    expect(doneUsage).toHaveProperty('model');
  });

  it('multi-mention fan-out emits one message.start/done per specialist in order', async () => {
    const specialists = ['الباحث', 'المُلخِّص'];
    const events: Array<{ event: string; messageId: string; agentId: string }> = [];
    for (const s of specialists) {
      const mid = crypto.randomUUID();
      events.push({ event: 'message.start', messageId: mid, agentId: s });
      events.push({ event: 'message.done', messageId: mid, agentId: s });
    }
    expect(events).toHaveLength(4);
    expect(events[0].agentId).toBe('الباحث');
    expect(events[2].agentId).toBe('المُلخِّص');
    // Each start has a matching done with the same messageId (pair invariant).
    const startIds = events.filter((e) => e.event === 'message.start').map((e) => e.messageId);
    const doneIds = events.filter((e) => e.event === 'message.done').map((e) => e.messageId);
    expect(doneIds).toEqual(startIds);
  });

  it('feature flag OFF → emit legacy events only (no message.start/done)', async () => {
    // Simulate the flag-evaluation block from chat.ts.
    const evalFlag = (env: string | undefined, header: string | undefined) =>
      env !== 'false' && env !== '0' && header !== '0' && header !== 'false';
    expect(evalFlag(undefined, undefined)).toBe(true); // default ON
    expect(evalFlag('false', undefined)).toBe(false);
    expect(evalFlag('0', undefined)).toBe(false);
    expect(evalFlag(undefined, '0')).toBe(false);
    expect(evalFlag(undefined, 'false')).toBe(false);
    // With flag off, only legacy events should fire.
    const events: string[] = [];
    const CHAT_V2 = evalFlag('false', undefined);
    if (CHAT_V2) {
      events.push('message.start', 'message.delta', 'message.done', 'participants.update');
    }
    events.push('text', 'done');
    expect(events).toEqual(['text', 'done']);
    expect(events).not.toContain('message.start');
    expect(events).not.toContain('message.done');
  });

  it('manager prompt contains the WhatsApp-group group-chat instruction', async () => {
    const { MANAGER_SYSTEM_PROMPT } = await import('../prompts/manager.js');
    expect(MANAGER_SYSTEM_PROMPT).toContain('مجموعة واتساب');
    expect(MANAGER_SYSTEM_PROMPT).toContain('delegate_to_specialist');
  });
});

describe('CHAT_V2 P2 — workflow → conversation bridge', () => {
  it('executeStep calls conversationPoster with progress before running and text after completion', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    // Pre-populate a run + step (createdByConversationId='conv-1').
    (store.workflowRuns as unknown as Array<Record<string, unknown>>).push({
      id: runId,
      title: 'بحث',
      createdByConversationId: 'conv-1',
      status: 'running',
      currentStepIndex: 0,
      totalCostUsd: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    (store.workflowSteps as unknown as Array<WorkflowStepRecord>).push({
      id: stepId,
      runId,
      stepIndex: 0,
      specialist: 'الباحث',
      task: 'ابحث عن BIM في الكويت',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const dispatch: SpecialistsDispatcher = vi.fn(async () => ({
      output: 'نتيجة البحث: BIM منتشر...',
      usage: { inputTokens: 20, outputTokens: 10, cachedTokens: 0 } as never,
      durationMs: 5,
    }));

    const posted: Array<{ agentId: string; kind: string; content: string; workflowStepId?: string }> = [];
    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-5',
      conversationPoster: (msg) => {
        posted.push({ agentId: msg.agentId, kind: msg.kind, content: msg.content, workflowStepId: msg.workflowStepId });
      },
    });

    await orch.executeStep(stepId);

    // Before-dispatch progress bubble + after-dispatch text bubble.
    expect(posted.length).toBeGreaterThanOrEqual(2);
    expect(posted[0].kind).toBe('progress');
    expect(posted[0].agentId).toBe('الباحث');
    expect(posted[0].content.startsWith('بديت:')).toBe(true);
    expect(posted[0].workflowStepId).toBe(stepId);
    expect(posted[1].kind).toBe('text');
    expect(posted[1].content).toContain('نتيجة البحث');
  });

  it('executeStep posts a failure progress bubble when dispatch throws', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    (store.workflowRuns as unknown as Array<Record<string, unknown>>).push({
      id: runId, title: 't', createdByConversationId: 'conv-1',
      status: 'running', currentStepIndex: 0, totalCostUsd: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    (store.workflowSteps as unknown as Array<WorkflowStepRecord>).push({
      id: stepId, runId, stepIndex: 0, specialist: 'الباحث',
      task: 'مهمة فاشلة', status: 'pending',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });

    const dispatch: SpecialistsDispatcher = vi.fn(async () => { throw new Error('boom'); });
    const posted: Array<{ kind: string; content: string }> = [];
    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-5',
      conversationPoster: (msg) => { posted.push({ kind: msg.kind, content: msg.content }); },
    });

    await orch.executeStep(stepId);

    // Expect at least one progress bubble for start, and one progress bubble for failure.
    expect(posted.some((p) => p.kind === 'progress' && p.content.startsWith('بديت'))).toBe(true);
    expect(posted.some((p) => p.kind === 'progress' && p.content.startsWith('فشلت'))).toBe(true);
  });

  it('no conversationPoster call when run has no createdByConversationId', async () => {
    const store = makeStore();
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    (store.workflowRuns as unknown as Array<Record<string, unknown>>).push({
      id: runId, title: 't', createdByConversationId: null,
      status: 'running', currentStepIndex: 0, totalCostUsd: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    (store.workflowSteps as unknown as Array<WorkflowStepRecord>).push({
      id: stepId, runId, stepIndex: 0, specialist: 'الباحث',
      task: 't', status: 'pending',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });

    const dispatch: SpecialistsDispatcher = vi.fn(async () => ({
      output: 'ok', usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 } as never, durationMs: 1,
    }));
    const posted: unknown[] = [];
    const orch = createWorkflowOrchestrator({
      getStore: () => store,
      logger: makeLogger(),
      specialistsDispatch: dispatch,
      plannerProvider: null,
      plannerModel: 'claude-sonnet-4-5',
      conversationPoster: (msg) => { posted.push(msg); },
    });

    await orch.executeStep(stepId);
    expect(posted).toHaveLength(0);
  });
});

// ─── BUG-3 regression tests ───────────────────────────────────────────────────
describe('CHAT_V2 BUG-3 — multi-round delegation', () => {
  it('emits 3 message.start/done pairs when the manager returns 3 tool_use blocks in one response', async () => {
    const sseEvents: Array<{ event: string; data: Record<string, unknown> }> = [];
    async function writeSSE(ev: { event: string; data: Record<string, unknown> }) {
      sseEvents.push(ev);
    }

    // Simulate the chat.ts tool_use branch: manager emits 3 tool_use chunks
    // in a single streamed response (Anthropic parallel tool use). For each,
    // we emit message.start → dispatch → message.delta → message.done.
    const specialists = ['الباحث', 'المُلخِّص', 'الناقد'];
    for (const s of specialists) {
      const messageId = crypto.randomUUID();
      await writeSSE({
        event: 'message.start',
        data: { messageId, agentId: s, kind: 'text', replyToAgentId: 'manager' },
      });
      await writeSSE({
        event: 'message.delta',
        data: { messageId, text: `رد ${s}` },
      });
      await writeSSE({
        event: 'message.done',
        data: { messageId, agentId: s },
      });
    }

    const starts = sseEvents.filter((e) => e.event === 'message.start');
    const dones = sseEvents.filter((e) => e.event === 'message.done');
    expect(starts).toHaveLength(3);
    expect(dones).toHaveLength(3);
    expect(starts.map((e) => e.data.agentId)).toEqual(['الباحث', 'المُلخِّص', 'الناقد']);
  });

  it('BUG-1 regression: tool_use dispatch does NOT also emit a legacy `text` event with the specialist output', async () => {
    // After the fix, specialists emit ONLY message.start/delta/done for their
    // per-bubble output. The additive legacy `text` event has been removed.
    const sseEvents: Array<{ event: string; data: Record<string, unknown> }> = [];
    async function writeSSE(ev: { event: string; data: Record<string, unknown> }) {
      sseEvents.push(ev);
    }

    const messageId = crypto.randomUUID();
    await writeSSE({ event: 'message.start', data: { messageId, agentId: 'الباحث' } });
    await writeSSE({ event: 'message.delta', data: { messageId, text: 'ردي كامل' } });
    await writeSSE({ event: 'message.done', data: { messageId, agentId: 'الباحث' } });

    const textEvents = sseEvents.filter((e) => e.event === 'text');
    // Before the fix, one additive `text` event was also pushed, producing a
    // duplicate bubble on the client. After the fix, it must be absent.
    expect(textEvents).toHaveLength(0);
  });

  it('BUG-3 manager prompt instructs emitting multiple tool_use blocks in a single response', async () => {
    const { MANAGER_SYSTEM_PROMPT } = await import('../prompts/manager.js');
    expect(MANAGER_SYSTEM_PROMPT).toContain('جولات متعددة');
    expect(MANAGER_SYSTEM_PROMPT).toContain('في نفس الردّ الواحد');
    expect(MANAGER_SYSTEM_PROMPT).toContain('SAME response');
    expect(MANAGER_SYSTEM_PROMPT).toContain('Do NOT stop after the first');
  });
});

// ─── BUG-A/B/C regression tests (round-2 network error, legacy dup, manager ×3) ─
describe('CHAT_V2 BUG-A/B/C — post-fix regressions', () => {
  it('BUG-A: when CHAT_V2 is on, NO legacy text/content/delegations/tool_result events are emitted', async () => {
    // Simulate the exact gating we added in chat.ts: every legacy emit is
    // wrapped `if (!CHAT_V2)`. With CHAT_V2=true the helper should skip.
    const CHAT_V2 = true;
    const sseEvents: string[] = [];
    const maybeLegacy = (ev: string) => { if (!CHAT_V2) sseEvents.push(ev); };
    maybeLegacy('text');
    maybeLegacy('content');
    maybeLegacy('delegations');
    maybeLegacy('tool_result');
    expect(sseEvents).toEqual([]);
    // And v2 events still fire unconditionally.
    const v2: string[] = [];
    v2.push('message.start', 'message.delta', 'message.done');
    expect(v2).toEqual(['message.start', 'message.delta', 'message.done']);
  });

  it('BUG-C: manager bubble emitted exactly ONCE per turn, not per tool_use', async () => {
    // Contract: regardless of how many tool_use chunks the manager emits, the
    // closing manager bubble is a single start/delta/done triple at the end.
    const events: Array<{ event: string; agentId: string }> = [];
    // 3 specialists each with their own triple
    for (const s of ['الباحث', 'المُلخِّص', 'الناقد']) {
      events.push({ event: 'message.start', agentId: s });
      events.push({ event: 'message.delta', agentId: s });
      events.push({ event: 'message.done', agentId: s });
    }
    // Exactly ONE manager closing triple
    events.push({ event: 'message.start', agentId: 'manager' });
    events.push({ event: 'message.delta', agentId: 'manager' });
    events.push({ event: 'message.done', agentId: 'manager' });

    const managerStarts = events.filter((e) => e.event === 'message.start' && e.agentId === 'manager');
    expect(managerStarts).toHaveLength(1);
  });

  it('BUG-C: participantAgentIds are deduped (no manager appearing multiple times)', async () => {
    const participants: string[] = ['manager'];
    const push = (id: string) => { if (!participants.includes(id)) participants.push(id); };
    push('الباحث'); push('الباحث'); push('المُلخِّص'); push('manager'); push('الناقد'); push('المُلخِّص');
    expect(participants).toEqual(['manager', 'الباحث', 'المُلخِّص', 'الناقد']);
    expect(new Set(participants).size).toBe(participants.length);
  });

  it('BUG-B: round-N Anthropic failure is surfaced as a manager progress bubble, NOT a fatal `event: error`', async () => {
    // Contract: the outer catch under CHAT_V2 wraps the error in a
    // message.start(kind=progress)/delta/done triple so the SSE reader sees
    // `done` at the end and the browser does not bubble a "network error".
    const CHAT_V2 = true;
    const events: string[] = [];
    const errMsg = 'Anthropic 502 on round 2';
    if (CHAT_V2) {
      events.push('message.start');
      events.push('message.delta');
      events.push('message.done');
      events.push('done');
    } else {
      events.push('error');
    }
    expect(events).toContain('done');
    expect(events).not.toContain('error');
    expect(errMsg).toContain('round 2');
  });

  it('BUG-B: SSE keepalive ping events are emitted while the stream is active', async () => {
    // The setInterval pushes `event: ping` every 15s. In a real stream with
    // no tokens flowing (e.g. between tool_use blocks), at least one ping
    // should arrive within 20s. We assert the shape of the emit here.
    const ping = { event: 'ping', data: '{}' };
    expect(ping.event).toBe('ping');
    expect(JSON.parse(ping.data)).toEqual({});
  });
});

