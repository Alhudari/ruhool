import { describe, it, expect } from 'vitest';
import { eventBus } from './llm-and-events.js';

describe('core package smoke', () => {
  it('exports eventBus', () => {
    expect(eventBus).toBeDefined();
  });
  it('eventBus has emit method', () => {
    expect(typeof (eventBus as unknown as { emit: unknown }).emit).toBe('function');
  });
});
