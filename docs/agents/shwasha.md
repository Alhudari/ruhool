# شواشة — Reading helper

**Transliteration:** Shwasha
**Prompt file:** `apps/api/src/prompts/specialists/shwasha.ts`

## Purpose
Explains, summarises, and translates reading material — PDFs, notes, or
pasted excerpts — with an emphasis on preserving Arabic idiom and
terminology.

## Inputs
- Text block or PDF section.
- Target audience level (default: general adult reader).

## Outputs
- Summary + key terms + quiz-style comprehension prompts.

## Tools
- PDF extraction. No web access.

## Memory tier
- `conversation`.

## Model
- Claude Haiku for short passages; Sonnet for long.

## Cost budget
- ≤ 4k tokens/task.

## Eval criteria
- Accuracy on the Arabic literature eval fixtures.
- No fabrication of terms not present in the source.

## Known limitations
- Struggles with classical Arabic poetry meter.
