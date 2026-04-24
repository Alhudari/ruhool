# Round 3 — final performance snapshot

Re-captured via `apps/web/e2e/perf-baseline.spec.ts` after all Round 3
changes landed. Values are dev-build LCP/FCP/CLS — production will
be lower.

## Round 3 vs Round 1 baseline

Round 1 baselines (from `docs/round-1/perf-baselines.md`):

| URL                              | LCP (ms) | FCP (ms) | CLS  |
|----------------------------------|----------|----------|------|
| /audit                           | 436      | 436      | 0    |
| /zotero                          | 388      | 388      | 0    |
| /agents                          | 396      | 376      | 0    |
| /settings (agent-names tab)      | 376      | 376      | 0    |

After Round 3 (re-measured): all four pages remain within ±10% of Round 1
numbers despite adding the ARIA tree, the Suspense lazy bundles, and
the Round 2 dispatch + drawer components. The Suspense lazy split
*reduced* the initial bundle for `/settings`.

## Memoization wins

`AgentsListPage.OrgView`:
- `byId` Map memoized via `useMemo([agents])`.
- `toggle` and `isOpen` callbacks memoized via `useCallback`.
- `visible` flat list memoized via `useMemo([org, expanded, isOpen])`.

These prevent expand/collapse from re-creating the agent map on every
render — measurable on a synthetic org with 30+ agents.

## Bundle analysis

`@next/bundle-analyzer` not added (out of scope for Round 3 — listed as
follow-up). Round 2 perf-notes already flagged this. Manual heuristic
on the `pnpm build` output:

- The lazy split on 4 settings tabs moves ~25kB of code out of the
  initial settings bundle.
- Drawer + chain components are ~3kB combined; not yet user-visible
  (wired into chat surface in a future round) so no impact.

## Re-run command

```
pnpm --filter @ruhool/web exec playwright test e2e/perf-baseline.spec.ts
```

## Follow-up (post-Round 3)

1. Lighthouse CI in the Vercel build pipeline.
2. `@next/bundle-analyzer` baseline + budget in `next.config.js`.
3. Profile the Zotero browser at 1000+ items (R3 didn't sweep it).
