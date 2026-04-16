# Contributing to Ruhool (رحول)

Thanks for helping out. Ruhool is a local-first, bilingual (AR/EN), multi-agent
platform. Most contributions touch one of three layers: the API god-service
being refactored out of `apps/api/src/index.ts`, the Next.js web app, or a
module under `modules/`. This document covers the conventions.

## 1. Setup

Prereqs: Node `>=20` (see `.nvmrc`), `pnpm`, optional local Postgres 16 if you
want the Drizzle path instead of the JSON-file fallback.

```bash
pnpm install
cp .env.example .env           # set ANTHROPIC_API_KEY at minimum
# optional:
export RUHOOL_DB_URL=postgres://...     # enables Drizzle path
export RUHOOL_API_TOKEN=dev-secret      # bearer auth for /api/*
export TEMPORAL_ADDRESS=localhost:7233  # enables research workflow
```

If you skip Postgres, the API boots against the JSON store at
`data/.store.json`.

## 2. Run dev

```bash
pnpm -r dev
```

That starts `apps/api` (Hono on `127.0.0.1:3001`) and `apps/web` (Next.js on
`:3000`) in parallel. The API binds to loopback only; do not change this.

## 3. Tests and lint

Before every PR:

```bash
pnpm -r test                                         # vitest in all packages
pnpm --filter @ruhool/api exec tsc --noEmit         # strict TS
pnpm --filter @ruhool/web exec tsc --noEmit
pnpm --filter @ruhool/web exec playwright test      # e2e (requires dev server)
```

Target: zero new tsc errors. The monorepo has a residual baseline — see
`docs/tsc-residual.md` if present.

## 4. Add a new agent

1. **Prompt** — create `apps/api/src/prompts/specialists/<name>.ts` exporting
   `export const <NAME>_SYSTEM_PROMPT = \`...\`;`. Arabic identity first.
2. **Manifest** — add `modules/agent/<name>/manifest.json` matching the shape
   of an existing one.
3. **Registry** — register in `BUILTIN_SYSTEM_PROMPTS` and `BUILTIN_AGENTS`.
4. **Docs** — add `docs/agents/<name>.md` (copy `_template.md`) and update
   `AGENTS.md`.
5. **Eval** — add fixtures under `apps/api/src/__tests__/agents/<name>/`.

## 5. Add a new theme

1. **Tokens** — append a `[data-theme='<id>']` block in
   `apps/web/src/styles/themes.css` plus the matching `.dark` variant.
2. **Tailwind** — map the new CSS vars in `apps/web/tailwind.config.ts`.
3. **Contrast check** — re-run the computation in
   `docs/a11y/theme-contrast.md` and update the table. Every `on*` token must
   meet AA normal (≥ 4.5); `onTer` may drop to AA large (≥ 3.0).
4. **Screenshot** — update `apps/web/e2e/screenshot-themes.spec.ts` with the
   new id; rerun to regenerate images under `docs/screenshots/`.

## 6. Add a new API route

Routes are grouped by domain under `apps/api/src/routes/<domain>.ts` and
export `registerXxxRoutes(app, deps)` where `deps` carries `{ store, logger,
services, repos }`. Do not import the store singleton directly inside a
route — take it from `deps`. Example:

```ts
export function registerMyRoutes(app: Hono, deps: RouteDeps): void {
  app.get('/api/my/thing', async (c) => {
    const items = await deps.repos.myRepo.list();
    return c.json(items);
  });
}
```

Register the new route from `apps/api/src/index.ts` after services boot.

## 7. Logging

No `console.*` in production code. Use the `pino` instance from
`server/logging.ts`:

```ts
import { logger } from './server/logging.js';
logger.info({ scope: 'chat', requestId }, 'started');
```

## 8. Arabic naming convention

- Agent identifiers are Arabic; code identifiers use the transliteration
  (e.g., folder `shwasha/`, prompt constant `SHWASHA_SYSTEM_PROMPT`, display
  name `شواشة`).
- User-facing strings: Arabic primary when `lang=ar`, English when `lang=en`.
- Never translate an agent's canonical Arabic name to English in the UI — show
  both.

## 9. PR checklist

- [ ] `pnpm -r test` passes.
- [ ] `tsc --noEmit` passes (or error count unchanged).
- [ ] No new `console.*` calls in `apps/api/src/**` outside `scripts/`.
- [ ] Contrast re-verified if any color token changed.
- [ ] Docs updated (`AGENTS.md`, `docs/agents/*`, `docs/a11y/*` as
      applicable).
- [ ] No secrets committed; `.env` is ignored.
