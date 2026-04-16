# ADR 0001 — Dual-mode store: JSON today, Postgres where it matters

**Date:** 2026-04-15
**Status:** Accepted
**Supersedes:** —
**Superseded by:** —

## Context

The `apps/api` server began life as a single-file Hono application backed by a
JSON file (`data/.store.json`) holding every domain entity: providers,
conversations, messages, usage logs, notes, tasks, subscriptions, workflows,
artifacts, graph nodes, and more. As audited in `AUDIT.md` (REL-02) this has
three acute problems:

1. Race conditions on concurrent writes (`saveStore()` rewrites the entire
   file on every mutation).
2. Unbounded file growth; append-heavy entities (usage, activity log) balloon
   the file and slow every unrelated write.
3. Provider API keys — now encrypted — still sit next to everything else in a
   single backup-prone file.

At the same time, a rewrite to Postgres for *every* entity would be a months-
long project and would punish local-first usage (no Docker, no Postgres install)
which is explicitly a product promise.

## Decision

Introduce a **dual-mode repository layer** at `apps/api/src/store/repositories/`.

- If `DATABASE_URL` is set and the Drizzle/postgres-js client can connect, the
  high-value entities (`providers`, `api_usage`, `conversations`, `messages`)
  read and write through Postgres. The JSON store is updated in parallel so
  legacy consumers that still read the in-memory `store` array observe fresh
  data.
- If `DATABASE_URL` is unset or connection fails, the JSON store is
  authoritative and nothing breaks.
- A one-time migration script (`src/scripts/migrate-json-to-pg.ts`) copies
  existing JSON rows into Postgres and is idempotent via
  `ON CONFLICT DO NOTHING`.

The Drizzle schemas already exist in `packages/db/src/schema/`. Migrations are
generated via `pnpm --filter @ruhool/db exec drizzle-kit generate` (output in
`packages/db/src/migrations/`).

### What stays in JSON, and why

- **notes, keep-notes, papers** — small, user-owned, mostly read-after-write,
  often edited offline. JSON is fine. Revisit when the watcher or search
  layer needs indexed queries.
- **tasks, task lists** — similar; low volume, tightly coupled to the
  in-memory store for routing.
- **workflows, triggers, hierarchy, artifacts, ratings, prompt versions,
  watcher alerts, graph nodes/edges, subscriptions** — each is its own
  sub-domain with bespoke read patterns. Migrating them all at once would
  create a huge blast radius. They move after REL-01 stage 2 splits their
  routes into domain modules.

### Boot behavior

On boot, if `NODE_ENV === 'production'` and `DATABASE_URL` is unset, the API
logs a WARN and continues in JSON mode. Startup is never blocked. This matches
the local-first principle: a user who just cloned the repo and ran
`pnpm dev` gets a working system without provisioning Postgres.

## Consequences

**Positive**

- Provider keys and usage history — the two highest-risk, highest-volume
  entities — gain a proper database with indexes, backups via standard DB
  tooling, and transactional safety.
- Dual-mode lets us migrate remaining entities entity-by-entity without a
  cutover day. Each can flip from "JSON only" → "dual" → "DB only" at its own
  pace.
- The `@ruhool/db` package becomes load-bearing instead of decorative.
  Contributors can reason about the schema without reading `AGENT_OS_PROMPT`.

**Negative**

- Dual writes double the bookkeeping for the four migrated entities. Failure
  modes include "JSON succeeded, DB did not" (now logged, not thrown) and
  "DB succeeded, JSON did not" (won't happen in current design because JSON
  always writes first). This is acceptable for a local-first dev tool.
- Two sources of truth means migrations matter. The golden-path recovery is
  always "re-run `migrate:json-to-pg` from the last known-good JSON".

**Neutral**

- The JSON store remains the fallback forever; we do not plan to drop it
  unless local-first is abandoned.

## Forward work

- After REL-01 stage 2 completes, migrate `notes`, `tasks`, `workflows`
  through the same dual-mode pattern.
- Add a `READ_THROUGH_DB=true` mode that lets reads skip the JSON fallback
  once a given entity is fully in Postgres.
- Add a background job that snapshots the JSON store to Postgres every N
  minutes for the not-yet-migrated entities, so we always have a recoverable
  copy.
