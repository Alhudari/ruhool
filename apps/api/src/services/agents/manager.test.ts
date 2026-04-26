import { describe, it, expect } from 'vitest';
import {
  delegateToSpecialistTool,
  parseToolUseDelegations,
  parseTextMarkerDelegations,
  allowedSpecialistIds,
} from './manager.js';

describe('delegateToSpecialistTool', () => {
  it('produces a valid Anthropic tool shape', () => {
    const tool = delegateToSpecialistTool();
    expect(tool.name).toBe('delegate_to_specialist');
    expect(tool.input_schema.type).toBe('object');
    const props = tool.input_schema.properties as Record<string, { type: string; enum?: string[] }>;
    expect(props.specialist.enum).toBeDefined();
    expect(props.specialist.enum!.length).toBeGreaterThan(0);
  });

  it('lists at least the known specialists', () => {
    const ids = allowedSpecialistIds();
    expect(ids).toContain('research');
    expect(ids).toContain('reading-helper');
  });
});

describe('parseToolUseDelegations', () => {
  it('extracts delegations from tool_use blocks', () => {
    const content = [
      { type: 'text', text: 'hello', citations: null },
      {
        type: 'tool_use',
        id: 'toolu_1',
        name: 'delegate_to_specialist',
        input: { specialist: 'research', task: 'research foo', context: 'bar' },
      },
    ] as unknown as Parameters<typeof parseToolUseDelegations>[0];
    const result = parseToolUseDelegations(content);
    expect(result).toHaveLength(1);
    expect(result[0].specialist).toBe('research');
    expect(result[0].source).toBe('tool_use');
  });

  it('ignores other tool calls', () => {
    const content = [
      {
        type: 'tool_use',
        id: 'x',
        name: 'some_other_tool',
        input: {},
      },
    ] as unknown as Parameters<typeof parseToolUseDelegations>[0];
    expect(parseToolUseDelegations(content)).toEqual([]);
  });
});

describe('parseTextMarkerDelegations (legacy)', () => {
  it('extracts from "أحلتها لالباحث"', () => {
    const result = parseTextMarkerDelegations('تم. أحلتها لالباحث ✓');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].specialist).toBe('research');
    expect(result[0].source).toBe('text_marker');
  });

  it('returns empty for plain text', () => {
    expect(parseTextMarkerDelegations('hello world')).toEqual([]);
  });
});
