# مهام — Tasks agent

**Transliteration:** Mahaam
**Prompt file:** `apps/api/src/prompts/specialists/tasks-agent.ts`

## Purpose
Translates loose user requests into concrete task lists, schedules, and
follow-ups. Integrates with the tasks store (`services/tasks.ts`).

## Inputs
- Conversation fragment or explicit "plan this" instruction.

## Outputs
- Task records (title, due, owner, category) via `parseTaskActions`.

## Tools
- Task CRUD via `executeTaskActions`.

## Memory tier
- `conversation` + persists to the tasks store.

## Model
- Claude Haiku (structured output).

## Cost budget
- ≤ 2k tokens/task.

## Eval criteria
- Task fields populated correctly, no hallucinated due dates.

## Known limitations
- Does not interact with external calendars yet.
