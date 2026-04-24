/**
 * chat.ts tool_use wiring (AGT-05 live) — REL-01 stage 2d.
 *
 * The SSE handler itself still lives inline in index.ts, so we can't import
 * it directly. Instead, this test recreates the handler's tool_use branch
 * verbatim — provider stream yields a `tool_use` chunk → the handler calls
 * `specialistsDispatch` → we emit a `tool_result` SSE event.
 *
 * If the inline handler changes shape, this test will drift. When the route
 * is finally extracted to `routes/chat.ts` the test can import the real
 * handler.
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatch as specialistsDispatch } from '../services/agents/specialists.js';
import type { UnifiedProvider } from '../services/llm/index.js';

/** Provider that emits exactly one tool_use chunk, then done. */
function makeManagerProvider() {
  const mock: UnifiedProvider = {
    name: 'anthropic',
    chat: vi.fn(async function* () {
      yield {
        type: 'tool_use' as const,
        id: 'toolu_01TEST',
        name: 'delegate_to_specialist',
        input: { specialist: 'الباحث', task: 'ابحث عن BIM', context: 'PhD' },
      };
      yield { type: 'usage' as const, usage: { inputTokens: 42, outputTokens: 7, cachedTokens: 0 } };
      yield { type: 'done' as const };
    }),
    estimateCost: () => 0.0002,
  };
  return mock;
}

/** Provider the dispatched specialist will be invoked against. */
function makeSpecialistProvider() {
  const mock: UnifiedProvider = {
    name: 'anthropic',
    chat: vi.fn(async function* () {
      yield { type: 'text' as const, content: 'تم' };
      yield { type: 'text' as const, content: ' البحث' };
      yield { type: 'usage' as const, usage: { inputTokens: 10, outputTokens: 3, cachedTokens: 0 } };
      yield { type: 'done' as const };
    }),
    estimateCost: () => 0.0001,
  };
  return mock;
}

