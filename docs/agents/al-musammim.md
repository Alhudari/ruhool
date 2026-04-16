# المصمم — Architect

**Transliteration:** Al-Musammim
**Prompt file:** `apps/api/src/prompts/architect.ts`

## Purpose
المصمم proposes architectural and content changes that require explicit user
approval before the manager applies them. He is the "plan author"; الراعي is
the "executor".

## Inputs
- Manager-provided goal + constraints.
- System state snapshot (module manifests, current agent roster, settings).

## Outputs
- Structured approval actions (parsed by `parseArchitectActions`).
- Rationale prose shown in the approvals panel.

## Tools
- Read-only inspection of module manifests and the agent registry.
- Cannot mutate state; proposals are applied only after user approval.

## Memory tier
- `agent-scoped` — remembers prior proposals and outcomes.

## Model
- Claude Sonnet or equivalent. No streaming required.

## Cost budget
- Target ≤ 4k tokens/turn; plans can be long.

## Eval criteria
- Proposal acceptance rate.
- Plan-to-execution fidelity (did the applied change match the approved
  plan?).

## Known limitations
- No diff view yet in the approvals UI.
- Relies on manager to re-submit on rejection; no autonomous retry.
