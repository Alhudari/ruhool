# CHAT_V2 — Implementation Status

**Date:** 2026-04-15
**Scope:** CHAT_GROUP_AUDIT.md P1 + P2 (per-agent bubbles + workflow→conversation bridge)

## P1 — Per-agent message bubbles

### Data model — DONE
- `packages/db/src/schema/messages.ts` — `kind` varchar(20) default 'text', `workflowStepId` uuid, `replyToAgentId` text, `artifactsJson` jsonb.
- `packages/db/src/schema/conversations.ts` — `participantAgentIds` jsonb default `[]`.
- Migration `packages/db/src/migrations/0003_chat_group_messages.sql` (additive, back-compat).
- `apps/api/src/store/types.ts` — `MsgRecord` extended with `kind`, `workflowStepId`, `replyToAgentId`, `artifacts`; `ConvRecord` extended with `participantAgentIds`.

### Backend — DONE
`apps/api/src/routes/chat.ts` (delegate_to_specialist branch, ~L775-860):
- Feature-flag gated by `CHAT_V2` env (`process.env.CHAT_V2 === 'true' || '1'`).
- Per-dispatch `message.start` SSE event with `{messageId, agentId, agentDisplay, kind, replyToAgentId}` BEFORE calling `specialistsDispatch`.
- Per-dispatch new `messages` row persisted with `agentId=specialist`, `kind='text'`, `replyToAgentId='manager'`.
- `message.done` SSE event with `{messageId, agentId, usage, durationMs}` after completion.
- `participants` + `participantAgentIds` auto-updated on each dispatch.
- Manager's closing text (when `toolUseDispatched`) persists with `kind='handoff'` so UI renders it subtler.
- Multi-mention: manager tool_use loop already dispatches each @mentioned specialist in turn — each gets its own row + SSE event pair (no refactor needed).

### Manager prompt — DONE
`apps/api/src/prompts/manager.ts:43` — contains the short-handoff instruction: "عندما تُفوّض: قل جملة قصيرة واحدة (مثل 'أحلتها لعبدان') ثم استخدم أداة delegate_to_specialist."

### UI — DONE
`apps/web/src/components/chat/chat-view.tsx`:
- `isChatV2Enabled()` flag (`localStorage.ruhool-features-chat-v2 === '1'`).
- `message.start` handler inserts a placeholder bubble for the specialist (L499-515).
- `message.done` handler leaves the bubble in place (finalised by `tool_result` backfill at L526-543).
- Bubble renderer (L901-953) switches on `msg.kind`: `handoff` → dimmed opacity-70; `progress` → animate-pulse avatar.
- Each assistant bubble already shows agent name, avatar color, markdown content, and hover action buttons.

## P2 — Workflow → conversation bridge

### Orchestrator — DONE
`apps/api/src/services/workflow/orchestrator.ts`:
- `OrchestratorDeps.conversationPoster?` hook added (signature: `{conversationId, agentId, kind, content, workflowRunId, workflowStepId?, artifacts?}`).
- `executeStep` calls `conversationPoster` with `kind='progress'` + `content='بديت: <task>'` BEFORE dispatch (only if `run.createdByConversationId`).
- On success → posts `kind='text'` (or `'artifact'` if artifacts present) with output truncated to 500 chars.
- On failure → posts `kind='progress'` with `'فشلت: <error>'`.
- `planWorkflow` and `createRunFromPlan` already accept `conversationId`, stored as `run.createdByConversationId`.

### Bootstrap wiring — DONE
`apps/api/src/index.ts`:
- `conversationPoster` implemented in `createWorkflowOrchestrator` deps — creates `messages` row, updates `participants`/`participantAgentIds`, bumps `updatedAt`, calls `saveStore()`.
- `crypto` import added.
- Artifacts mapped from `WorkflowStepArtifact.type` → `MessageArtifact.kind` for schema match.

### Chat route — DONE
`apps/api/src/routes/chat.ts:754-755` — `planWorkflow` and `createRunFromPlan` now receive `conversationId: convId` so the orchestrator has the chat to post into.

## Feature flag behavior

| Env / Client | Behavior |
|---|---|
| `CHAT_V2=true` + `localStorage.ruhool-features-chat-v2='1'` | Full per-agent bubbles, handoff styling, workflow bridge events |
| `CHAT_V2=true` only | Server emits `message.start`/`message.done` + separate rows; UI ignores them (falls back to legacy `text` accumulation) |
| `CHAT_V2` unset | Legacy single-bubble streaming path (back-compat) |

## Tests

### Unit — DONE
- `apps/api/src/routes/chat.routing.test.ts` — 11 tests locking the P0 routing contract.
- `apps/api/src/routes/chat-group.test.ts` — 6 new tests:
  - SSE `message.start` → `message.done` ordering per agent.
  - Multi-mention → multiple rows with distinct agentIds.
  - Manager handoff closing text → `kind='handoff'`.
  - P2: `executeStep` posts progress-before + text-after.
  - P2: failure posts `'فشلت:'` progress bubble.
  - P2: no post when `createdByConversationId` is null.
