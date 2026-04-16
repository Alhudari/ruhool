# المشخّص — Diagnoser

**Transliteration:** Al-Mushakhkhis
**Prompt file:** `apps/api/src/prompts/specialists/mushakhkhis.ts`

## Purpose
Diagnoses problems — errors, performance issues, workflow stalls — by
inspecting activity logs and surfacing plausible root causes.

## Inputs
- Problem statement + recent activity slice.

## Outputs
- Ranked list of hypotheses + suggested next diagnostic step.

## Tools
- Activity log reader.

## Memory tier
- `ephemeral`.

## Model
- Claude Sonnet.

## Cost budget
- ≤ 4k tokens/task.

## Eval criteria
- Top hypothesis matches ground truth on the diagnostic eval set.

## Known limitations
- No stack-trace parsing beyond simple regex.
