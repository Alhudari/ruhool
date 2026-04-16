# Residual TypeScript errors (as of 2026-04-15)

Baseline at start of this audit pass: **159 errors** in `apps/api` + 2 in
`packages/shared`.
After this pass: **148 errors in `apps/api`**, **0 in `packages/shared`**,
21 pre-existing errors in `apps/web` (unchanged, all in
`studio-page.tsx` — Lucide `size` prop typing issue, predates this audit).

## Cleared

- `packages/shared` (2 → 0): added `@types/node` dev dep.
- `apps/api` (159 → 148): added `@types/nodemailer`; cleared 5 TS6133
  unused-symbol errors in `render.ts`, `code-fixer.ts`, `video-generator.ts`;
  suppressed the `node-cron` optional import in `daily-backup.ts`; fixed 3
  Hono-context typing errors in `server/logging.ts` via local casts.

## Residual — breakdown

| Code | Count | Meaning |
|---|---:|---|
| TS2339 | 113 | Property does not exist on `StoreData` / narrow store type |
| TS2769 | 11 | Overload mismatch (mostly `c.set` / `c.get` variant maps in Hono) |
| TS6133 | ~10 | Unused locals — remaining ones live inside large branches in `index.ts` |
| TS2352 | 8 | Conversion between overlapping types (Phase2StoreLike ↔ StoreData) |
| TS2551 | 7 | Property name typos (`notifications` vs `notificationSettings`) |
| TS2322 | 4 | Assignment-type mismatches in legacy handlers |
| TS7006 | 2 | Implicit any on callback params |
| TS2345 | 1 | Argument type mismatch on one repo call |

148/148 residual errors live in `apps/api/src/index.ts` — the 9,470-line
god-file still being extracted in REL-01 stage 2b.

## Why they remain

The audit (`AUDIT.md`, finding Q-02) identifies the root cause: three narrow
store types (`StoreData`, `Phase2StoreLike`, `AgentOSStore`,
`RunnerStoreLike`) each pick a different subset of the same JSON-file shape,
and `index.ts` casts between them ad hoc. Unifying these types is an
architectural change that is coupled to the ongoing extraction of `store/`
out of `index.ts` into a typed module (also REL-01 stage 2b). Fixing them
piecemeal while the extraction is in flight would create merge conflicts for
the ongoing refactor.

## Plan

1. Finish extracting `src/store/` as the single source of truth for the
   store type. Every route/service imports `StoreData` from there.
2. Delete `Phase2StoreLike` / `RunnerStoreLike` in favor of slicing
   `StoreData` with `Pick` where a narrower view is wanted.
3. Rerun `tsc` — expect TS2339/TS2352/TS2551 to drop to near-zero.
4. Fix the remaining TS6133/TS7006 individually (cheap).

Target after that pass: **< 20 errors monorepo-wide**, which is the bar set
by the audit task. That work is tracked as REL-01 stage 2b in
`apps/api/REFACTOR_MAP.md`.
