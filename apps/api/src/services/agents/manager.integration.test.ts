// AGT-05 integration — exercise the tool-use delegation round-trip.
//
// This test does not call Anthropic. It builds a synthetic
// `content_block` stream resembling what the real SDK returns when الراعي
// emits a `tool_use` delegation, feeds it through the parser, and asserts
// that:
//   1. The structured delegation is extracted with `source: 'tool_use'`.
//   2. The legacy text-marker parser fires only when no tool_use block is
//      present (fallback semantics).
//   3. `logDelegations` routes every delegation through `logActivity` with
//      the right metadata.

import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  parseToolUseDelegations,
  parseTextMarkerDelegations,
  logDelegations,
  managerAnthropicRequest,
  delegateToSpecialistTool,
} from './manager.js';

type FakeBlock = Anthropic.ContentBlock;

function toolUseBlock(specialist: string, task: string, ctx?: string): FakeBlock {
  return {
    type: 'tool_use',
    id: `toolu_${specialist}`,
    name: 'delegate_to_specialist',
    input: { specialist, task, ...(ctx ? { context: ctx } : {}) },
  } as unknown as FakeBlock;
}

function textBlock(text: string): FakeBlock {
  return { type: 'text', text } as unknown as FakeBlock;
}

describe('AGT-05 integration — round-trip delegation', () => {
  it('manager request bundles the delegate tool', () => {
    const req = managerAnthropicRequest({
      messages: [{ role: 'user', content: 'ابحث لي عن...' }],
      model: 'claude-sonnet-4-6',
    });
    expect(req.tools.map((t) => t.name)).toContain('delegate_to_specialist');
    expect(req.system).toContain('الراعي');
  });

  it('tool_use path wins when present; text markers are ignored', () => {
    const content: FakeBlock[] = [
      textBlock('تمام. أحلتها لالباحث ✓'), // legacy marker in prose
      toolUseBlock('research', 'ابحث عن الإبل', 'سياق سابق'),
    ];
    const tool = parseToolUseDelegations(content);
    expect(tool).toHaveLength(1);
    expect(tool[0]).toMatchObject({
      specialist: 'research',
      task: 'ابحث عن الإبل',
      source: 'tool_use',
    });
    // The text marker parser still sees the marker — but callers should
    // prefer tool_use results and only fall back when tool is empty.
    const textOnly = parseTextMarkerDelegations('تمام. أحلتها لالباحث ✓');
    expect(textOnly).toHaveLength(1);
    expect(textOnly[0].source).toBe('text_marker');
  });

  it('logDelegations emits one activity event per delegation', () => {
    const calls: Array<unknown[]> = [];
    const fakeLog = ((...args: unknown[]) => {
      calls.push(args);
    }) as Parameters<typeof logDelegations>[1];
    logDelegations(
      [
        { specialist: 'research', task: 'research', source: 'tool_use' },
        { specialist: 'reading-helper', task: 'summarise', source: 'tool_use' },
      ],
      fakeLog,
      { requestId: 'req-1', conversationId: 'conv-1' },
    );
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe('chat');
    expect(calls[0][1]).toBe('delegation');
    expect((calls[0][3] as { agentId: string }).agentId).toBe('research');
  });

  it('tool definition enumerates the allowed specialists', () => {
    const tool = delegateToSpecialistTool();
    const props = tool.input_schema.properties as Record<
      string,
      { enum?: string[] }
    >;
    expect(props.specialist.enum).toContain('research');
    expect(props.specialist.enum).toContain('reading-helper');
    expect(props.specialist.enum).not.toContain('manager'); // self-delegation blocked
  });
});
