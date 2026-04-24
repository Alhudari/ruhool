# Round 3 — dispatcher prompt eval

## Suite

`apps/api/test/integration/dispatch-eval.test.ts` — 8 scenarios × deterministic
mock LLM. Covers:

| # | scenario                                          | expected behavior |
|---|---------------------------------------------------|-------------------|
| 01 | trivial research, single worker                  | routed → research → reading-helper → synthesis |
| 02 | writing dept, direct_answer                      | manager answers inline, no worker invoked |
| 03 | multi-worker fan-out                             | ≥2 workers in parallel, combined synthesis |
| 04 | ops dept, task query                             | routed to tasks-agent worker |
| 05 | CEO returns free text (no dept JSON)             | falls back to raw CEO text, no worker |
| 06 | Arabic input, Arabic synthesis                   | `result.language === 'ar'`, Arabic in finalText |
| 07 | manager picks no workers and no direct_answer    | error recorded, no fabrication |
| 08 | unknown worker id silently dropped               | invalid id skipped, valid id invoked |

All 8 green. Run with:

```
pnpm --filter @ruhool/api test test/integration/dispatch-eval.test.ts
```

## Why mocked

Real LLM eval requires an API key, budget, non-determinism, and a
judge model for scoring. That's a different tier of investment
(Ragas-like framework, OpenAI evals, or human-in-the-loop). The
mock suite here:

- Guards the **decision flow** — CEO picks dept, manager picks
  workers, parallel fan-out, synthesis.
- Catches **regressions** in the dispatcher state machine when
  someone edits `hierarchical-dispatcher.ts`.
- Does NOT grade answer quality. That's the real-LLM pass, not in
  scope for this round.

## When to upgrade to real-LLM eval

- Before promoting the hierarchy flag to default-on in prod with
  real users (already done in R3 for you alone).
- When changing dept manager prompts significantly.
- When adding a new dept or worker.

## Upgrade path

Drop-in replacement: swap `scenarioLLM(s)` for a
`realAnthropicLLM()` wrapper that hits the Claude API with
`ANTHROPIC_API_KEY`. Then assert on keyword presence + no
fabrication. A Ragas-style rubric is deferred.
