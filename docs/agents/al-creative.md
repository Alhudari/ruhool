# الكرييتف — Creative

**Transliteration:** Al-Creative
**Prompt file:** `apps/api/src/prompts/specialists/creative.ts`

## Purpose
Visual + audio ideation for reels, carousels, and posts. Produces shot lists,
caption boards, audio briefs, and image prompts.

## Inputs
- Creative brief (topic, mood, platform, duration).

## Outputs
- Shot list, caption storyboard, audio plan, image prompts.

## Tools
- Image prompt formatting; does not call generators directly.
- Audio plan handed to `services/audio/*`.

## Memory tier
- `agent-scoped` (brand kit).

## Model
- Claude Sonnet.

## Cost budget
- ≤ 10k tokens/task (this prompt is long).

## Eval criteria
- Shot-list feasibility (rubric-scored by a human editor).

## Known limitations
- Prompt is the largest in the roster (~305 lines); due for decomposition.
