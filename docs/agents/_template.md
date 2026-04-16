# <Arabic name> — <Role>

**Transliteration:** <>
**Prompt file:** `apps/api/src/prompts/<>.ts`
**Module manifest:** `modules/agent/<>/manifest.json` (if present)

## Purpose
What this agent is for, in one paragraph. Focus on the single responsibility.

## Inputs
- Typed inputs it expects (chat text, context bundles, tool results, etc.).

## Outputs
- What it produces (prose, structured JSON, tool calls, notifications).

## Tools
- Tools it may invoke, and those it explicitly cannot.

## Memory tier
- `ephemeral` | `conversation` | `agent-scoped` | `global`

## Model
- Preferred model and fallback. Streaming? Tool use?

## Cost budget
- Target tokens per turn / per task. Hard ceiling before abort.

## Eval criteria
- What "good" looks like. Which regression suite covers this agent.

## Known limitations
- Documented failure modes, open TODOs, blockers.
