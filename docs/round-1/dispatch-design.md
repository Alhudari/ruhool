# Round 2 execution spec — hierarchical agent dispatch

This is Round 2's contract. Round 1 does **not** implement any of it — this
doc is the spec the AI/LLM engineer writes now so Round 2 has a clear target.

## Feature flag

- `ENABLE_HIERARCHICAL_DISPATCH` env var (read server-side only).
- Default **off**. When off, `apps/api/src/routes/chat.ts` behaves exactly as
  today (user → chosen agent → reply).
- When on, the routing layer described below engages for messages directed at
  the CEO or a department manager. `@worker-id` mentions still bypass the
  hierarchy.

## The hierarchy

Sourced from `data/agent-org.json` at request time (no caching; the file is
small and the read is cheap). Shape today:

```
ceo:       manager
research:  research      workers [reading-helper, research-companion, comparator]
writing:   writing-critic workers [sayyaq]
ops:       munazzim       workers [tasks-agent, mudawwin, analyst]
creative:  content-creator workers [creative]
system:    architect      workers [mushakhkhis, fatin, playmaker, clippy]
```

## Routing tree

```
user → CEO           ── decides which dept is responsible
      ↓
      dept manager   ── decides which worker(s) to engage, or handles itself
      ↓
      worker(s)      ── returns focused output
      ↑
      dept manager   ── synthesizes worker output into single reply
      ↑
      CEO            ── optional final synthesis if multi-dept; otherwise pass-through
```

- Every hop logs to audit with `action: 'dispatch.<hop>'` and `source:
  'platform:auto'`.
- Each hop has its own cost budget; totals surface in the Round 1 `CostPill`.

## CEO prompt contract

CEO (الراعي) sees only the dept manager list as its tool surface. Its
system prompt must end with something like:

> أنت الراعي. أمامك قائمة بمدراء الأقسام فقط. مهمتك أن تقرر أي قسم مسؤول عن
> الرسالة الحالية وتحولها إلى مديره. لا تعالج الطلب بنفسك إلا إذا كان طلب
> توجيه عام. إذا لم تعرف، قل "لا أعرف".

The tool (function-calling) spec is a single `delegate_to_department` tool
with `department: string` and `reason: string`. CEO returns one call per
turn. Multi-dept fan-out is a Round 3 concern.

## Dept manager prompt contract

Each dept manager sees only its workers as a tool surface. Its system prompt
must name every worker, their specialty, and the "when to use which" rule.

Example (research dept, عبدان):

> أنت عبدان، مدير قسم البحث. تحت إدارتك:
>   - شواشة: قراءة موجهة للأوراق الكاملة.
>   - رمّان: الرفيق اليومي، يرد عند الحاجة لتوجيه شخصي.
>   - رمّانة: المقارنة بين أوراق متعددة.
> قواعدك: (1) فوّض للعامل المناسب باستخدام الأداة delegate_to_worker
> (2) اجمع ردود العمال في رد واحد متماسك باللغة العربية الفصحى
> (3) إذا فشل عامل، حاول عاملًا بديلاً أو قل "لا أعرف".

Tool spec: `delegate_to_worker(worker: string, task: string)`. The manager
may call up to **3 workers per turn** (cap enforced in the dispatcher).

## Worker contract

Workers are unchanged from today. They receive a task string + context from
the manager and return a focused answer. They do not know about the
hierarchy and they do not delegate further.

## Synthesis

After all workers return, the manager receives:

```
<worker-1-id>: <output>
<worker-2-id>: <output>
…
```

It produces **one** reply in the user's active language. The reply must not
paste raw worker output verbatim — it must synthesize.

The CEO only re-synthesizes if more than one dept was engaged in one turn
(Round 3). In Round 2, CEO just passes the manager's synthesis through
with the routing chain annotated.

## Cost cap

- Per-turn hard cap: **50¢ USD**. If the dispatcher's running total exceeds
  this before synthesis, abort with `"لا أعرف — تجاوز الحد المسموح للتكلفة."`
- Cap is configurable in `store.limits.hierarchicalDispatchUsd` (number,
  optional; default 0.5).
- Costs are recorded per-hop in the run's metadata so `CostPill` can show
  the breakdown.

## Fallback on worker failure

- If a worker throws or returns empty: manager retries **once** with the
  same task, then skips that worker and synthesizes with the remaining
  workers' outputs.
- If zero workers returned usable output: manager surfaces `"لا أعرف —
  تعذّر الحصول على إجابة من الفريق."` and logs to audit.

## UI indicator

A small chain badge under the assistant message:

```
الراعي ← عبدان ← رمّانة
```

Clickable to expand per-hop cost + tokens. Component file:
`apps/web/src/components/chat/DispatchChain.tsx` (new in Round 2). Colors
match the source agent's theme token.

## Legacy path preservation

- `@` mentions of a worker (`@sayyaq …`) skip the hierarchy entirely.
- `/agents/:id/chat` direct-chat pages bypass the hierarchy.
- Group chats where the user pre-picked the participants bypass the
  hierarchy (the user already decided who's in the room).

## Rollout

1. Merge behind `ENABLE_HIERARCHICAL_DISPATCH=false`. Nothing changes for
   users.
2. Add an integration test with a mock LLM proving routing works (Round 2
   QA deliverable).
3. Flip the flag to `true` for the user alone (env var).
4. Monitor audit log for dispatch.* entries for a week.
5. Consider default-on after that.

## Out of scope for Round 2

- Multi-dept fan-out from CEO in a single turn (Round 3).
- Per-worker memory of the current dispatch chain (Round 3+).
- Automatic re-org of departments from chat ("add x agent to writing").
- A dispatch timeline visualization.

## Files Round 2 will create

- `apps/api/src/services/dispatch.ts` — orchestration logic.
- `apps/web/src/components/chat/DispatchChain.tsx` — UI indicator.
- `apps/web/e2e/hierarchical-dispatch.spec.ts` — Playwright integration
  test with mock LLM.

## Files Round 2 will modify

- `apps/api/src/routes/chat.ts` — gate hierarchy behind feature flag.
- `apps/api/src/prompts/specialists/manager.ts` — CEO prompt.
- `apps/api/src/prompts/specialists/research.ts`,
  `writing-critic.ts`, `munazzim.ts`, `content-creator.ts`,
  `architect.ts` — dept manager prompts.
- `apps/api/src/store/types.ts` — add `limits.hierarchicalDispatchUsd`.
