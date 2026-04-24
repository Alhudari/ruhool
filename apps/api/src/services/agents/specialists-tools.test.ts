/**
 * Tests for tool_use wiring in the specialists dispatcher (Phase 5).
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatch } from './specialists.js';
import type { UnifiedProvider } from '../llm/index.js';
import type { ImageService } from '../generation/images.js';

function makeProviderThatEmitsToolUseOnce() {
  let round = 0;
  const capture: { toolsSeen?: unknown; rounds: number } = { rounds: 0 };
  const mock: UnifiedProvider = {
    name: 'anthropic',
    // eslint-disable-next-line require-yield
    chat: vi.fn(async function* (params: Parameters<UnifiedProvider['chat']>[0]) {
      capture.rounds += 1;
      if (round === 0) {
        capture.toolsSeen = params.tools;
        round += 1;
        yield { type: 'text' as const, content: 'سأُنشئ صورة الآن.' };
        yield {
          type: 'tool_use' as const,
          id: 'tu_1',
          name: 'generate_image',
          input: { prompt: 'نسر في الصحراء', style: 'photo' },
        };
        yield { type: 'usage' as const, usage: { inputTokens: 5, outputTokens: 3, cachedTokens: 0 } };
        yield { type: 'done' as const };
      } else {
        yield { type: 'text' as const, content: 'جاهز.' };
        yield { type: 'usage' as const, usage: { inputTokens: 2, outputTokens: 1, cachedTokens: 0 } };
        yield { type: 'done' as const };
      }
    }),
    estimateCost: () => 0,
  };
  return { mock, capture };
}

describe('specialists dispatcher — generation tools (Phase 5)', () => {
  it('المصمم receives generate_image tool, tool_use is executed, artifact populated', async () => {
    const { mock, capture } = makeProviderThatEmitsToolUseOnce();
    const imageService: ImageService = {
      generateImage: vi.fn(async ({ specialist }) => ({
        url: '/api/files/images/generated/abc.png',
        meta: {
          provider: 'stability', model: 'stable-image-core', costUsd: 0.03,
          durationMs: 5, bytes: 123, filename: 'abc.png', specialist,
          style: 'photo', size: undefined,
        },
      })),
      outputDir: '/tmp',
    };

    const result = await dispatch({
      specialist: 'المصمم',
      task: 'ارسم نسراً',
      deps: {
        provider: mock,
        model: 'claude-sonnet-4-5',
        generationTools: { imageService },
      },
    });

    // Tools were passed into the first chat call.
    expect(Array.isArray(capture.toolsSeen)).toBe(true);
    const toolNames = (capture.toolsSeen as Array<{ name: string }>).map((t) => t.name);
    expect(toolNames).toContain('generate_image');

    // Tool executor was invoked.
    expect(imageService.generateImage).toHaveBeenCalledTimes(1);

    // Artifact surfaced on the result.
    expect(result.artifacts).toBeDefined();
    expect(result.artifacts?.[0]?.type).toBe('image');
    expect(result.artifacts?.[0]?.url).toBe('/api/files/images/generated/abc.png');

    // The model was re-invoked with tool_result so it could continue narrating.
    expect(capture.rounds).toBeGreaterThanOrEqual(2);

    // Output text accumulated across rounds.
    expect(result.output).toContain('جاهز.');
  });

  it('text-only specialist gets no tools', async () => {
    const captured: { tools?: unknown } = {};
    const provider: UnifiedProvider = {
      name: 'anthropic',
      // eslint-disable-next-line require-yield
      chat: vi.fn(async function* (params: Parameters<UnifiedProvider['chat']>[0]) {
        captured.tools = params.tools;
        yield { type: 'text' as const, content: 'بحث' };
        yield { type: 'usage' as const, usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 } };
        yield { type: 'done' as const };
      }),
      estimateCost: () => 0,
    };
    const res = await dispatch({
      specialist: 'الباحث',
      task: 'ابحث',
      deps: { provider, model: 'claude-sonnet-4-5' },
    });
    expect(captured.tools).toBeUndefined();
    expect(res.artifacts).toBeUndefined();
  });
});
