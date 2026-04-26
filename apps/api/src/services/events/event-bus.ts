import crypto from 'node:crypto';
import type { StoreData, AgentEvent } from '../../store/types.js';

export type EmitOptions = Omit<AgentEvent, 'id' | 'at'>;

export function emitRunEvent(store: StoreData, opts: EmitOptions): void {
  if (!store.agentRuns) return;
  const run = store.agentRuns.find((r) => r.id === opts.runId);
  if (!run) return;
  if (!run.events) run.events = [];
  run.events.push({ id: crypto.randomUUID(), at: Date.now(), ...opts });
}

export function buildTranscript(events: AgentEvent[]): string {
  if (events.length === 0) return '[no events recorded]';
  const lines: string[] = [];
  const sorted = [...events].sort((a, b) => a.at - b.at);

  for (const e of sorted) {
    const ts = new Date(e.at).toISOString().slice(11, 19);
    const agent = e.agentId ? `[${e.agentId}]` : '';
    const cost = e.tokens?.costUsd ? ` ($${e.tokens.costUsd.toFixed(4)})` : '';
    const dur = e.durationMs ? ` ${e.durationMs}ms` : '';
    lines.push(`${ts} ${agent} ${e.type}${dur}${cost}`);
    if (e.payload?.summary) lines.push(`  → ${e.payload.summary}`);
    if (e.payload?.error) lines.push(`  ⚠ ${e.payload.error}`);
  }

  return lines.join('\n');
}

export function summarizeEvents(events: AgentEvent[]): {
  totalCostUsd: number;
  totalTokensIn: number;
  totalTokensOut: number;
  stepCount: number;
  errorCount: number;
  durationMs: number;
} {
  let totalCostUsd = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let stepCount = 0;
  let errorCount = 0;
  const start = events[0]?.at ?? Date.now();
  const end = events[events.length - 1]?.at ?? Date.now();

  for (const e of events) {
    totalCostUsd += e.tokens?.costUsd ?? 0;
    totalTokensIn += e.tokens?.in ?? 0;
    totalTokensOut += e.tokens?.out ?? 0;
    if (e.type === 'step.completed') stepCount++;
    if (e.type.endsWith('.failed')) errorCount++;
  }

  return { totalCostUsd, totalTokensIn, totalTokensOut, stepCount, errorCount, durationMs: end - start };
}
