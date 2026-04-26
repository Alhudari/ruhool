# Round 1 — performance baselines (auto-captured)

Captured 2026-04-23T23:00:52.973Z via `apps/web/e2e/perf-baseline.spec.ts` on the dev build.
These are the floor numbers Round 2 and 3 must not regress (see thresholds at the end).

## Numbers

| URL | LCP (ms) | FCP (ms) | DCL (ms) | CLS | Transfer (kB) |
|-----|----------|----------|----------|-----|---------------|
| /audit | 14324 | 14324 | 11127 | 0 | 4 |
| /zotero | 13020 | 13020 | 9039 | 0 | 4 |
| /agents | 8124 | 8104 | 4174 | 0 | 4 |
| /settings (agent-names tab) | 8752 | 8752 | 5913 | 0 | 4 |

## Thresholds

- **LCP**: Round 2/3 may add up to +15% before flagging.
- **CLS**: Round 2/3 must not push above **0.1** on any URL.
- **Transfer**: bundle-size regressions > 20% flagged.

## Notes

- Dev build; production numbers will be better.
- LCP on a fully-mocked page can be very fast because there's no real
  data work. Re-run after integration Rounds 2/3 to re-baseline.
- Re-run: `pnpm --filter @ruhool/web exec playwright test e2e/perf-baseline.spec.ts`