describe('chat.ts tool_use SSE wiring (AGT-05 live)', () => {
  it('dispatches when manager provider emits a delegate_to_specialist tool_use and emits tool_result', async () => {
    const managerProvider = makeManagerProvider();
    const specialistProvider = makeSpecialistProvider();
    const sseEvents: Array<{ event: string; data: unknown }> = [];

    // Replicate the handler's tool_use branch.
    let toolUseDispatched = false;
    for await (const chunk of managerProvider.chat({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'ابحث عن BIM' }],
      systemPrompt: 'manager',
      tools: [{ name: 'delegate_to_specialist', description: 'test', input_schema: { type: 'object', properties: {} } }],
    })) {
      if (chunk.type === 'tool_use') {
        const inp = chunk.input as { specialist?: string; task?: string; context?: string };
        if (chunk.name === 'delegate_to_specialist' && inp.specialist && inp.task) {
          toolUseDispatched = true;
          const result = await specialistsDispatch({
            specialist: inp.specialist,
            task: inp.task,
            context: inp.context,
            deps: { provider: specialistProvider, model: 'claude-sonnet-4-6' },
          });
          sseEvents.push({
            event: 'tool_result',
            data: {
              toolUseId: chunk.id,
              name: chunk.name,
              specialist: inp.specialist,
              output: result.output,
              usage: result.usage,
              durationMs: result.durationMs,
            },
          });
        }
      }
    }

    expect(toolUseDispatched).toBe(true);
    expect(specialistProvider.chat).toHaveBeenCalledTimes(1);
    expect(sseEvents).toHaveLength(1);
    expect(sseEvents[0].event).toBe('tool_result');
    const payload = sseEvents[0].data as { specialist: string; output: string; toolUseId: string };
    expect(payload.toolUseId).toBe('toolu_01TEST');
    expect(payload.specialist).toBe('الباحث');
    expect(payload.output).toBe('تم البحث');
  });

  it('threads prior specialist outputs across sequential delegations in the same turn (Phase 1)', async () => {
    // Manager emits TWO tool_use blocks in sequence: delegate to الباحث then to المُلخِّص.
    const managerProvider: UnifiedProvider = {
      name: 'anthropic',
      chat: vi.fn(async function* () {
        yield {
          type: 'tool_use' as const,
          id: 'toolu_abdan',
          name: 'delegate_to_specialist',
          input: { specialist: 'الباحث', task: 'ابحث في BIM' },
        };
        yield {
          type: 'tool_use' as const,
          id: 'toolu_shwasha',
          name: 'delegate_to_specialist',
          input: { specialist: 'المُلخِّص', task: 'لخّص ما قاله الباحث' },
        };
        yield { type: 'done' as const };
      }),
      estimateCost: () => 0,
    };
    // Track what specialists see.
    const abdanProvider: UnifiedProvider = {
      name: 'anthropic',
      chat: vi.fn(async function* () {
        yield { type: 'text' as const, content: 'الباحث يقول: السلام عليكم' };
        yield { type: 'usage' as const, usage: { inputTokens: 5, outputTokens: 2, cachedTokens: 0 } };
        yield { type: 'done' as const };
      }),
      estimateCost: () => 0,
    };
    const shwashaProvider: UnifiedProvider = {
      name: 'anthropic',
      chat: vi.fn(async function* () {
        yield { type: 'text' as const, content: 'المُلخِّص: ملخّص' };
        yield { type: 'usage' as const, usage: { inputTokens: 5, outputTokens: 2, cachedTokens: 0 } };
        yield { type: 'done' as const };
      }),
      estimateCost: () => 0,
    };

    const dispatchCalls: Array<{ specialist: string; priorMessages: unknown; roundNumber: number | undefined }> = [];
    const turnPriorMessages: Array<{ role: 'assistant' | 'user'; content: string; agent?: string; agentDisplay?: string }> = [];
    let roundCounter = 0;

    for await (const chunk of managerProvider.chat({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'help' }],
      systemPrompt: 'manager',
    })) {
      if (chunk.type === 'tool_use') {
        const inp = chunk.input as { specialist: string; task: string; pass_prior_context?: boolean };
        roundCounter += 1;
        const passPrior = inp.pass_prior_context !== false;
        const priorForCall = passPrior ? [...turnPriorMessages] : [];
        dispatchCalls.push({
          specialist: inp.specialist,
          priorMessages: priorForCall,
          roundNumber: roundCounter,
        });
        const provider = inp.specialist === 'الباحث' ? abdanProvider : shwashaProvider;
        const result = await specialistsDispatch({
          specialist: inp.specialist,
          task: inp.task,
          priorMessages: priorForCall,
          roundNumber: roundCounter,
          deps: { provider, model: 'claude-sonnet-4-6' },
        });
        turnPriorMessages.push({
          role: 'assistant',
          content: result.output,
          agent: inp.specialist,
          agentDisplay: inp.specialist,
        });
      }
    }

    expect(dispatchCalls).toHaveLength(2);
    // Round 1 — الباحث: no prior rounds yet.
    expect(dispatchCalls[0].specialist).toBe('الباحث');
    expect(dispatchCalls[0].roundNumber).toBe(1);
    expect(dispatchCalls[0].priorMessages).toEqual([]);
    // Round 2 — المُلخِّص: sees الباحث's output.
    expect(dispatchCalls[1].specialist).toBe('المُلخِّص');
    expect(dispatchCalls[1].roundNumber).toBe(2);
    const round2Prior = dispatchCalls[1].priorMessages as Array<{ role: string; content: string; agent?: string }>;
    expect(round2Prior).toHaveLength(1);
    expect(round2Prior[0].role).toBe('assistant');
    expect(round2Prior[0].agent).toBe('الباحث');
    expect(round2Prior[0].content).toContain('الباحث يقول');
  });

  it('leaves toolUseDispatched=false when the provider never emits a tool_use chunk', async () => {
    const plainProvider: UnifiedProvider = {
      name: 'anthropic',
      chat: vi.fn(async function* () {
        yield { type: 'text' as const, content: 'أحلتها لالباحث ✓' };
        yield { type: 'done' as const };
      }),
      estimateCost: () => 0,
    };

    let toolUseDispatched = false;
    for await (const chunk of plainProvider.chat({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'q' }],
    })) {
      if (chunk.type === 'tool_use') toolUseDispatched = true;
    }

    expect(toolUseDispatched).toBe(false);
  });
});
