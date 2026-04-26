# D-7 / Wave 1 — Postgres backend wiring

**Status:** code-complete and tested locally against Neon.
**Scope:** the Ruhool store can read/write a JSONB row in Postgres instead of `data/.store.json`, controlled by an env switch.

## Switching modes

```bash
# JSON-file mode (default — local dev)
pnpm dev

# Postgres mode (Neon, deploy target)
STORE_BACKEND=postgres DATABASE_URL=postgresql://...?sslmode=require pnpm dev
```

> **Naming note:** the switch is `STORE_BACKEND`, not `STORAGE_PROVIDER` —
> `STORAGE_PROVIDER` already controls the **file storage** adapter in
> `packages/core/src/storage` (used for uploaded blobs). Reusing the name
> would have been a silent collision.

## Required env vars in `STORE_BACKEND=postgres`

| Var               | Required? | Notes                                              |
|-------------------|-----------|----------------------------------------------------|
| `DATABASE_URL`    | yes       | Neon connection string. PREFER the `-pooler` URL.  |
| `ENCRYPTION_KEY`  | yes       | 64-char hex OR ≥32-char passphrase. NO file fallback in postgres mode (Vercel filesystem is ephemeral; a fresh key on every cold start would break every saved apiKey). |

In JSON-file mode both are optional — `ENCRYPTION_KEY` falls back to a
file at `data/.encryption-key`.

## One-time DB setup

Run the SQL in `apps/api/src/store/db-schema.sql` once in your Neon SQL
Editor. Idempotent — safe to re-run.

```sql
CREATE TABLE IF NOT EXISTS app_state (
  id          TEXT        PRIMARY KEY,
  data        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_state (id, data) VALUES ('main', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
```

## Architecture

```
apps/api/src/store/
├── index.ts             ← getStore / saveStore — switches on isPostgresMode()
├── supabase-store.ts    ← loadStoreFromDb / saveStoreToDb (one query each)
├── encryption.ts        ← AES-256-GCM applied at the index.ts boundary
├── db-schema.sql        ← one-time setup
└── store-mode.test.ts   ← Postgres-mode regression (mocked driver)
```

The whole `StoreData` is one JSONB row keyed `'main'`. Every save UPSERTs
the full encrypted payload. Phase 2 may shard into per-table reads when
single-row writes become a bottleneck — at which point the same
`getStore()` / `saveStore()` interface stays.

## Known limitations (Wave 1)

These are accepted trade-offs for Phase 1 (single-user personal deploy):

1. **No optimistic concurrency between Vercel functions.** The full row
   is overwritten on every save. If two Vercel function instances mutate
   the store at the same wall-clock moment, the later writer silently
   overwrites the earlier one. For Abdullah's single-user pattern the
   probability of a real collision is near-zero, but it's a real
   limitation to be aware of when adding multi-tab features later.
   Phase 2 will add a `version` column + `WHERE version = $expected`
   guard.

2. **No retry on save failure.** If `saveStore()` hits a DB error, it
   throws. Most callers `void` the promise, so the user sees no UI
   feedback. Mitigated by the `withLock` mutex inside the same process
   (writes are serialized) but not across instances. To revisit if
   single-user usage hits transient Neon errors.

3. **Per-call connections.** Each load/save opens and closes a Postgres
   connection. With Neon's pooler URL this is cheap; with a direct URL
   it could exhaust slots under heavy concurrency. The code warns at
   boot when the URL is `neon.tech` without `-pooler`.

4. **Background workers (A-series scheduler, Resend retry, Zotero sync).**
   These use `setInterval` and don't survive Vercel's stateless function
   boundary. They'll be replaced by Vercel Cron in Wave 1.5 — for now
   they only run in long-running local dev.

## Migration paths from legacy data

Old per-table migration scripts (`db-setup.ts:migrateFromJsonToPostgres`,
`scripts/migrate-json-to-pg.ts`) target a relational schema NOT used by
Wave 1. They're labelled `DEPRECATED FOR D-7 / Wave 1` and kept for
historical reference only.

For "start clean" deploys (Abdullah's stated preference): no migration
needed. The `app_state` row starts as `{}`, runtime fills it naturally.

For an explicit one-off copy of a local store, the 5-line helper is:
```ts
import { readFileSync } from 'node:fs';
import { saveStoreToDb } from './supabase-store.js';
const data = JSON.parse(readFileSync('data/.store.json', 'utf-8'));
await saveStoreToDb(data);
```
Run with `STORE_BACKEND=postgres` + `DATABASE_URL` set. The encryption
keys must match between source and destination, otherwise re-enter
provider apiKeys after the copy.
