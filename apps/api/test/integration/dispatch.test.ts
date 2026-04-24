import { describe, it, expect, vi } from 'vitest';
import { dispatchHierarchical } from '../../src/services/dispatch/index.js';
import type { DispatcherLLM } from '../../src/services/dispatch/index.js';
import type { OrgResolved } from '../../src/prompts/hierarchy.js';

const ORG: OrgResolved = {
  ceo: { id: 'manager', nameAr: 'الراعي', nameEn: "Al-Ra'i" },
  departments: [
    {
      id: 'research',
      labelAr: 'البحث', labelEn: 'Research',
      manager: { id: 'research', nameAr: 'الباحث', nameEn: 'Abdan' },
      workers: [
        { id: 'reading-helper', nameAr: 'المُلخِّص', nameEn: 'Shwasha' },
        { id: 'comparator', nameAr: 'المُقارِن', nameEn: 'Rammana' },
      ],
    },
    {
      id: 'writing',
      labelAr: 'الكتابة', labelEn: 'Writing',
      manager: { id: 'writing-critic', nameAr: 'الناقد', nameEn: 'Al-Safra' },
      workers: [
        { id: 'sayyaq', nameAr: 'السيّاق', nameEn: 'Al-Sayyaq' },
      ],
    },
  ],
};

function mockLLM(responses: Array<{ text: string; tokensIn?: number; tokensOut?: number; costUsd?: number }>): DispatcherLLM {
  let i = 0;
  return {
    callSystemMessage: vi.fn(async () => {
      const r = responses[i] ?? { text: '' };
      i += 1;
      return {
        text: r.text,
        tokensIn: r.tokensIn ?? 10,
        tokensOut: r.tokensOut ?? 20,
        costUsd: r.costUsd ?? 0.001,
      };
    }),
  };
}

function mockFailingLLMAt(idx: number, responses: string[]): DispatcherLLM {
  let i = 0;
  return {
    callSystemMessage: vi.fn(async () => {
      const thisCall = i;
      i += 1;
      if (thisCall === idx) throw new Error('mock worker failure');
      return { text: responses[thisCall] ?? '', tokensIn: 10, tokensOut: 20, costUsd: 0.001 };
    }),
  };
}

describe('hierarchical dispatcher', () => {
  const baseDeps = {
    loadOrg: async () => ORG,
    getLimits: () => ({ hierarchicalDispatchUsd: 0.5, dispatchMaxFanout: 3 }),
    auditLog: vi.fn(),
  };

  it('routes user → CEO → dept → workers → synthesized', async () => {
    const llm = mockLLM([
      { text: '{"department":"research","reason":"research task"}' },
      { text: '{"workers":["reading-helper","comparator"]}' },
      { text: 'worker 1 output' },
      { text: 'worker 2 output' },
      { text: 'final synthesized reply' },
    ]);
    const r = await dispatchHierarchical(
      { dispatchId: 'd1', userMessage: 'help', language: 'en' },
      { ...baseDeps, llm },
    );
    expect(r.finalText).toBe('final synthesized reply');
    expect(r.chain.length).toBeGreaterThanOrEqual(4); // ceo + manager + >=2 workers + synthesis
    expect(r.chain.some((c) => c.role === 'ceo' && c.agentId === 'manager')).toBe(true);
    expect(r.chain.some((c) => c.role === 'worker' && c.agentId === 'reading-helper')).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('direct_answer path skips workers', async () => {
    const llm = mockLLM([
      { text: '{"department":"research","reason":"simple"}' },
      { text: '{"workers":[],"direct_answer":"it\'s 42"}' },
    ]);
    const r = await dispatchHierarchical(
      { dispatchId: 'd2', userMessage: 'hi', language: 'en' },
      { ...baseDeps, llm },
    );
    expect(r.finalText).toBe("it's 42");
    expect(r.chain.every((c) => c.role !== 'worker')).toBe(true);
  });

  it('survives single worker failure', async () => {
    // call 0: ceo, 1: manager, 2: worker #1 (will FAIL), 3: worker #2, 4: synthesis
    const llm: DispatcherLLM = {
      callSystemMessage: vi.fn(async (system: string) => {
        if (system.includes('CEO') || system.includes('الراعي') || system.includes("Al-Ra'i")) {
          return { text: '{"department":"research","reason":"x"}', tokensIn: 10, tokensOut: 20, costUsd: 0.001 };
        }
        if (system.includes('manager of') || system.includes('مدير')) {
          // first manager call selects workers; second synthesizes
          const mock = llm.callSystemMessage as unknown as { mock: { calls: unknown[] } };
          const callsSoFar = mock.mock.calls.length;
          if (callsSoFar === 2) {
            return { text: '{"workers":["reading-helper","comparator"]}', tokensIn: 10, tokensOut: 20, costUsd: 0.001 };
          }
          return { text: 'synth', tokensIn: 10, tokensOut: 20, costUsd: 0.001 };
        }
        // Worker path — fail the first one called.
        if (system.includes('reading-helper')) throw new Error('worker down');
        return { text: 'worker ok', tokensIn: 10, tokensOut: 20, costUsd: 0.001 };
      }),
    };
    const r = await dispatchHierarchical(
      { dispatchId: 'd3', userMessage: 'help', language: 'en' },
      { ...baseDeps, llm },
    );
    expect(r.errors.some((e) => e.step === 'worker-invocation')).toBe(true);
    expect(r.finalText.length).toBeGreaterThan(0);
    expect(r.finalText).not.toMatch(/fabricated|hallucin/i);
  });

  it('returns fallback when all workers fail', async () => {
    const llm: DispatcherLLM = {
      callSystemMessage: vi.fn(async (system: string) => {
        if (system.includes("Al-Ra'i") || system.includes('الراعي') || system.includes('CEO')) {
          return { text: '{"department":"research","reason":"x"}', tokensIn: 10, tokensOut: 20, costUsd: 0.001 };
        }
        if (system.includes('manager of') || system.includes('مدير')) {
          return { text: '{"workers":["reading-helper"]}', tokensIn: 10, tokensOut: 20, costUsd: 0.001 };
        }
        throw new Error('all workers dead');
      }),
    };
    const r = await dispatchHierarchical(
      { dispatchId: 'd4', userMessage: 'help', language: 'en' },
      { ...baseDeps, llm },
    );
    expect(r.finalText).toMatch(/don't know|لا أعرف/i);
    expect(r.errors.some((e) => e.step === 'worker-invocation')).toBe(true);
  });

  it('returns graceful fallback when org is missing', async () => {
    const r = await dispatchHierarchical(
      { dispatchId: 'd5', userMessage: 'help', language: 'en' },
      { ...baseDeps, loadOrg: async () => null, llm: mockLLM([]) },
    );
    expect(r.finalText).toMatch(/don't know|لا أعرف/i);
  });

  it('respects budget cap — synthesizes naively when exhausted mid-flight', async () => {
    // Budget very low so the synthesis step is past-cap.
    const llm = mockLLM([
      { text: '{"department":"research","reason":"x"}', costUsd: 0.2 },
      { text: '{"workers":["reading-helper"]}', costUsd: 0.2 },
      { text: 'worker out', costUsd: 0.2 }, // this alone would push us over
    ]);
    const r = await dispatchHierarchical(
      { dispatchId: 'd6', userMessage: 'help', language: 'en', budgetUsd: 0.5 },
      { ...baseDeps, llm },
    );
    expect(r.budgetCapped).toBe(true);
    expect(r.finalText).toMatch(/worker out/); // graceful degrade: raw worker output
  });
});
