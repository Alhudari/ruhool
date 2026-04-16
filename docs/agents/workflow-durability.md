# Workflow Durability (Phase 3)

Ruhool workflows (`POST /api/workflow-runs/plan`) can now run **overnight and
across server restarts** when Temporal is enabled.

## How to enable

Set `TEMPORAL_ADDRESS=temporal:7233` in the environment and start the API. On
boot you should see:

```
Temporal worker started
Temporal DAG workflow worker started
```

Without `TEMPORAL_ADDRESS`, everything still works — runs execute via BullMQ
(if Redis is up) or in-process (fallback). This is the **default local-dev
mode** and has identical behavior to Phase 2.

## What changes when Temporal is on

- `POST /api/workflow-runs/:id/start` kicks off the Temporal workflow
  `dagWorkflow` with workflow id `run-<runId>`.
- Each step becomes a Temporal activity `executeWorkflowStep` that proxies to
  the Phase 2 orchestrator — so the execution semantics (handoff, SSE,
  persistence) are unchanged.
- Activities retry with exponential backoff: 10s → 20s → 40s, max 5m, up to
  3 attempts per step.
- Each activity has a 1-hour `startToCloseTimeout`. Long steps are fine.

## Overnight guarantees

- If the API node crashes mid-run, Temporal re-enqueues the in-flight activity
  to any surviving worker. Progress resumes from the last completed step.
- If Temporal itself is down, the run is paused (Temporal's guarantee). It
  resumes automatically when the cluster recovers.
- Boot-time reconciliation inspects `workflow_runs WHERE status='running'` and
  marks non-durable stale runs `failed` with `error='server_restart_lost_state'`,
  so the UI never shows a forever-running ghost.

## Control signals

From the UI or curl:

```
POST /api/workflow-runs/:id/pause   # pauseRun signal
POST /api/workflow-runs/:id/resume  # resumeRun signal
POST /api/workflow-runs/:id/cancel  # cancelRun signal
```

The orchestrator sends the Temporal signal when the run is durable, and
falls back to BullMQ re-enqueue otherwise.

## Inspecting a run

```
GET /api/workflow-runs/:id/handle
```

Returns `{ mode: 'temporal' | 'bullmq' | 'inproc', workflowId?, status? }`.

## When Temporal is disabled

All endpoints above still respond successfully — the underlying engine is
BullMQ or in-proc. Zero behavior change from Phase 2.
