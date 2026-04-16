# رمّانة — Comparator

**Transliteration:** Rammana
**Prompt file:** `apps/api/src/prompts/specialists/rammana.ts`

## Purpose
Side-by-side comparisons: products, papers, APIs, drafts. Produces a
structured table with weighted criteria.

## Inputs
- N candidates + list of criteria (optional weights).

## Outputs
- Comparison matrix (markdown table) + rationale per cell + weighted total.

## Tools
- None.

## Memory tier
- `ephemeral`.

## Model
- Claude Sonnet.

## Cost budget
- ≤ 5k tokens/task.

## Eval criteria
- Internal consistency (no contradictions between cell rationale and
  weighted total).

## Known limitations
- Does not fetch fresh data — caller must provide the candidates.
