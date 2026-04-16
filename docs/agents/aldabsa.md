# الدبسا — Content creator

**Transliteration:** Al-Dabsa
**Prompt file:** `apps/api/src/prompts/specialists/aldabsa.ts`

## Purpose
Long-form content drafting: posts, scripts, carousels, reels. Bilingual.

## Inputs
- Brief (goal, audience, platform, length).
- Optional brand voice.

## Outputs
- Draft + metadata (title variants, hook, CTA).

## Tools
- None by default. Can receive shot lists from الكرييتف.

## Memory tier
- `agent-scoped` — caches brand voice per workspace.

## Model
- Claude Sonnet.

## Cost budget
- ≤ 8k tokens/task.

## Eval criteria
- Brand-voice fidelity (rubric-scored).
- Platform-appropriate length.

## Known limitations
- Reel timing estimation is rough.
