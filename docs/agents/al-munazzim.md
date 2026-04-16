# المنظّم — Organizer

**Transliteration:** Al-Munazzim
**Prompt file:** `apps/api/src/prompts/specialists/munazzim.ts`

## Purpose
Keeps long-term memory tidy: filing notes, tagging papers, archiving
conversations, pruning stale artifacts.

## Inputs
- Trigger event (new note saved, conversation ended, scheduler tick).

## Outputs
- Metadata updates on notes/papers/conversations.

## Tools
- Note CRUD, paper tag updates, conversation archive.

## Memory tier
- `global` — reads across the whole workspace.

## Model
- Claude Haiku.

## Cost budget
- ≤ 1k tokens/item; batched.

## Eval criteria
- No unintended deletions; tags match policy.

## Known limitations
- Does not cluster semantically yet (no embeddings integration).
