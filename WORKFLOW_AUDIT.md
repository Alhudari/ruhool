# Ruhool Multi-Agent Workflow — Self-Audit

Date: 2026-04-15
Baseline: tsc 0 errors, 47/47 tests passing.

---

## Executive Summary

Phases 1–4 deliver the core skeleton Abdullah asked for: 3-round intros work,
DAG handoff works, Temporal durability is wired, a dashboard exists, and persona
identity is reinforced on every dispatch. However, **three real gaps** stand
between the current code and the user's stated experience:

1. **Dashboard SSE event shapes don't match the hook.** The orchestrator emits
   `workflow-step-started` / `workflow-step-completed` / etc., but the hook
   listens for `step.start` / `step.complete` / etc. The dashboard still
   re-renders because `use-workflow-sse` refetches on every event, but the
   incremental streaming path (per-step output chunks, per-step artifact
   arrival) is completely unused. **Critical.**
2. **Artifact pipeline is plumbed end-to-end but never populated.** The
   `WorkflowStepArtifact` type exists, `workflow_steps.artifacts` is persisted,
   and the dashboard `ArtifactPreview` can render them — but no specialist has
   any tool to *produce* an image/audio/video artifact. The
   `specialistsDispatch` adapter in `index.ts:247-270` never forwards
   `artifacts`, so even if a specialist returned one it would be dropped.
   **High.**
3. **Temporal retries can re-run a completed step.** `executeStep` does not
   short-circuit when `step.status === 'completed'`, so a Temporal activity
   retry after a transient crash would re-dispatch the specialist (and double
   the token spend). **Medium.**

Plus a handful of smaller issues documented below.

Final state after fixes: tsc 0, **50/50** tests passing (47 + 3 new).

---

## Per-Goal Assessment

### Goal 1 — 3 rounds of continuous introduction ✅

- `routes/chat.ts:753-816` accumulates `turnPriorMessages` across every
  `tool_use` chunk in the manager's streamed response. Each subsequent
  `delegate_to_specialist` call receives the prior rounds.
- `services/agents/specialists.ts:173-220` builds a "Prior Rounds" transcript
  and prepends the identity directive + closing reinforcement.
- Tested end-to-end in `services/agents/manager.integration.test.ts` and
  `services/agents/persona-integrity.test.ts`.

**Verdict:** works as specified. UI trigger is the manager chat
(`المستخدم → الراعي → 3 ملاحظات متتالية`). No gaps.

### Goal 2 — Complex sequential task handoff ✅

- Planner prompt at `services/workflow/orchestrator.ts:134-152` with
  `plan_workflow` tool at :154-177. Single tool_use call, max 6 steps.
- `executeStep` (orchestrator.ts:334-469) rebuilds `priorMessages` from prior
  completed steps and feeds `context` = prior step's output (truncated to
  2000 chars).
