# Ruhool Platform — Full Audit Prompt for Codex

You are conducting a **comprehensive production-readiness audit** of the Ruhool platform — a TypeScript multi-agent research/work-management platform built on Hono (API) + Next.js (Web). The platform has just completed multiple rounds of feature work (A/B/C/D series) and bug fixes. I need you to find every remaining issue before deployment.

## Repository

- **Path:** `C:\Users\alhud\platform`
- **Branch:** `ruhool-core-review` (the active development branch)
- **Recent work:** Tags `ruhool-v4` through `ruhool-v7` plus subsequent fixes
- **Tech stack:** TypeScript, Hono (API), Next.js 14 App Router (Web), pnpm workspaces, Vitest, BullMQ, JSON file store
- **Test status:** 270/270 passing, 0 TypeScript errors

## Your Mission

Audit the codebase **across all dimensions** below. For each issue you find, produce a structured finding (format below). Be exhaustive — assume this code will run unattended in production for months serving a real user.

---

## Dimensions to Audit

### 1. Security
- **Prompt injection vectors:** anywhere user input or external tool output reaches an LLM system prompt
- **Authentication / authorization:** API token validation, rate limits, scope checks
- **SSRF:** any `fetch()` to user-supplied URLs without allowlist
- **XSS:** any string interpolated into HTML output (especially report HTML)
- **Path traversal:** any `fs.*` call with user-influenced path
- **Secrets exposure:** API keys/tokens leaking into logs, error messages, SSE events, transcripts
- **Identity hijack:** any way for a user message or tool result to override agent identity (the "B-1 Identity Lock" pattern in `services/agents/specialists.ts`)
- **Action validation:** approval system in `services/chat/architect-actions.ts` — any way to execute unintended actions
- **CORS / CSRF:** for API endpoints
- **Input size limits:** anywhere unbounded user input is processed

### 2. Reliability
- **Unhandled promise rejections:** especially `void (async () => ...)` patterns
- **Race conditions:** concurrent SSE streams, store mutations, BullMQ workers
- **Resource leaks:** intervals, listeners, file handles, AbortControllers not cleaned up
- **Crash recovery:** `services/agent-task-worker.ts` reconcile logic — edge cases
- **Retry storms:** any failure path that could create infinite retry loops
- **Pipeline state machine:** `routes/agent-pipelines.ts` — can a pipeline get stuck in any state?
- **JSON store consistency:** the platform uses a single JSON file (`store.json`) for everything — concurrent writes, partial saves, lost updates
- **Idempotency:** any operation that could double-execute on retry
- **Timeout handling:** every fetch/LLM call should have a timeout

### 3. Performance
- **Unbounded growth:** arrays in `StoreData` (entityMemory, agentTasks, messages, runs.events) — eviction policies?
- **N+1 queries:** loops that hit the store repeatedly per item
- **Synchronous I/O blocking event loop:** especially `fs.*Sync` in hot paths
- **Memory:** large strings retained unnecessarily (full transcripts, full message history)
- **Token waste:** prompts that include redundant or stale context
- **Cache misses:** anything recomputed every request that could be memoized
- **SSE backpressure:** what happens if client is slow to consume?
- **Worker polling intervals:** are they reasonable? Should be event-driven where possible

### 4. Type Safety
- **`any` and `unknown` casts:** especially in `routes/`
- **Missing null/undefined checks:** anywhere `?.` or `!` is used without justification
- **Type assertions vs. validation:** `as Type` without runtime check on parsed JSON
- **Discriminated unions:** missing `default` cases or non-exhaustive switches
- **Optional fields:** are defaults applied consistently?
- **Zod schemas:** are external inputs (request bodies, env vars) validated?

### 5. Architecture / Design
- **Circular dependencies:** especially via lazy `import()` calls
- **God files:** `apps/api/src/routes/chat.ts` is 2200+ lines — what should be extracted?
- **Service boundaries:** is business logic mixed into route handlers?
- **Feature flags:** in `services/flags.ts` — are flags consistently checked? Dead flags?
- **Naming consistency:** Arabic vs English IDs (specialist names — see `SPECIALIST_ALIAS_MAP`)
- **Backward compat fields:** `participants` vs `participantAgentIds` in `ConvRecord` — any drift?
- **Error codes:** `services/errors.ts` — any throw sites that should use RuhoolError but don't?

