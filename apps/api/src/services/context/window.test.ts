import { describe, it, expect } from 'vitest';
import { estimateTokens, trimToTokenBudget, getContextWindow } from './window.js';

describe('estimateTokens', () => {
  it('estimates short text', () => {
    expect(estimateTokens('hello')).toBe(2);
  });

  it('estimates longer text', () => {
    const text = 'a'.repeat(400);
    expect(estimateTokens(text)).toBe(100);
  });
});

describe('trimToTokenBudget', () => {
  const makeMsg = (role: string, content: string) => ({ role, content });

  it('keeps all messages when under budget', () => {
    const msgs = [
      makeMsg('user', 'hi'),
      makeMsg('assistant', 'hello'),
      makeMsg('user', 'bye'),
    ];
    const { trimmed, droppedCount } = trimToTokenBudget(msgs, 10_000, 100);
    expect(droppedCount).toBe(0);
    expect(trimmed.length).toBe(3);
  });

  it('trims oldest messages when over budget', () => {
    const long = 'x'.repeat(4000); // ~1000 tokens
    const msgs = [
      makeMsg('user', long),     // oldest, should be dropped
      makeMsg('assistant', long),
      makeMsg('user', 'short'),  // newest
    ];
    const { trimmed, droppedCount } = trimToTokenBudget(msgs, 1_500, 200);
    expect(droppedCount).toBeGreaterThan(0);
    expect(trimmed[trimmed.length - 1].content).toBe('short');
  });

  it('ensures first retained message is user', () => {
    const msgs = [
      makeMsg('assistant', 'x'),
      makeMsg('user', 'hello'),
      makeMsg('assistant', 'world'),
    ];
    const { trimmed } = trimToTokenBudget(msgs, 1000, 10);
    if (trimmed.length > 0) {
      expect(trimmed[0].role).toBe('user');
    }
  });
});

describe('getContextWindow', () => {
  it('returns known model context size', () => {
    expect(getContextWindow('claude-sonnet-4-6')).toBe(180_000);
  });

  it('returns default for unknown model', () => {
    expect(getContextWindow('unknown-model')).toBe(180_000);
  });
});
