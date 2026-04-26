# Hierarchical dispatch contract

Authoritative input/output shape + semantics for the dispatcher shipped in
Round 2. Every downstream consumer (routing-chain UI, cost pill, audit
reader) reads from these shapes.

## States

```
routed → dept-selected → worker-selected → worker-responded → synthesized
                                            ↘ worker-failed ↗
```

Transitions:

1. `routed` — CEO received the user message. A `dispatchId` (UUID) is
   minted. Audit entry `dispatch.routed { dispatchId, user_message_excerpt }`.
2. `dept-selected` — CEO picks ONE department. Audit entry
   `dispatch.dept-selected { dispatchId, dept, reason }`.
3. `worker-selected` — dept manager picks 1..N workers (N ≤ 3). Audit
   entry `dispatch.worker-selected { dispatchId, dept, workers[] }`.
4. `worker-responded` or `worker-failed` — each worker emits one outcome.
   `dispatch.worker.ok` / `dispatch.worker.fail` with
   `{ dispatchId, workerId, tokens?, costUsd? }`.
5. `synthesized` — dept manager emits one combined reply. Audit entry
   `dispatch.synthesized { dispatchId, totalTokens, totalCostUsd,
    chain: [ceo, dept, worker[0], worker[1], ...] }`.

## Input

```ts
interface DispatchRequest {
  dispatchId: string;             // caller may pre-generate for correlation
  userMessage: string;
  language: 'ar' | 'en';
  conversationId?: string;        // for persistence + audit linking
  budgetUsd?: number;             // override default cap of $0.50
  maxFanout?: number;             // override default 3
}
```

## Output

One synthesized assistant message with structured routing metadata:

```ts
interface DispatchResult {
  dispatchId: string;
  finalText: string;              // the assembled assistant reply
  language: 'ar' | 'en';
  chain: DispatchChainEntry[];    // ordered; first is CEO, last is the synthesizer
  totalTokens: { input: number; output: number };
  totalCostUsd: number;
  budgetCapped: boolean;          // true if the cap triggered partial-synthesis
  errors: DispatchError[];        // per-step errors, may be empty
  durationMs: number;
}

interface DispatchChainEntry {
  agentId: string;
  role: 'ceo' | 'manager' | 'worker';
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  startedAtMs: number;
  endedAtMs: number;
  status: 'ok' | 'failed' | 'cancelled';
  error?: string;                 // redacted; never contains secrets
}

interface DispatchError {
  step: 'routing' | 'dept-selection' | 'worker-invocation' | 'synthesis';
  agentId?: string;
  message: string;                // user-safe
}
```

## Cost cap

- Default $0.50 per dispatch. Overridable via `store.limits.hierarchicalDispatchUsd`.
- Checked after each hop. If the projected cost of the next hop would
  exceed the remaining budget, that hop is skipped.
- When the dept manager receives the synthesis prompt, the budget
  remaining is injected: "`budget remaining: $X — pick at most N workers`".
  This lets the LLM proactively prune fan-out.
- If the cap triggers mid-flight, any already-started workers are
  cancelled (their responses may still arrive and are discarded) and
  synthesis runs with whatever has returned. `budgetCapped: true` is set.
- If zero workers returned before the cap, the CEO returns the user-safe
  "تعذّر إكمال المهمة ضمن حد التكلفة" / "Task could not complete within
  the cost cap." error. No partial/hallucinated answer.

## Fallback on worker failure

- Timeout per worker: 45s default, configurable via `ENV.DISPATCH_WORKER_TIMEOUT_MS`.
- Provider error (4xx / 5xx that is retryable): one retry, then flag
  failure on the chain.
- If at least one worker returned usable output, the manager synthesizes
  with what it has and the `errors` array captures the failed ones.
- If zero workers returned, the dept manager returns the canonical
  "لا أعرف — تعذّر الحصول على إجابة من الفريق" / "I don't know — team did
  not return a usable response." No fabrication.

## Feature flag

`process.env.ENABLE_HIERARCHICAL_DISPATCH === 'true'` enables the branch.

Gate logic in `chat.ts`:

```
if (ENABLE_HIERARCHICAL_DISPATCH && targetAgentId === 'manager'
    && !bypassHierarchyHints.has(...)) {
  return dispatchHierarchical(...);
}
return legacyChatFlow(...);   // untouched
```

Bypass hints:
- Message contains `@worker-id` mention → legacy.
- Request came from `/agents/:id/chat` direct chat surface → legacy.
- Group chat with pre-selected participants → legacy.

## Legacy preservation

The dispatcher is introduced as an **additional** branch. No lines from
the existing legacy code are deleted. Turning the flag off restores the
exact prior behavior with zero code paths altered.

## Telemetry keys (for the cost pill + audit)

| Key                        | Type   | Source |
|----------------------------|--------|--------|
| `dispatch.routed`          | audit  | CEO entry |
| `dispatch.dept-selected`   | audit  | CEO picked a dept |
| `dispatch.worker-selected` | audit  | Dept manager picked workers |
| `dispatch.worker.ok`       | audit  | Worker succeeded |
| `dispatch.worker.fail`     | audit  | Worker failed |
| `dispatch.synthesized`     | audit  | Final assembled reply |
| `dispatch.budget-capped`   | audit  | Cap triggered partial synthesis |
| `dispatch.chain[*].costUsd`| SSE    | Per-step cost for UI |
| `dispatch.totalCostUsd`    | SSE    | Rolled up for CostPill |