### 6. UX / Frontend
- **SSE event mismatches:** server emits event X, client listens for Y (recently fixed: `approvals` → `approval_request`)
- **Loading states:** any place that fires off async without showing pending state
- **Error boundaries:** unhandled React errors crashing the page
- **Accessibility:** keyboard nav, aria labels, RTL support
- **Race conditions in components:** stale closures, useEffect dependencies
- **Memory leaks in components:** subscriptions, intervals, event listeners not cleaned up
- **Z-index / overlay correctness:** dropdowns, modals, notifications behind other elements
- **Polling efficiency:** components that poll while not visible

### 7. Data Integrity
- **Soft delete consistency:** `deletedAt` filtering — anywhere it's missed?
- **Migration safety:** `store/defaults.ts` — backfilling fields safely?
- **JSON serialization:** circular refs, Date vs string, `undefined` vs `null`
- **Schema evolution:** new optional fields handled correctly for old records?

### 8. Observability
- **Logging:** consistent use of `bootLogger` vs `console.log`?
- **Log levels:** errors logged at error level, warnings at warn?
- **Sensitive data in logs:** PII, secrets, full prompts?
- **Metrics:** where are key counters/timers?
- **Activity log completeness:** are all important events logged?

### 9. Testing Gaps
- **Critical paths without tests:** identify them
- **Edge cases not covered:** empty arrays, null fields, unicode edge cases
- **Integration gaps:** flows tested only in isolation
- **E2E coverage:** what user flows have no E2E test?

### 10. Documentation / Clarity
- **Misleading comments:** comments that contradict code
- **Missing JSDoc on public APIs**
- **Magic numbers:** hardcoded values without constants
- **Dead code:** unreachable branches, unused exports

---

## Priority Files to Focus On

**Highest priority** (most complex / highest blast radius):
1. `apps/api/src/routes/chat.ts` (2200+ lines, main entry point)
2. `apps/api/src/services/agents/specialists.ts` (specialist dispatch)
3. `apps/api/src/services/chat/architect-actions.ts` (approval system)
4. `apps/api/src/services/agent-task-worker.ts` (background worker)
5. `apps/api/src/routes/agent-pipelines.ts` (pipeline orchestrator)
6. `apps/api/src/services/dispatch/hierarchical-dispatcher.ts`
7. `apps/api/src/store/types.ts` (all type definitions)
8. `apps/api/src/index.ts` (bootstrap)

**Web priority:**
9. `apps/web/src/components/chat/chat-view.tsx` (main chat UI)
10. `apps/web/src/lib/api.ts` (SSE client)
11. `apps/web/src/components/notifications/notification-bell.tsx`
12. `apps/web/src/components/agents/AgentTaskDialog.tsx`
13. `apps/web/src/components/agents/AwaitingUserDialog.tsx`
14. `apps/web/src/components/runs/TranscriptDrawer.tsx`
15. `apps/web/src/components/control/ObservabilityDashboard.tsx`

**Recently changed (extra scrutiny):**
- `apps/api/src/services/security/sanitize-input.ts` (recently rewrote regex)
- `apps/api/src/services/security/trust-wrap.ts` (escapeAttr added)
- `apps/api/src/services/context/window.ts` (token estimation logic)
- `apps/api/src/services/memory/entity-extractor.ts`
- `apps/api/src/services/events/event-bus.ts`
- `apps/api/src/prompts/architect.ts` (architect system prompt)
- `apps/api/src/prompts/manager.ts`

---

## Output Format

Produce a single markdown report with this exact structure:

