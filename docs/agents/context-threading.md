# Context Threading (Phase 1)

Specialists dispatched by الراعي (Al-Ra'i, manager) can now see what earlier
specialists produced in the **same user turn**. This unlocks multi-specialist
chains where each agent builds on the last instead of starting cold.

## How it flows

1. User sends one message — e.g. *"ابحث عن BIM ثم لخّص النتائج ثم انقدها"*.
2. Manager's Anthropic response contains multiple `tool_use` blocks, one per
   specialist it wants to engage.
3. For each `tool_use` the chat SSE loop:
   - increments `roundCounter` (1-indexed per turn),
   - snapshots `turnPriorMessages` (all specialist outputs recorded so far
     this turn),
   - calls `specialistsDispatch({ specialist, task, priorMessages, roundNumber, deps })`,
   - appends the specialist's output to `turnPriorMessages` with `{ role:'assistant', agent, agentDisplay, content }`.
4. Inside `dispatch`, `buildPriorRoundsTranscript(priorMessages, specialist)`
   prepends an Arabic/English transcript section to the base system prompt.

## Turn numbering

`roundNumber` is **1-indexed per user turn**. Round 1 always receives an empty
`priorMessages` array (the first specialist has nothing to build on). Round 2
sees round 1's output, round 3 sees rounds 1+2, etc.

## Truncation limits

- **Per-message:** each prior message content is sliced to the first
  `PRIOR_MESSAGE_TRUNCATE = 600` characters.
- **Count cap:** only the most recent `PRIOR_MESSAGE_MAX = 8` messages are
  rendered.

Both constants live in `apps/api/src/services/agents/specialists.ts` and can
be tuned there.

## Disabling via tool param

The `delegate_to_specialist` tool schema (in
`apps/api/src/services/agents/manager.ts`) now accepts an optional
`pass_prior_context: boolean` (default `true`). When the manager emits
`pass_prior_context: false`, the chat loop passes `priorMessages: []` to the
dispatcher — useful when a specialist should intentionally be isolated from
what came before.

## Conversation history

`dispatch` also accepts `includeConversationHistory?: boolean` (default
`true`). When enabled and the `priorMessages` array contains prior user
turns, the transcript includes a *سياق المحادثة / Conversation Context*
preamble showing the last two user messages (each truncated to 600 chars).
Pass `false` to suppress even when user turns are present.

## Example 3-round flow

User: *"ابحث عن أحدث أدبيات BIM للمباني العامة، ثم لخّص أهم 3 نقاط، ثم انقد الصياغة."*

| Round | Specialist | `priorMessages` passed | System-prompt addition |
|-------|-----------|------------------------|------------------------|
| 1 | عبدان (abdan) | `[]` | (none — base prompt only) |
| 2 | شواشة (shwasha) | `[{assistant, agent:'abdan', content:'… نتائج البحث …'}]` | `--- Prior Rounds ---\n[Round 1 — عبدان (abdan)]\n{600-char excerpt}\n--- نهاية السجل ---\nالآن، شواشة، أكمل بناءً على ما قيل سابقاً.` |
| 3 | الصفرا (alsafra) | `[{…abdan…}, {…shwasha…}]` | Transcript with both prior rounds |

## Zero-behavior guarantee for single-round chats

When the manager emits exactly one `tool_use` block (the common case), round 1
receives `priorMessages: []`. `buildPriorRoundsTranscript([])` returns an
empty string, and the dispatcher uses the base system prompt unchanged — byte
for byte identical to pre-Phase-1 behavior.

## Persona Integrity

Once a specialist can *see* prior rounds, it can also be tempted to *sound
like* whoever spoke before it — e.g. شواشة reading عبدان's dry research
output and answering in عبدان's clinical tone instead of her own warm
reading-helper voice. To prevent that, every system prompt with a non-empty
transcript now has three reinforcement layers wrapping the base prompt:

1. **Identity directive (prepended, above the base prompt).** Names the
   target in Arabic + transliteration and explicitly forbids impersonating
   any agent visible in the transcript.
2. **Transcript boundary.** The prior-rounds block opens with
   `--- سجل الجولات السابقة (للسياق فقط — لا تقلّد أسلوبهم) ---` and each
   prior message is wrapped in guillemets `«…»` so the model clearly sees
   them as *other agents' speech*, not prose to continue.
3. **Closing reinforcement (appended, after the transcript).** Repeats the
   target's name and instructs the model to answer in *its* voice, not in
   the voice of whoever it just read.

### Before / after example

**Before (Phase 1):**

```
{RESEARCH_SYSTEM_PROMPT for عبدان}

--- سجل الجولات السابقة / Prior Rounds ---

[Round 1 — شواشة (shwasha)]
يا حلاتها القراءة، خلّنا نتمشّى في النص براحة.

--- نهاية السجل ---

الآن، عبدان، أكمل بناءً على ما قيل سابقاً.
```

**After (persona integrity):**

```
أنت عبدان (Abdan) فقط. لا تتقمّص شخصية أي وكيل آخر تراه في سجل الجولات. حافظ على صوتك وأسلوبك وشخصيتك المميزة.
You are عبدان and ONLY عبدان. Do NOT adopt the voice, tone, or persona of any agent you see in the prior rounds transcript. Keep your own distinct voice, style, and personality.

{RESEARCH_SYSTEM_PROMPT for عبدان}

--- سجل الجولات السابقة (للسياق فقط — لا تقلّد أسلوبهم) ---
--- Prior Rounds (context only — DO NOT mimic their style) ---

[Round 1 — قاله شواشة / said by شواشة]
«يا حلاتها القراءة، خلّنا نتمشّى في النص براحة.»

--- نهاية السجل ---

تذكير: أنت عبدان. أجب الآن بأسلوبك أنت بناءً على ما قرأت، لا بأسلوب من قرأت لهم.
Reminder: You are عبدان. Respond now in YOUR voice based on what you read, NOT in the voice of whom you read.

الآن، عبدان، أكمل بناءً على ما قيل سابقاً.
Now, عبدان, continue building on what was said.
```

### Zero-behavior for single-round chats

When there are no prior messages (round 1, `priorMessages: []`, or
`pass_prior_context: false`), `buildPriorRoundsTranscript` returns an empty
string and the dispatcher falls through to the **unmodified base prompt** —
no identity directive, no closing reinforcement, no boundary markers. The
reinforcement is only emitted when it would actually be needed. This keeps
the single-round path byte-for-byte identical to pre-Phase-1 behavior.

## Code entry points

- `apps/api/src/services/agents/specialists.ts` — `dispatch`,
  `buildPriorRoundsTranscript`, `PriorMessage`.
- `apps/api/src/services/agents/manager.ts` — `delegate_to_specialist` tool
  schema with `pass_prior_context`.
- `apps/api/src/routes/chat.ts` — tool_use SSE loop that threads
  `turnPriorMessages` across sequential dispatches.
- `apps/api/src/services/agents/specialists.test.ts` — unit tests.
- `apps/api/src/routes/chat.test.ts` — integration test for 2-round flow.
