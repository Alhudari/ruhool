# Fix notes — 2026-04-15

Two production bugs in Ruhool chat. Investigation + fixes below.

## Bug 2 — المصمم intercepts messages meant for الراعي

### Reproduction (before fix)

```bash
curl -N -s -X POST http://127.0.0.1:3001/api/chat \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary @body.json
# body: {"conversationId":"<new>","message":"الراعي عرّفوا بعضكم في 3 جولات"}
```
SSE emitted `{"agentId":"architect"}` and the architect responded
("أنا المصمم، لست الراعي") even though the user's message named الراعي.

### Root cause

`apps/api/src/routes/chat.ts:145` — `architectKeywords` contained
`"الراعي"` (= `\u0627\u0644\u0631\u0627\u0639\u064A`).  Pre-Week-1 rename,
"الراعي" used to refer to the architect agent.  After the rename, "الراعي" =
**manager**, but the keyword list was never updated, so any Arabic message
containing that word fell into the architect intent whenever mention detection
had been bypassed (e.g. vocative without `@`, or a playmaker override path).

Previous `MENTION_MAP` fix covered only the `@mention` regex path; the
`detectIntent()` fallback remained poisoned.

### Fix

Removed `"الراعي"` from `architectKeywords` at `routes/chat.ts:145`.
Now any message whose intent can't be otherwise classified falls through to the
default `return 'manager'` at `routes/chat.ts:148`.

## Bug 1 — First message in conversation is dropped

### Reproduction (before fix)

UI-side only (backend curl always streamed correctly). Steps:

1. Load `/` (home page), type a message, press Enter.
2. `handleSubmit()` sets `isChatting=true`; `ChatView` mounts with
   `conversationId={null}`, sends the message via `apiStream('/api/chat', …)`.
3. Server emits an early `conversation` SSE event with the new conversation id.
4. `onConversationCreated(id)` in `home-page.tsx` called
   `router.replace('/chat/${id}')` **mid-stream**.
5. Next.js navigated away from `/` → the mounted `ChatView` unmounted while the
   `fetch`/reader was still running.
6. The new `/chat/[id]/page.tsx` mounted a fresh `ChatView` whose mount effect
   fetched `/api/conversations/:id/messages`. That fetch returned before the
   orphaned stream's `done` event (the assistant message is only persisted at
   `done`, `chat.ts:890`). Result: UI showed the user message with no reply.
7. User resends — conversation now has the first assistant response persisted
   from the orphaned stream, and the second round works normally. Exactly the
   "first message eaten, second works" symptom.

### Root cause

`apps/web/src/components/home/home-page.tsx:183` — `router.replace()` triggers a
Next.js route change that unmounts the active `ChatView` before the SSE stream
finishes.  `chat-view.tsx` tries to guard against propConvId changes (lines
113-131), but that guard only runs within the same component instance; a route
change destroys the component regardless.

### Fix

Replaced `router.replace('/chat/${id}')` with
`window.history.replaceState(null, '', '/chat/${id}')`.  The URL still updates
to the canonical `/chat/:id` path so it's shareable/bookmarkable, but no Next.js
navigation is triggered — the active `ChatView` stays mounted and the stream
completes normally.  On a real browser refresh Next.js will render
`/chat/[id]/page.tsx` as before.

## Instrumentation left in place

Added three `chat-route-trace` structured logs in `routes/chat.ts` at the entry
to `POST /api/chat`, after mention detection, and after agent resolution. Filter
with: `grep '"msg":"chat-route-trace"'`. Keys: `step` (`entry` |
`after-mention` | `after-agent-resolution`), `conversationId`, `bodyAgentId`,
`mentionAgentId`, `detectedAgent`, `messageText` (truncated to 80 chars).

## Regression tests

`apps/api/src/routes/chat.routing.test.ts` (new) — 7 cases:

- `detectIntent('الراعي') === 'manager'` (bare)
- `detectIntent('الراعي عرّفوا بعضكم ...') === 'manager'`
- `detectIntent('أنشئ وكيل جديد') === 'architect'` (architect path still works)
- `detectIntent('create agent please') === 'architect'`
- `detectIntent('عدّل وكيل عبدان') === 'architect'`
- `detectMention('@الراعي مرحبا')` → `manager`
- `detectMention('@المصمم …')` → `architect` (unchanged)
- `detectMention('أنتالراعي …')` → `null` + `detectIntent` still returns
  `manager` (concatenated-word edge case)
