/**
 * Hierarchical dispatch — shared types used by the dispatcher service
 * AND the chat route. Also consumed (loosely) by the frontend via the
 * SSE event stream shape.
 *
 * See docs/architecture/dispatch-contract.md for the authoritative spec.
 */

export type DispatchState =
  | 'routed'
  | 'dept-selected'
  | 'worker-selected'
  | 'worker-responded'
  | 'worker-failed'
  | 'synthesized'
  | 'budget-capped'
  | 'failed';

export interface DispatchRequest {
  dispatchId: string;
  userMessage: string;
  language: 'ar' | 'en';
  conversationId?: string;
  budgetUsd?: number;
  maxFanout?: number;
}

export interface DispatchChainEntry {
  agentId: string;
  role: 'ceo' | 'manager' | 'worker';
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  startedAtMs: number;
  endedAtMs: number;
  status: 'ok' | 'failed' | 'cancelled';
  error?: string;
}

export interface DispatchError {
  step: 'routing' | 'dept-selection' | 'worker-invocation' | 'synthesis';
  agentId?: string;
  message: string;
}

export interface DispatchResult {
  dispatchId: string;
  finalText: string;
  language: 'ar' | 'en';
  chain: DispatchChainEntry[];
  totalTokens: { input: number; output: number };
  totalCostUsd: number;
  budgetCapped: boolean;
  errors: DispatchError[];
  durationMs: number;
}

// The narrow LLM interface the dispatcher depends on. Kept tiny so unit
// tests can swap in a mock without pulling all provider types.
export interface DispatcherLLM {
  callSystemMessage(
    system: string,
    userMessage: string,
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<{
    text: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
  }>;
}

export interface DispatcherDeps {
  llm: DispatcherLLM;
  // Pluggable so the dispatcher doesn't know about hono/fs paths.
  loadOrg: () => Promise<import('../../prompts/hierarchy.js').OrgResolved | null>;
  getLimits: () => { hierarchicalDispatchUsd: number; dispatchMaxFanout: number };
  auditLog: (entry: { action: string; source: string; meta?: Record<string, unknown> }) => void;
  logger?: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void };
  /**
   * Round 5 — optional step emitter. Called once per hop with the
   * intermediate state so callers can persist each hop as a conversation
   * message. Pure side-effect callback; dispatcher does not wait on it.
   */
  onStep?: (step: DispatchStepEvent) => void;
}

export type DispatchStepEvent =
  | { kind: 'route'; dispatchId: string; ceo: string }
  | { kind: 'dept-selected'; dispatchId: string; dept: string; reason: string; ceo: string }
  | { kind: 'worker-output'; dispatchId: string; workerId: string; deptManager: string; text: string; tokensIn: number; tokensOut: number; costUsd: number }
  | { kind: 'worker-failed'; dispatchId: string; workerId: string; deptManager: string; error: string }
  | { kind: 'synthesis'; dispatchId: string; deptManager: string; text: string; chain: string[]; totalTokensIn: number; totalTokensOut: number; totalCostUsd: number; budgetCapped: boolean };
