# Workflow DAG — Phase 2

Phase 2 of the multi-agent workflow feature introduces a durable, step-by-step
pipeline so a single user request like **"ابحث، ثم اكتب تقرير، ثم ارسم صوراً"**
decomposes into a sequence of specialist tasks, each receiving the prior step's
output as handoff context.

## What Phase 2 adds

- **Planning**: الراعي generates a structured JSON plan via the `plan_workflow`
  Anthropic tool (`{ title, steps: [{ specialist, task, expectedOutput? }] }`).
- **Persistence**: two new tables — `workflow_runs` and `workflow_steps` —
  mirrored in the JSON store when `DATABASE_URL` is unset.
- **Async execution**: BullMQ queue `workflow-step` drives sequential execution.
  Redis-less dev falls back to an in-process `setImmediate` loop.
- **Handoff**: every step sees `input.handoff` (last step's output, 2 KB excerpt)
  plus `input.fullHistory = [{ specialist, output }]`, and gets the Phase 1
  `priorMessages` transcript threaded through the specialist dispatcher.
- **SSE**: per-run event channel at `GET /api/workflow-runs/:id/events`.
- **Chat integration**: الراعي gets a new `plan_and_run_workflow` tool
  alongside `delegate_to_specialist`; emits `workflow-started` SSE on kickoff.

## Schema

```
workflow_runs (id, title, createdByConversationId, status, currentStepIndex,
               startedAt, completedAt, error, totalCostUsd, metadata, timestamps)
    │  status: pending | running | paused | completed | failed | canceled
    ▼
workflow_steps (id, runId, stepIndex, specialist, task, expectedOutput,
                status, startedAt, completedAt, input, output, artifacts,
                usage, durationMs, error, timestamps)
    status: pending | running | completed | failed | skipped
```

Migration: `packages/db/src/migrations/0001_workflow_runs_steps.sql`.

## API

| Verb | Path | Body / Query | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/workflow-runs` | `{ title?, steps:[{specialist,task,expectedOutput?}], conversationId? }` | Create a run + steps (pending). |
| `POST` | `/api/workflow-runs/plan` | `{ userRequest, conversationId?, title? }` | الراعي plans the workflow and persists it (does NOT start). |
| `POST` | `/api/workflow-runs/:id/start` | — | Move run to `running`; enqueue step 0. |
| `POST` | `/api/workflow-runs/:id/pause` | — | Next step won't enqueue; in-flight step completes. |
| `POST` | `/api/workflow-runs/:id/cancel` | — | Halt; no more steps run. |
| `GET` | `/api/workflow-runs` | `?status=&limit=` | List runs (newest first). |
| `GET` | `/api/workflow-runs/:id` | — | Full run with its steps. |
| `GET` | `/api/workflow-runs/:id/events` | — | SSE stream of step/run events. |

## Example

```bash
curl -X POST http://localhost:3001/api/workflow-runs/plan \
  -H 'content-type: application/json' \
  -d '{"userRequest":"ابحث عن BIM، اكتب تقرير، ارسم مخطط"}'
# → { "runId": "…", "run": {…}, "steps": [ {specialist:"عبدان",…}, {specialist:"الدبسا",…}, {specialist:"المصمم",…} ] }

curl -X POST http://localhost:3001/api/workflow-runs/<runId>/start
# → { ok: true }

curl -N http://localhost:3001/api/workflow-runs/<runId>/events
# event: workflow-run-started
# event: workflow-step-started  { stepIndex: 0, specialist: "عبدان" }
# event: workflow-step-completed { stepIndex: 0, output: "…" }
# event: workflow-step-started  { stepIndex: 1, specialist: "الدبسا" }
# …
# event: workflow-run-completed
```

## Handoff payload

Each step's `input` JSON looks like:

```json
{
  "handoff": "<= 2 KB excerpt of the last step's output>",
  "fullHistory": [
    { "specialist": "عبدان", "output": "full prior output" },
    { "specialist": "الدبسا", "output": "..." }
  ]
}
```

The dispatcher additionally builds `priorMessages[]` (up to 8, each truncated
to 600 chars) from completed prior steps and threads them through the Phase 1
specialist prompt transcript — so the specialist sees both the structured
handoff (as `context`) and the rolling round transcript.

## Failure semantics

- Dispatcher throws → current step `status='failed'`, run `status='failed'`,
  SSE `workflow-step-failed` + `workflow-run-failed` emitted. No auto-retry
  (Phase 3 Temporal adds durability).
- `pause` → next step isn't enqueued; an in-flight step will complete and then
  stop the chain.
- `cancel` → terminal; no further steps run.
- Redis unavailable → orchestrator falls back to `setImmediate` in-process
  execution; everything still works in dev without Redis.

## Monitoring

- SSE per run: `GET /api/workflow-runs/:id/events`.
- Activity log: `workflow-run-started`, `workflow-run-completed`,
  `workflow-run-failed` events are appended via `logActivity` and fan out to
  existing `/api/activity/live` subscribers.
