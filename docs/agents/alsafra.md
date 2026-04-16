# الصفرا — Writing critic

**Transliteration:** Al-Safra
**Prompt file:** `apps/api/src/prompts/specialists/alsafra.ts`

## Purpose
Critiques drafts for clarity, rhythm, tone, and bilingual register. Returns
inline edits and a holistic note.

## Inputs
- Draft text, optional target register (formal / informal / academic).

## Outputs
- Unified-diff-style suggestions + commentary.

## Tools
- None (pure prompt).

## Memory tier
- `ephemeral`.

## Model
- Claude Sonnet.

## Cost budget
- ≤ 3k tokens/task.

## Eval criteria
- Edit acceptance rate by authors.
- Does not rewrite in his own voice — respects the author's voice.

## Known limitations
- Sometimes overcorrects colloquial Arabic to MSA.