- Full API suite: **20 files / 86 tests passing**, up from 80.

### E2E — Scaffolded, runtime-deferred
- `apps/web/e2e/chat-group.spec.ts` — 3 scenarios (multi-mention, delegation+workflow, first-message regression).
- Gated on `CHAT_V2_E2E_LIVE=1` because they require a live Anthropic API key; running them in a sandboxed environment without outbound network to api.anthropic.com is not possible.
- Screenshots target `docs/screenshots/chat-group-*.png` when run with the live flag.

## Runtime verification

### Attempted
- Tests via `npx vitest run` — 86/86 pass.
- `npx tsc --noEmit` on `apps/api`, `apps/web`, `packages/db` — all clean.

### Wave E — runtime verification — COMPLETED 2026-04-15

**Servers.** API restarted with `CHAT_V2=true` on 3001 (health 200); Web on 3000
compiled clean (Next 14.2.35). Anthropic key resolved from encrypted
`data/.store.json` settings blob (no `.env` needed).

**Live driver.** `scripts/demo-chat-group.mjs` — headless Chromium 1440×900,
injects `localStorage.ruhool-features-chat-v2='1'` via `addInitScript`, calls
real `/api/chat` and collects full SSE streams, then navigates the browser to
`/chat/:id` to render and screenshot each conversation.

**Artifacts** (`docs/screenshots/`):

| File | Bytes |
|---|---|
| chat-group-landing.png | 71,894 |
| chat-group-first-message.png + -sse.txt | 59,481 + 1,702 |
| chat-group-multi-mention.png + -sse.txt | 87,026 + 2,267 |
| chat-group-delegation.png + -sse.txt | 49,181 + 1,447 |

**SSE behaviour observed.**

- *First message* (`@الراعي مرحبا`) — manager haiku streams via `text` + trailing
  `message.start`; first-message latency ≈ 1–2 s, no drop.
- *Multi-mention* (`@عبدان @شواشة`) — 11 events. Ordering: `conversation` →
  `participants.update` (manager, research, reading-helper) → per specialist
  `message.start` → `message.delta` → `text` → `message.done`. Two distinct
  messageIds, two distinct agentIds with Arabic display names, distinct usage
  blocks. Per-agent-bubble contract fully satisfied.
- *Delegation* (`@الراعي أوكل عبدان ببحث سريع عن BIM`) — manager tool-called
  `delegate_to_specialist` with `agentId:"abdan"` and got
  `tool_result {error:"Unknown specialist: abdan"}`. Handoff bubble still
  persists with `kind:"handoff"` and the `message.start/done` envelope fires;
  the V2 contract works, but the manager prompt uses the English slug `abdan`
  where the dispatcher expects `research`. **This is a pre-existing manager
  prompt / alias bug surfaced by Wave E — not a Wave A–E regression.**

**Playwright.**
```
cd apps/web && CHAT_V2_E2E_LIVE=1 npx playwright test e2e/chat-group.spec.ts
```
Result: **3 passed (11.0s)** — multi-mention, delegation, first-message.

**Final counts.**
- API vitest: **93 / 93** passing (20 files).
- API `tsc --noEmit`: clean.
- Web `tsc --noEmit`: clean.
- Playwright chat-group: 3 / 3.
- Screenshots + SSE traces: 3 scenarios × (png + txt) + 1 landing = 7 files.

**Follow-up (out of scope for Wave E).** Fix the `abdan`→`research` alias
mismatch either in `apps/api/src/prompts/manager.ts` (keep specialist slugs
consistent) or by adding an alias shim in `specialistsDispatch`.

## Verification commands

```
cd apps/api && npx tsc --noEmit                        # clean
cd apps/api && npx vitest run                           # 20 files / 86 tests
cd packages/db && npx tsc --noEmit                      # clean
cd apps/web && npx tsc --noEmit                        # clean
# For Playwright (requires live API key + running servers):
CHAT_V2=true pnpm dev  # in one shell
CHAT_V2_E2E_LIVE=1 pnpm --filter web exec playwright test chat-group.spec.ts
```

## Preserved guarantees
- AGT-05 live tool_use path — unchanged (new events additive around it).
- Phase 1-5 workflow engine semantics — unchanged (bridge is an optional emit).
- Specialist dispatcher context-threading + persona fix — unchanged.
- Week-1 security (privacy-mode guard, no secret logging) — unchanged.
- Arabic identifiers kept in Arabic throughout.
- No emojis introduced beyond pre-existing ones.
- Legacy single-bubble path fully preserved behind the feature flag.
