# Round 1 — `data/store.json` write-path audit

## Conclusion

Every runtime write to `data/store.json` already funnels through
`saveStore()` in `apps/api/src/store/index.ts`, which wraps the actual
`fs.writeFileSync` in a `withLock()` promise-chain mutex. No new mutex was
needed; Round 1 confirms the existing one is sound and documents the
invariant here + in `docs/architecture/invariants.md`.

## Method

Grep of every potential write path in `apps/api/src`:

```
grep -rn "STORE_FILE\|store\.json\|writeFileSync\|writeFile" apps/api/src \
  | grep -v -E "audit-log|backups/|canvas/|papers/|notes/|trash/|tests/"
```

Paths with writes into `data/store.json`:

| Call site                               | Goes through `saveStore`? |
|-----------------------------------------|---------------------------|
| `apps/api/src/store/index.ts` `saveStore()` | yes (definition)          |
| `apps/api/src/services/automated-notifications.ts` | yes (`deps.saveStore()`) |
| `apps/api/src/services/subscriptions-engine.ts`    | yes                       |
| All route handlers                      | yes (via `deps.saveStore()`) |
| All workers                             | yes (via passed `saveStore` or indirect through helpers) |

The only direct `fs.writeFileSync` pointed at `STORE_FILE` is inside
`saveStore()` itself. No route or worker bypasses it.

## Mutex verification

`withLock<T>(fn)` is a promise-chain mutex: it chains the next fn to the
prior tail, returning the new tail promise. Properties:

- **Serialization:** two concurrent `saveStore()` calls observe their
  writes in call order.
- **No blocking inside a critical section:** the closure passed to
  `withLock` does `fs.writeFileSync` synchronously — no `await`, so no
  starvation.
- **Backpressure is optional:** callers that don't `await` still get safe
  serialization; they just don't know when the write lands.

## Risk we accept

If the process is killed between lock acquisition and `writeFileSync`
returning, partial writes are possible. Windows + Node mitigates this
because `writeFileSync` is a single syscall for small files, but we still
recommend:

- Backups via `scripts/backup.sh` (exists).
- `data/store.json` on a filesystem with power-safe writes (user has this).

## Follow-ups for Round 2 / 3

- Consider moving `saveStore` to an **atomic write** pattern (`writeFile(tmp)
  → rename`) to eliminate the truncate-then-write risk. Requires measuring
  rename cost on OneDrive first (EPERM risk).
- Consider Postgres migration path — but that's a separate architectural
  decision, not a Round N follow-up.
