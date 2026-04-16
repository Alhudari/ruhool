# المحلل — Analyst

**Transliteration:** Al-Muhallil
**Prompt file:** `apps/api/src/prompts/specialists/analyst.ts`

## Purpose
Quantitative analysis over the matrix (XLSX) module and note metadata:
counts, trends, breakdowns.

## Inputs
- Dataset reference (matrix sheet or note filter) + question.

## Outputs
- Answer + supporting chart spec (Vega-Lite or inline markdown table).

## Tools
- Matrix readers (`services/matrix.ts`).

## Memory tier
- `conversation`.

## Model
- Claude Sonnet.

## Cost budget
- ≤ 6k tokens/task.

## Eval criteria
- Numeric accuracy on fixture matrices.

## Known limitations
- No statistical testing; descriptive only.
