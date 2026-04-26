import { describe, it, expect } from 'vitest';
import { buildTranscript, summarizeEvents } from './event-bus.js';
import type { AgentEvent } from '../../store/types.js';

const makeEvent = (type: AgentEvent['type'], overrides: Partial<AgentEvent> = {}): AgentEvent => ({
  id: 'test-id',
  runId: 'run-1',
  type,
  at: Date.now(),
  ...overrides,
});

describe('buildTranscript', () => {
  it('formats events as readable transcript', () => {
    const events: AgentEvent[] = [
      makeEvent('run.started', { agentId: 'manager', at: 1_000_000 }),
      makeEvent('delegation.started', { agentId: 'research', at: 1_001_000 }),
      makeEvent('step.completed', { agentId: 'research', durationMs: 1500, tokens: { costUsd: 0.002 }, at: 1_002_500 }),
      makeEvent('run.completed', { at: 1_003_000 }),
    ];
    const transcript = buildTranscript(events);
    expect(transcript).toContain('run.started');
    expect(transcript).toContain('delegation.started');
    expect(transcript).toContain('1500ms');
    expect(transcript).toContain('$0.0020');
  });

  it('returns placeholder for empty events', () => {
    const transcript = buildTranscript([]);
    expect(transcript).toBe('[no events recorded]');
  });
});

describe('summarizeEvents', () => {
  it('calculates totals correctly', () => {
    const events: AgentEvent[] = [
      makeEvent('step.completed', { tokens: { in: 100, out: 200, costUsd: 0.01 }, at: 1000 }),
      makeEvent('step.completed', { tokens: { in: 50, out: 100, costUsd: 0.005 }, at: 2000 }),
      makeEvent('step.failed', { at: 3000 }),
    ];
    const summary = summarizeEvents(events);
    expect(summary.totalTokensIn).toBe(150);
    expect(summary.totalTokensOut).toBe(300);
    expect(summary.totalCostUsd).toBeCloseTo(0.015);
    expect(summary.stepCount).toBe(2);
    expect(summary.errorCount).toBe(1);
  });
});
