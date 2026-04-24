# Ruhool — post-Round-3 architecture snapshot

Status as of 2026-04-23 (v0.3.0). This is the "what does the platform
look like now" reference. Use it as the read-me when you walk a new
contributor through the system.

## High-level

```
              ┌───────────────────────────┐
              │  apps/web (Next.js 14)    │
              │  port 3000                │
              └──────────────┬────────────┘
                             │  HTTP + SSE
              ┌──────────────▼────────────┐
              │  apps/api (Hono)          │
              │  port 3001                │
              ├───────────────────────────┤
              │  • REST routes            │
              │  • /api/dispatch/*  (R2)  │
              │  • /api/audit-log   (R1)  │
              │  • /api/health      (R1)  │
              ├───────────────────────────┤
              │  Workers (boot-started):  │
              │  • schedule-checker       │
              │  • watcher                │
              │  • zotero-refresh         │
              │  • zotero-vault-sync (R1+R2)│
              │  • subscription-checker   │
              ├───────────────────────────┤
              │  Store: data/store.json   │
              │  Audit: audit-log.jsonl   │
              │  Org:   agent-org.json    │
              └──────────────┬────────────┘
                             │
                             ▼
              ┌───────────────────────────┐
              │  packages/core            │
              │  Vault adapter            │
              │  Zotero local + web + write│
              │  Bidi util         (R3)   │
              └───────────────────────────┘
```

## Hierarchical dispatch (R2, default-on R3)

```
user message
   │
   ▼
[CEO: الراعي] ─── delegate_to_department(dept, reason) ──▶
   │
   ▼
[Dept manager] ── delegate_to_worker[1..3](task) ──▶
   │       │
   │       ├──[worker A]──┐
   │       ├──[worker B]──┤  (parallel via Promise.all)
   │       └──[worker C]──┤
   │                       │
   ▼                       │
[Dept manager: synthesize] ◄
   │
   ▼
final assistant reply (one message)
```

State machine and per-step semantics live in
[`docs/architecture/dispatch-contract.md`](./dispatch-contract.md).

## Zotero sync (R1 pull + R2 push + dry-run)

```
                hourly tick
                    │
                    ▼
          [zotero-vault-sync worker]
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
     scan vault  fetch zotero  diff
                    │
                    ▼
        ┌───────────┴───────────┐
        ▼                       ▼
  zotero-newer:            vault-newer + writeEnabled:
  patch frontmatter        PATCH zotero with
                           If-Unmodified-Since-Version
                                        │
                                412 ─── ▼
                          flag conflict, pull, retry next run
```

## Boot order

Defined in `apps/api/src/server/boot.ts`:

```
1. setupDatabase()              → postgres or fallback
2. scanAndLoadModules()         → load module registry
3. (optional) Temporal client
4. reconcileRunningRuns()       → recover from crashes
5. initResearchQueue() + worker
6. startScheduleChecker()       → schedule runner
7. startZoteroRefreshChecker()  → refresh nag
8. getVaultRoot() check         → if missing, skip step 9
9. startZoteroVaultSync()       → pull + write + dry-run
10. startWatcherWorker()         → alerts scan
11. emit boot summary           → "[boot] workers: X=ok, ..."
12. start agent-org watcher     → invalidates org cache on file change
13. serve()                     → API live
```

## Feature flags (R2 introduced, R3 defaults)

| Flag                          | Default | Override |
|-------------------------------|---------|----------|
| `ENABLE_HIERARCHICAL_DISPATCH`| **on**  | `=false` to disable |
| `ENABLE_ZOTERO_DELTA_SYNC`    | on      | `=false` to disable |
| `ENABLE_ZOTERO_WRITE`         | off     | per-user store toggle is the real switch |
| `NEXT_PUBLIC_GUARDED_NAV`     | on (dev), off (prod unless set) | env var |
| `DISPATCH_WORKER_TIMEOUT_MS`  | 45000   | env var |

## Store schema (current)

`data/store.json` — managed via the migration runner in
`apps/api/src/store/migrations/`. Current `schemaVersion: 2`.

Notable keys:
- `zoteroVaultSync.{lastRunAt, lastRunStats, lastError, lastZoteroVersion, lastDryRunPlan}` (R1+R2)
- `zoteroConfig.{mode, webUserId, webApiKey, writeApiKey}` (R2)
- `zoteroWriteEnabled` (R2)
- `limits.{hierarchicalDispatchUsd, dispatchMaxFanout}` (R2)
- `agentNameOverrides` (pre-R1)
- `databaseSavedSearches` (R1)

## Routes added across R1-3

| Method | Path                                | Round | Notes |
|--------|-------------------------------------|-------|-------|
| GET    | `/api/audit-log`                    | R1    | Streaming, cursor-paginated |
| GET    | `/api/audit-log/sources`            | R1    | distinct sources for filter |
| POST   | `/api/databases/saved-searches`     | R1    | rate-limited + zod |
| GET    | `/api/databases/saved-searches`     | R1    |     |
| DELETE | `/api/databases/saved-searches/:id` | R1    |     |
| GET    | `/api/agent-org`                    | R1    | server-side cached (R3) |
| PUT    | `/api/agent-org`                    | R1    | zod-validated (R1+R2) |
| POST   | `/api/dispatch/chat`                | R2    | flag-gated, returns DispatchResult |
| GET    | `/api/dispatch/stream`              | R2    | SSE variant |
| GET    | `/api/dispatch/config`              | R2    |     |
| PUT    | `/api/zotero/write-config`          | R2    | write key + writeEnabled toggle |
| GET    | `/api/zotero/sync/status`           | R1    | always available |
| POST   | `/api/zotero/sync/run`              | R1    | rate-limited; accepts `{ dryRun }` (R2) |
| GET    | `/api/zotero/sync/dry-run-plan`     | R2    |     |

## Quality gate inventory

- `apps/web` tsc: clean
- `apps/api` tsc: clean except pre-existing `postgres` module error
- `packages/core` tsc: clean
- vitest core: 5/5
- vitest api: 119/119 (+11 R2 integration cases)
- Playwright across R1+R2+R3: 20 passed, 2 explicit-skip, 0 fail
- axe (R3): zero blocking violations on `/audit`, `/agents`

## What's intentionally NOT done

- TASK 7 (recursive nested splits) — see
  [`docs/round-3/task-7-decision.md`](../round-3/task-7-decision.md).
- PRISMA 2020 integration — deferred until user picks the canonical
  source repo.
- Lighthouse CI — listed as post-R3 follow-up.
- `@next/bundle-analyzer` — listed as post-R3 follow-up.
- Pre-existing a11y violations in app shell chrome — see
  [`docs/round-3/a11y-report.md`](../round-3/a11y-report.md).
- `chat.ts` rewriting — dispatcher landed as a separate route to
  preserve the legacy 1843-line god-file untouched.
