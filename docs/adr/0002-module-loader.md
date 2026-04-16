# ADR 0002 — Dynamic module loader

**Status:** accepted
**Date:** 2026-04-15

## Context

Ruhool's architecture advertised a "plug-in" seam via `modules/<type>/<name>/` but
nothing in the API ever read those manifests. Agents, themes, LLM providers, and
skills were declarative folders with no runtime effect. This made the seam
aspirational and misleading (audit finding ARC-04).

## Decision

Scan `modules/*/*/manifest.json` at boot and register each manifest in an in-process
`ModuleRegistry` (see `apps/api/src/modules/loader.ts`). If a manifest declares an
`entry`, dynamically `import()` the resolved path and retain the module instance for
later consumers.

The registry is consumed by:

- `GET /api/modules` — returns redacted manifests (no `entry` path).
- Manager delegation (AGT-05) — the `delegate_to_specialist` tool's `specialist`
  enum is derived from the loaded agent modules, enforcing the "manager can only
  delegate to specialists declared in loaded modules" rule.

## Consequences

- Adding a new specialist is a matter of dropping a `manifest.json` under
  `modules/agent/<id>/` — no code change required in `apps/api`.
- `entry` imports are best-effort: failures are logged and the manifest stays
  registered as metadata only.
- Permission enforcement is minimal today; `manifest.permissions` are recorded but
  only the *delegation* gate is enforced. File/network capability enforcement is
  a future pass.

## Alternatives considered

- **Hard-coded `BUILTIN_AGENTS` table** (the status quo). Rejected — the whole
  point of the `modules/` seam is to avoid that table.
- **Bundler-time discovery (Vite/esbuild plugin)**. Rejected for simplicity; a
  boot-time `readdirSync` + `import()` is enough for local-first deployment.
