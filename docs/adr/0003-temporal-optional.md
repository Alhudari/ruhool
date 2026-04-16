# ADR 0003 — Temporal is opt-in (research workflow only)

**Status:** accepted
**Date:** 2026-04-15

## Context

`docker-compose.yml` starts Temporal + Temporal UI containers but no code ever
connects to them (audit finding ARC-02). This ships unused resources and falsely
implies that research jobs have durable, resumable execution.

## Decision

Keep the Temporal containers but gate real usage behind `TEMPORAL_ADDRESS`:

- `apps/api/src/workflows/research-workflow.ts` — a minimal `researchWorkflow` that
  orchestrates search → summarize → store via `proxyActivities`.
- `apps/api/src/workers/temporal-activities.ts` — default (placeholder) activity
  implementations. Real integrations replace these per deployment.
- `apps/api/src/workers/temporal.ts` — starts a Worker when `TEMPORAL_ADDRESS` is
  set; otherwise the module is never imported.
- `POST /api/workflows/research/start` — client-side kickoff. Returns 503 when
  Temporal is disabled.

If the Temporal connection fails at boot, the API **logs a warning and continues**.
Temporal failure must never block local-first operation.

## Consequences

- Most developers (local-first) never touch Temporal; `docker compose up` still
  starts the containers but they're idle.
- Production deployments set `TEMPORAL_ADDRESS=temporal:7233` to opt in.
- The workflow code is deterministic-safe (no IO outside activities).

## Phase 3 addendum — Durable DAG runs

**Status:** accepted  **Date:** 2026-04-15

The Phase 2 workflow orchestrator (`services/workflow/orchestrator.ts`) now has
a **durable execution path** via a second Temporal workflow, `dagWorkflow`,
registered on task queue `ruhool-workflows` (override via
`TEMPORAL_DAG_TASK_QUEUE`).

### Enablement

Durable mode is engaged when **all** of the following hold:
1. `TEMPORAL_ADDRESS` is set at boot.
2. The DAG worker starts successfully (logged: `Temporal DAG workflow worker started`).
3. The client called `POST /api/workflow-runs/:id/start` with either
   `?durable=true` or the default (which is `true` when `TEMPORAL_ADDRESS` is set).

Otherwise the orchestrator transparently falls back to BullMQ (when Redis is
healthy) or an in-process `setImmediate` chain.

### Overnight resilience

- Activities use a ≤ 1 hour default `startToCloseTimeout`.
- Retry per activity: `maximumAttempts: 3`, `initialInterval: 10s`,
  `backoffCoefficient: 2`, `maximumInterval: 5m`.
- Temporal replays history on worker/server restart, so long runs (hours,
  overnight) survive crashes and redeploys as long as the Temporal cluster is up.
- Boot reconciliation (`reconcileRunningRuns`) scans
  `workflow_runs WHERE status='running'`:
  - Runs tagged `metadata.mode='temporal'` are left alone (Temporal is authoritative).
  - Runs with stale `startedAt` (> 5 min) and no idempotent marker are marked
    `failed` with `error='server_restart_lost_state'`.

### Signals

- `cancelRun` — aborts the run after the currently-executing activity settles.
- `pauseRun` — the workflow blocks before enqueuing the next step until
  `resumeRun` fires or the run is canceled.
- `resumeRun` — clears pause state.

Routes exposing these: `POST /:id/cancel`, `POST /:id/pause`, `POST /:id/resume`.
The orchestrator sends the corresponding Temporal signal when the run's
`metadata.temporalWorkflowId` is present, else falls back to BullMQ re-enqueue.

### Observability

`GET /api/workflow-runs/:id/handle` returns `{ mode, workflowId?, status? }` —
read this to know whether a run is durable or on the fallback engine.

## Alternatives considered

- **Delete the Temporal containers.** Tempting, and reasonable if Temporal remains
  unused for another quarter. Deferred until we either ship the opt-in path in
  production or formally drop it.
- **Replace with BullMQ only.** BullMQ remains the default queue; Temporal adds
  durability semantics (replay, signals, timers) that BullMQ cannot express.
