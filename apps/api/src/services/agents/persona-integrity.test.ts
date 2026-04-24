/**
 * Behavior test: persona integrity across all specialists.
 *
 * For every target specialist, we dispatch with a `priorMessages` entry coming
 * from a DIFFERENT specialist speaking in a distinctive style, and assert that
 * the system prompt passed to the LLM:
 *   1. Still contains the target's unmodified base prompt.
 *   2. Contains the identity directive naming the target.
 *   3. Contains the closing reinforcement naming the target.
 *
 * This guards against regressions where the identity reinforcement stops
 * being applied for a specific specialist, which is the exact pathway that
 * lets a specialist mimic the previous speaker's voice.
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatch, getSpecialistPrompt } from './specialists.js';
import type { UnifiedProvider } from '../llm/index.js';

function makeMockProvider() {
  const capture: { lastSystemPrompt?: string } = {};
  const mock: UnifiedProvider = {
    name: 'anthropic',
    // eslint-disable-next-line require-yield
    chat: vi.fn(async function* (params: Parameters<UnifiedProvider['chat']>[0]) {
      capture.lastSystemPrompt = params.systemPrompt;
      yield { type: 'text' as const, content: 'echo' };
      yield {
        type: 'usage' as const,
        usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
      };
      yield { type: 'done' as const };
    }),
    estimateCost: () => 0,
  };
  return { mock, capture };
}

// Pairs: target specialist vs. a different specialist whose "voice" appears
// in the prior transcript. Styles are deliberately distinctive so a mimicking
// target would pick them up in reality.
const CASES: Array<{
  target: string;
  intruderDisplay: string;
  intruderAgent: string;
  intruderContent: string;
}> = [
  {
    target: 'الباحث',
    intruderDisplay: 'المُلخِّص',
    intruderAgent: 'shwasha',
    intruderContent: 'يا حلاتها القراءة، خلّنا نتمشّى في النص براحة.',
  },
  {
    target: 'المُلخِّص',
    intruderDisplay: 'الباحث',
    intruderAgent: 'abdan',
    intruderContent: 'تقرير بحثي: المصادر المعتمدة بلغت 14 مرجعاً محكّماً.',
  },
  {
    target: 'الناقد',
    intruderDisplay: 'السارد',
    intruderAgent: 'content-creator',
    intruderContent: 'يا جماعة! Post إنستا نار، كابشن قصير، هاشتاقات حماسية.',
  },
  {
    target: 'المُقارِن',
    intruderDisplay: 'الناقد',
    intruderAgent: 'writing-critic',
    intruderContent: 'الصياغة مرتبكة، الفقرة الثانية تحتاج تكثيفاً نقدياً صارماً.',
  },
  {
    target: 'السارد',
    intruderDisplay: 'المُقارِن',
    intruderAgent: 'comparator',
    intruderContent: 'مقارنة: الخيار (أ) يتفوّق على (ب) في ثلاثة محاور من أصل خمسة.',
  },
  {
    target: 'المصمم',
    intruderDisplay: 'الباحث',
    intruderAgent: 'abdan',
    intruderContent: 'خلاصة المراجعة المنهجية: الفجوة البحثية تتركّز في ثلاثة محاور.',
  },
];

describe('persona integrity across specialists', () => {
  for (const c of CASES) {
    it(`${c.target}: identity reinforced even when ${c.intruderDisplay} spoke first`, async () => {
      const { mock, capture } = makeMockProvider();
      const base = getSpecialistPrompt(c.target);
      expect(base).not.toBeNull();

      await dispatch({
        specialist: c.target,
        task: 'تابع العمل',
        priorMessages: [
          {
            role: 'assistant',
            content: c.intruderContent,
            agent: c.intruderAgent,
            agentDisplay: c.intruderDisplay,
          },
        ],
        deps: { provider: mock, model: 'claude-sonnet-4-6' },
      });

      const sys = capture.lastSystemPrompt || '';

      // 1. Target's base prompt is present unchanged.
      expect(sys).toContain(base as string);

      // 2. Identity directive names the target specialist. (BUG-2 FIX: directive
      // now opens with a bilingual banner instead of "أنت …".)
      expect(sys.startsWith('=== هوية الوكيل / AGENT IDENTITY')).toBe(true);
      expect(sys).toContain('تقمّص');
      expect(sys).toContain(`أنت ${c.target}`);

      // 3. Closing reinforcement names the target specialist.
      expect(sys).toContain(`تذكير: أنت ${c.target}`);

      // Sanity: intruder content was quoted, not blended in raw.
      expect(sys).toContain(`«${c.intruderContent}»`);
    });
  }
});