```markdown
# Ruhool Platform — Full Audit Report
**Date:** YYYY-MM-DD
**Auditor:** Codex
**Total findings:** N

## Summary by Severity
- Critical: N
- High: N
- Medium: N
- Low: N

## Summary by Category
- Security: N
- Reliability: N
- Performance: N
- Type Safety: N
- Architecture: N
- UX: N
- Data Integrity: N
- Observability: N
- Testing: N
- Docs: N

---

## Findings

### F-001: [Short title]
- **Severity:** critical | high | medium | low
- **Category:** security | reliability | performance | type-safety | architecture | ux | data | observability | testing | docs
- **File:** `relative/path/to/file.ts`
- **Line(s):** 123-145
- **Description:** [Clear description of the issue]
- **Reproduction:** [How to trigger this — be specific. If hypothetical, mark as such]
- **Impact:** [What goes wrong, who is affected, how bad]
- **Fix:** [Concrete code change with before/after if useful]
- **Verification:** [How to verify the fix works]
- **Related:** [Other findings that touch the same area]

### F-002: ...

[continue numbering through all findings]

---

## Cross-Cutting Themes
[Group findings into 3-7 themes that show patterns across the codebase, e.g., "Async error handling is inconsistent", "Store mutations lack locking"]

---

## Recommendations Priority Order
1. [What to fix first and why]
2. [What can be deferred]
3. [What requires architectural decision before fixing]
```

---

## Hard Rules

1. **Be specific.** "Could have race conditions" is not useful. Cite the file, line, and exact mechanism.
2. **Be honest about confidence.** Mark hypothetical issues as "potential" vs. confirmed bugs you traced.
3. **No stylistic nitpicks.** Don't report indentation, naming preferences, or "this could be a const". Only real issues.
4. **No false positives.** If you can't trace a clear path from input to bug, don't report it.
5. **Prioritize ruthlessly.** A critical bug in chat.ts is more important than 20 medium issues in unused code.
6. **Don't suggest rewrites.** Suggest minimal-risk fixes. If a section truly needs redesign, say so clearly.
7. **Verify before reporting.** Read enough surrounding context to be sure the issue is real (e.g., a `void` promise is fine if it's intentional and documented).
8. **Find at least these classes of bugs:**
   - SSE event name mismatches between server and client
   - Unhandled promises that swallow errors
   - Store fields that grow unbounded
   - Missing flag checks for new features
   - Inconsistent error code usage
   - Type assertions on unvalidated JSON
   - Race conditions in async loops
   - Memory leaks in React components

---

## Known Recent Fixes (Skip These)

These were just fixed — don't re-report:
- Architect approval event was `'approvals'`, fixed to `'approval_request'`
- Notification bell was `absolute` (clipped behind sidebar), fixed to `fixed` with viewport calc
- Worker [NOTIFY] blocks now parsed and stripped from inbox
- `DELETE_AGENT` action now validates `targetId` against `[a-zA-Z0-9_-]+`
- `entityMemory` now LRU-evicted at 500 entries
- Notification parse/strip now share regex (preserves malformed blocks)
- Token estimation Arabic-aware (2.5 chars/token vs 4 for Latin)
- Sanitizer now uses NFKC normalize + control char strip
- Notification bell recomputes position on scroll/resize
- Pipeline template injection escape via `{ {`
- AwaitingUserDialog pauses polling while user composes
- `wrapToolResult` escapes `toolName` attribute
- Mushakhkhis capability checks cached 5 minutes
- Specialist notifications emitted with try/catch guarantee
- `body.context` now strips all HTML tags + control chars
- Specialist dispatch now forwards `abortController.signal`

---

## Scope Boundaries

**In scope:**
- All files under `apps/api/src/`
- All files under `apps/web/src/`
- `apps/api/src/store/types.ts`
- Worker scripts under `apps/api/src/workers/` and `apps/api/src/services/`
- Configuration under `apps/api/src/config/`
- Build configs (`tsconfig.json`, `vitest.config.ts`)
- Architecture decisions visible in code

**Out of scope:**
- The video/content creation features (`creative` agent, `studio/`, `captions/`, `content-creator` agent prompts) — user has flagged these as non-critical
- Generated test artifacts under `test-results/`
- Node modules
- Git history beyond the last 50 commits
- Cosmetic CSS / Tailwind classes
- i18n strings beyond what affects functionality

---

## Final Output

Produce the audit report as a single Markdown file. Include all findings, regardless of count. The user will feed this report back to Claude Code which will then implement the fixes one by one. Make findings concrete enough that someone unfamiliar with the codebase could verify and fix them.