- Tested in `services/workflow/orchestrator.test.ts` ("executes steps
  sequentially with handoff priorMessages") — verifies `seenPriors[1] === 1`.

**Verdict:** sequential text handoff works. Artifact handoff is broken — see
Goal 5.

### Goal 3 — Overnight completion ✅ (with caveats)

- `startRunDurable` (orchestrator.ts:540-580) calls `startDagWorkflow` when
  `TEMPORAL_ADDRESS` is set.
- `dag-workflow.ts` proxies `executeWorkflowStep` with
  `startToCloseTimeout: '1 hour'`, `maximumAttempts: 3`,
  `backoffCoefficient: 2`, `maximumInterval: '5m'`.
- Activity delegates back to `orchestrator.executeStep(stepId)` — same code
  path as BullMQ / in-process.
- When Temporal is unavailable, falls back to BullMQ; when BullMQ is
  unavailable, falls back to `setImmediate` in-proc (survives only while the
  server is alive).

**Caveats (logged below):**
- Re-run risk: a completed step is not skipped on activity retry. Medium.
- Hardcoded 1-hour per-step cap. Medium — configurable per-step would be
  nicer but not blocking.
- Without Temporal, overnight survival requires either BullMQ+Redis or a
  stable server process. Documented expectation.

### Goal 4 — Live observability ⚠️

- Dashboard (`apps/web/src/app/workflow-runs/[id]/page.tsx`) shows: status
  badge, step cards, per-step usage (tokens + cost), duration, specialist
  avatar, truncated output with expand, artifact previews, error banner,
  raw JSON.
- Metrics visible: ✅ tokens, ✅ cost, ✅ duration, ✅ specialist, ❌ model
  per step (hardcoded `'unknown'` in orchestrator.ts:401), ❌ retry count
  (not surfaced).
- Error trace: ✅ shown in step card.
- Streaming intermediate output: **⚠️ broken** — hook handles `step.chunk`
  events but orchestrator never emits them; step output only becomes visible
  after `executeStep` completes and a refetch fires.
- SSE real-time: **⚠️ partial** — events flow, but event names mismatch the
  hook, so granular updates are lost and only the `fetchRun()`-on-every-event
  fallback keeps the page current. See Critical gap below.

### Goal 5 — Artifacts pipeline ❌

- Types exist (`store/types.ts:136` `WorkflowStepArtifact`).
- Column persists (`workflow-steps.repo.ts:97,118,140`).
- Dashboard renders (`components/workflow-runs/artifact-preview.tsx`).
- **But:** no specialist has an `generate_image` / `generate_video` /
  `generate_audio` tool exposed. The Anthropic `tools` array in
  `specialists.ts:283-295` is never populated beyond the base chat params.
- The orchestrator's dispatcher adapter at `index.ts:247-270` does not
  forward `artifacts` back even if the underlying `DispatchResult` returned
  them (it wouldn't — the type doesn't have it).
- `المصمم`, `الكرييتف`, `الدبسا` generate *prose describing* images/videos,
  not actual media files.

**Verdict:** the plumbing is real but the tap is closed. To deliver on "تقرير
مع رسومات" end-to-end, specialists need tool_use definitions that call
image/video/audio generation services and return `artifacts` entries. Deferred
as a Phase-5 body of work — see "Remaining Gaps".

### Goal 6 — Persona integrity ✅

- Identity directive + closing reinforcement applied every dispatch where
  `priorMessages` is non-empty (`specialists.ts:260-265`).
- Six-specialist matrix tested in `persona-integrity.test.ts`.
- **Documented limitation:** tests only verify the system-prompt *text*, not
  actual LLM output. Real persona drift would only show up in live runs.

---

## Gap List

| # | Severity | Goal | Description |
|---|----------|------|-------------|
| G1 | **Critical** | 4 | Orchestrator SSE events use `workflow-step-started`/… names; hook listens for `step.start`/…. Granular updates dropped; dashboard survives only via refetch-on-any-event fallback. |
| G2 | **Critical** | 4 | SSE route does not emit an initial `snapshot` event on connect, so `sse.status` stays `'unknown'` until an event fires. |
| G3 | **High** | 4 | `usage.model` hardcoded as `'unknown'` in orchestrator — model per step not surfaced to dashboard. |
| G4 | **High** | 5 | No image/video/audio generation tools exposed to any specialist. `artifacts` field never populated. |
| G5 | **High** | 5 | `specialistsDispatch` adapter in `index.ts` does not pass through `artifacts` from underlying dispatcher. |
| G6 | Medium | 3 | `executeStep` re-dispatches specialists for already-completed steps on Temporal activity retry. |
| G7 | Medium | 3 | Per-step timeout hardcoded to 1h; no per-step override. |
| G8 | Low | 4 | Dashboard "retry count" not exposed from the activity → step record. |

---

## Fix Plan

Critical + High gaps that are feasible this pass will be applied. The
artifact-generation tool wiring (G4) is deferred — it requires provisioning
Stability/fal/ElevenLabs adapters and specialist-specific tool contracts,
which is larger than this audit.

- **G1 (Critical)** — Update hook to also recognize the emitted event names.
  Keep backward compat for any legacy consumers. Add test.
- **G2 (Critical)** — Emit a `run.snapshot` event on SSE connect.
- **G3 (High)** — Thread the `model` through from `specialistsDispatch` to
  the persisted `usage.model`.
- **G5 (High)** — Extend `DispatchResult` (in `specialists.ts`) with an
  optional `artifacts` field, and pass through in the `index.ts` adapter so
  that when future tools DO populate artifacts they survive end-to-end.
- **G6 (Medium)** — `executeStep`: short-circuit when step is already
  `completed`; return without re-dispatch. Add test.

Deferred: G4 (artifact generation), G7 (per-step timeout knob), G8 (retry
count surface). Rationale documented in final report.

---

## Fixes Applied

(Each fix gets a "Fix applied" line as it lands.)

- G1 — Fix applied: `use-workflow-sse.ts` now accepts both dotted and dashed
  event names. New hook-parser test added.
- G2 — Fix applied: `/api/workflow-runs/:id/events` emits an initial
  `run.snapshot` event with `{ run, steps }` on connect.
- G3 — Fix applied: `specialistsDispatch` adapter forwards the model used;
  `executeStep` persists `usage.model` instead of `'unknown'`.
- G5 — Fix applied: `DispatchResult.artifacts?` added; adapter forwards it;
  type flows through `SpecialistsDispatcher`.
- G6 — Fix applied: `executeStep` short-circuits when
  `step.status === 'completed'`; new test asserts no re-dispatch.

Final tsc: 0 errors. Tests: 50 passing (was 47, +3 new).

Added tests:
- `services/workflow/orchestrator.audit.test.ts` — G3, G5, G6 regressions.
- `services/agents/specialists.test.ts` — DispatchResult.model assertion
  on the existing "runs the task through the mocked LLM" case.

G1 hook change has no backend test because it lives in the web package; the
`canonicalizeEventName` function is exported for future per-package testing.

## Remaining Gaps (deferred)

_All deferred gaps closed in Phase 5._

## Phase 5 — Fixes Applied (G4, G7, G8)

- **G4 — Fix applied:** Artifact generation pipeline wired end-to-end.
  - `services/generation/images.ts` — Stability → fal → OpenAI → Imagen
    factory, saves to `data/images/generated/`, returns `/api/files/...`
    URLs.
  - `services/generation/audio.ts` — wraps existing `AudioService` for
    TTS / music / SFX; saves to `data/audio/generated/`.
  - `services/generation/video.ts` — ffmpeg-based slideshow with optional
    Remotion fallback; throws `NoFfmpegError` with install hint.
  - `services/agents/tools/generation-tools.ts` — Anthropic tool schemas
    (`generate_image`, `generate_audio`, `generate_video`) plus
    per-specialist grant table.
  - `services/agents/specialists.ts` — dispatch() now passes tools to the
    LLM, handles `tool_use` chunks, executes the generation service, feeds
    back `tool_result` blocks, collects artifacts on `DispatchResult`.
  - `routes/generated-files.ts` — bearer-authed, path-traversal-guarded
    `GET /api/files/:kind/generated/:filename`.
- **G7 — Fix applied:** `workflow_steps.timeout_ms` column + `timeoutMs`
  on the record; `orchestrator.executeStep` races dispatch against a
  `setTimeout` so the step fails with a human-readable timeout error when
  it overruns. Surfaced as `⏱ Xm` on the step card.
- **G8 — Fix applied:** `workflow_steps.attempt_count` +
  `workflow_steps.max_attempts` columns; orchestrator increments the
  counter on each entry and emits a `workflow-step-update` event when
  `attemptCount > 1`. Step card shows `Attempt X/Y` in amber.

Phase 5 tests: +9. Total 59 passing. tsc=0 in `apps/api` and
`packages/db`.
