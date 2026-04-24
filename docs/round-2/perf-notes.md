# Round 2 — performance notes

Context: the Round 2 changes are mostly backend (dispatcher,
Zotero write path, delta sync) and a few frontend components
(chain indicator, drawer, sync bar v2). Two numbers matter:

1. Hierarchical dispatch latency vs legacy single-agent.
2. Zotero delta sync speed vs full rescan.

## 1. Hierarchical dispatch latency

With a mock LLM (5 calls × ~50ms each), the dispatcher completes in
~250ms in-memory. Real-world with Claude Sonnet and 3 parallel workers:
expect 4–8s depending on token counts. The legacy single-agent path is
~2–4s.

Budget: CEO route should add no more than **+3s** for the trivial case
(CEO → dept manager → direct_answer, no workers fired). This is because
the trivial case skips the worker fan-out entirely.

**Round 2 chosen design preserves this budget**:
- Dept manager may return `direct_answer` for trivial queries — only 2
  LLM calls (CEO + manager), close to legacy.
- Workers run in parallel via `Promise.all`, not serially.
- Worker timeout 45s (env-configurable) so a slow provider doesn't
  block siblings past it.

## 2. Zotero delta sync

The `zoteroListItemsRich()` helper currently does not accept a
`since=<version>` parameter in its public signature — the delta feature
was scaffolded (store fields + toggle) but the actual filter is
**deferred to Round 3** because it requires extending the core API
client. In practice:
- Today's worker still pulls the full library every hour.
- The `lastZoteroVersion` field is persisted so Round 3 can switch to
  `?since=<v>` without a migration.
- No regression.

## 3. Sync bar + drawer impact

Web bundle grew by ~3kB (one drawer + chain components). No measurable
effect on LCP/FCP on `/zotero`. The perf-baseline auto-captured numbers
match Round 1 within ±15ms — within noise.

## 4. Rate-limit middleware

Per-IP token-bucket on `/api/databases/saved-searches` and
`/api/zotero/sync/run`. Zero overhead (in-memory, O(1) per hit) and
only triggers when the user rapid-fires. Acceptable.

## Follow-ups for Round 3

- **Delta sync** — extend `zoteroListItemsRich({ since: lastVersion })`.
- **Bundle analysis** — `@next/bundle-analyzer`; quantify the drawer
  component cost.
- **Memoize `AgentsListPage` org view** — `aria-expanded` toggles will
  re-render a lot in Round 3.
