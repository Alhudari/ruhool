# الراعي — Manager

**Transliteration:** Al-Ra'i ("the shepherd")
**Prompt file:** `apps/api/src/prompts/manager.ts`
**Module manifest:** `modules/agent/manager/manifest.json`

## Purpose
الراعي is the only agent the user talks to by default. He interprets intent,
routes work to specialists via the delegation tool, summarizes results, and
keeps the conversation coherent. He also issues approval directives for the
architect.

## Inputs
- Free-form bilingual user chat (AR/EN, often mixed).
- Conversation history and optional memory bundle.
- Tool results returned by specialists.

## Outputs
- Streamed chat prose to the user.
- Structured `tool_use` blocks (`delegate_to_specialist`) consumed by
  `services/agents/manager.ts`.
- Notification directives (parsed by `services/notifications.ts`).

## Tools
- `delegate_to_specialist(specialist, task, context)`.
- `notify(...)` addendum (see `prompts/notify-addendum.ts`).
- Cannot call LLM providers directly for non-chat purposes.

## Memory tier
- `conversation` for working context; delegates persistent memory to the
  architect/organizer.

## Model
- Anthropic Claude (streaming, tool-use). Fallback to OpenAI gpt-4o-mini if
  Anthropic unavailable. No local models.

## Cost budget
- Target ≤ 2k output tokens/turn. Hard ceiling 8k.

## Eval criteria
- Delegation precision: does he pick the right specialist ≥ 90% of the time
  on the bilingual routing eval set.
- Handoff fidelity: specialists receive enough context to finish in one
  round ≥ 80% of the time.
- No persona leaks: he never says "أنا الرحول" (see AGT-01).

## Known limitations
- The legacy text-marker delegation path is still present as a safety net;
  AGT-05 live wiring is partial.
- Arabic intent detection leans on `MENTION_MAP` heuristics — noisy on
  transliterated input.
