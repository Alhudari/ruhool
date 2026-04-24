/**
 * Tests for the specialists dispatcher (REL-01 stage 2b).
 *
 * The LLM provider is mocked so we can assert:
 *   1. Passing `'عبدان'` pulls in `RESEARCH_SYSTEM_PROMPT` (the prompt exported
 *      from `prompts/specialists/abdan.ts`).
 *   2. The dispatcher actually calls the injected `provider.chat(...)` and
 *      returns the aggregated output / usage.
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatch, getSpecialistPrompt, resolveSpecialistId } from './specialists.js';
import { RESEARCH_SYSTEM_PROMPT } from '../../prompts/specialists/abdan.js';
import type { UnifiedProvider } from '../llm/index.js';

function makeMockProvider() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capture: { lastSystemPrompt?: string; lastModel?: string } = {};
  const mock: UnifiedProvider = {
    name: 'anthropic',
    // eslint-disable-next-line require-yield
    chat: vi.fn(async function* (params: Parameters<UnifiedProvider['chat']>[0]) {
      capture.lastSystemPrompt = params.systemPrompt;
      capture.lastModel = params.model;
      yield { type: 'text' as const, content: 'ok ' };
      yield { type: 'text' as const, content: 'بحث' };
      yield {
        type: 'usage' as const,
        usage: { inputTokens: 10, outputTokens: 3, cachedTokens: 0 },
      };
      yield { type: 'done' as const };
    }),
    estimateCost: () => 0.0001,
  };
  return { mock, capture };
}

describe('specialists dispatcher', () => {
  it("resolves الباحث to the RESEARCH system prompt", () => {
    expect(getSpecialistPrompt("الباحث")).toBe(RESEARCH_SYSTEM_PROMPT);
  });

  it('runs the task through the mocked LLM using the abdan prompt', async () => {
    const { mock, capture } = makeMockProvider();
    const result = await dispatch({
      specialist: 'عبدان',
      task: 'ابحث في موضوع BIM',
      deps: { provider: mock, model: 'claude-sonnet-4-6' },
    });

    expect(mock.chat).toHaveBeenCalledTimes(1);
    // BUG-2 FIX: identity directive is ALWAYS prepended now (not only when
    // priorMessages is non-empty), so the base prompt is embedded within the
    // final system prompt rather than being equal to it.
    expect(capture.lastSystemPrompt).toContain(RESEARCH_SYSTEM_PROMPT);
    expect(capture.lastSystemPrompt).toContain('AGENT IDENTITY');
    expect(capture.lastModel).toBe('claude-sonnet-4-6');
    expect(result.output).toBe('ok بحث');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 3, cachedTokens: 0 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    // G3 audit fix: DispatchResult.model is forwarded so workflow_steps.usage.model
    // is populated instead of the legacy hardcoded 'unknown'.
    expect(result.model).toBe('claude-sonnet-4-6');
  });

  it('throws on unknown specialist', async () => {
    const { mock } = makeMockProvider();
    await expect(
      dispatch({
        specialist: 'nobody',
        task: 'x',
        deps: { provider: mock, model: 'claude-sonnet-4-6' },
      })
    ).rejects.toThrow(/Unknown specialist/);
  });

  it('prepends a Prior Rounds transcript when priorMessages is non-empty', async () => {
    const { mock, capture } = makeMockProvider();
    await dispatch({
      specialist: 'شواشة',
      task: 'لخّص ما قاله عبدان',
      priorMessages: [
        { role: 'assistant', content: 'عبدان قال: السلام عليكم', agent: 'abdan', agentDisplay: 'عبدان' },
      ],
      deps: { provider: mock, model: 'claude-sonnet-4-6' },
    });
    expect(capture.lastSystemPrompt).toContain('عبدان قال');
    expect(capture.lastSystemPrompt).toContain('Prior Rounds');
    expect(capture.lastSystemPrompt).toContain('شواشة');
  });

  it('is a no-op when priorMessages is an empty array (identical to old behavior)', async () => {
    const { mock, capture } = makeMockProvider();
    await dispatch({
      specialist: 'عبدان',
      task: 'ابحث',
      priorMessages: [],
      deps: { provider: mock, model: 'claude-sonnet-4-6' },
    });
    // BUG-2 FIX: identity directive always prepended. The base prompt is still
    // present, and the Prior Rounds transcript is still absent when priorMessages
    // is empty.
    expect(capture.lastSystemPrompt).toContain(RESEARCH_SYSTEM_PROMPT);
    expect(capture.lastSystemPrompt).toContain('AGENT IDENTITY');
    expect(capture.lastSystemPrompt).not.toContain('Prior Rounds');
    expect(capture.lastSystemPrompt).not.toContain('سجل الجولات السابقة');
  });

  it('prepends the identity directive when priorMessages is non-empty', async () => {
    const { mock, capture } = makeMockProvider();
    await dispatch({
      specialist: 'شواشة',
      task: 't',
      priorMessages: [
        { role: 'assistant', content: 'x', agent: 'abdan', agentDisplay: 'عبدان' },
      ],
      deps: { provider: mock, model: 'claude-sonnet-4-6' },
    });
    const sys = capture.lastSystemPrompt || '';
    // BUG-2 FIX: directive now opens with a bilingual banner. Check for the
    // banner and the Arabic identity line within the first block instead of
    // a literal prefix match.
    expect(sys.startsWith('=== هوية الوكيل / AGENT IDENTITY')).toBe(true);
    expect(sys).toContain('أنت المُلخِّص');
    expect(sys).toContain('STRICTLY FORBIDDEN');
    expect(sys).toContain('تقمّص');
    expect(sys).toContain('شواشة');
  });

  it('includes a closing reinforcement after the transcript', async () => {
    const { mock, capture } = makeMockProvider();
    await dispatch({
      specialist: 'شواشة',
      task: 't',
      priorMessages: [
        { role: 'assistant', content: 'x', agent: 'abdan', agentDisplay: 'عبدان' },
      ],
      deps: { provider: mock, model: 'claude-sonnet-4-6' },
    });
    const sys = capture.lastSystemPrompt || '';
    const reminderIdx = sys.indexOf('تذكير: أنت');
    const endMarkerIdx = sys.indexOf('--- نهاية السجل ---');
    expect(reminderIdx).toBeGreaterThan(-1);
    expect(endMarkerIdx).toBeGreaterThan(-1);
    expect(reminderIdx).toBeGreaterThan(endMarkerIdx);
    expect(sys).toContain('تذكير: أنت المُلخِّص');
  });

  it('wraps each prior message content in guillemet quotes («…»)', async () => {
    const { mock, capture } = makeMockProvider();
    await dispatch({
      specialist: 'شواشة',
      task: 't',
      priorMessages: [
        { role: 'assistant', content: 'هلا والله', agent: 'abdan', agentDisplay: 'عبدان' },
      ],
      deps: { provider: mock, model: 'claude-sonnet-4-6' },
    });
    const sys = capture.lastSystemPrompt || '';
    expect(sys).toContain('«هلا والله»');
  });

  it('resolveSpecialistId maps the English transliteration "abdan" → "research"', () => {
    expect(resolveSpecialistId('abdan')).toBe('research');
  });

  it('resolveSpecialistId maps the Arabic name "عبدان" → "research"', () => {
    expect(resolveSpecialistId('عبدان')).toBe('research');
  });

  it('resolveSpecialistId passes canonical "research" through untouched', () => {
    expect(resolveSpecialistId('research')).toBe('research');
  });

  it('dispatch resolves alias "abdan" and loads the RESEARCH system prompt', async () => {
    const { mock, capture } = makeMockProvider();
    const result = await dispatch({
      specialist: 'abdan',
      task: 'ابحث في موضوع BIM',
      deps: { provider: mock, model: 'claude-sonnet-4-6' },
    });
    expect(mock.chat).toHaveBeenCalledTimes(1);
    // BUG-2 FIX: base prompt is now wrapped by the identity directive.
    expect(capture.lastSystemPrompt).toContain(RESEARCH_SYSTEM_PROMPT);
    expect(capture.lastSystemPrompt).toContain('AGENT IDENTITY');
    expect(result.output).toBe('ok بحث');
  });

  it('truncates each prior message content to ~600 characters', async () => {
    const { mock, capture } = makeMockProvider();
    const longContent = 'ء'.repeat(10_000);
    await dispatch({
      specialist: 'شواشة',
      task: 't',
      priorMessages: [
        { role: 'assistant', content: longContent, agent: 'abdan', agentDisplay: 'عبدان' },
      ],
      deps: { provider: mock, model: 'claude-sonnet-4-6' },
    });
    const sys = capture.lastSystemPrompt || '';
    // Count occurrences of the ء char in the system prompt. Only ~600 should appear.
    const occurrences = (sys.match(/ء/g) || []).length;
    expect(occurrences).toBeLessThanOrEqual(700);
    expect(occurrences).toBeGreaterThan(400);
    expect(sys.length).toBeLessThan(RESEARCH_SYSTEM_PROMPT.length + 2_000);
  });

  // ─── BUG-2 regression tests ───────────────────────────────────────────────
  it('BUG-2: identity directive is prepended even when priorMessages is undefined', async () => {
    const { mock, capture } = makeMockProvider();
    await dispatch({
      specialist: 'عبدان',
      task: 'ابحث',
      deps: { provider: mock, model: 'claude-sonnet-4-6' },
    });
    const sys = capture.lastSystemPrompt || '';
    expect(sys.startsWith('=== هوية الوكيل / AGENT IDENTITY')).toBe(true);
    expect(sys).toContain('أنت الباحث');
    expect(sys).toContain('STRICTLY FORBIDDEN');
  });

  it('BUG-2: identity directive names عبدان when dispatched via English alias "abdan"', async () => {
    const { mock, capture } = makeMockProvider();
    await dispatch({
      specialist: 'abdan',
      task: 't',
      priorMessages: [
        { role: 'assistant', content: 'شواشة قالت: قرأتُ الورقة', agent: 'shwasha', agentDisplay: 'شواشة' },
      ],
      deps: { provider: mock, model: 'claude-sonnet-4-6' },
    });
    const sys = capture.lastSystemPrompt || '';
    // Directive must say "أنت عبدان", NOT "أنت شواشة", even when priorMessages
    // contains شواشة's output. This is the core Bug-2 guarantee: the tool_use
    // delegated path cannot bleed another agent's persona.
    expect(sys).toContain('أنت الباحث');
    expect(sys).not.toContain('أنت المُلخِّص');
    expect(sys).toContain('ممنوع منعاً باتاً');
  });

  it('BUG-2: identity directive explicitly forbids impersonation in both languages', async () => {
    const { mock, capture } = makeMockProvider();
    await dispatch({
      specialist: 'الصفرا',
      task: 't',
      priorMessages: [
        { role: 'assistant', content: 'x', agent: 'abdan', agentDisplay: 'عبدان' },
      ],
      deps: { provider: mock, model: 'claude-sonnet-4-6' },
    });
    const sys = capture.lastSystemPrompt || '';
    expect(sys).toContain('STRICTLY FORBIDDEN');
    expect(sys).toContain('ممنوع منعاً باتاً');
    expect(sys).toContain('Al-Naqid');
    expect(sys).toContain('الناقد');
    expect(sys).toContain('THE RULE');
  });
});
