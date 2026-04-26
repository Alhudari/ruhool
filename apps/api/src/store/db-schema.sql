-- Ruhool — Postgres schema for STORE_BACKEND=postgres mode (Phase 1).
-- Run ONCE in your Neon SQL Editor. Idempotent — safe to re-run.
--
-- Design: the entire app state is one JSONB row keyed `'main'`. This mirrors
-- the JSON-file backend exactly, so the encryption layer, migrations, and
-- runtime types stay identical. When/if Phase 2 needs per-table sharding
-- (faster partial reads), we'll split this row into proper relational
-- tables behind the same getStore()/saveStore() interface.

CREATE TABLE IF NOT EXISTS app_state (
  id          TEXT        PRIMARY KEY,
  data        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pre-create the singleton row so the first save UPSERT lands cleanly.
-- (saveStoreToDb uses ON CONFLICT, so this is technically optional, but it
-- makes "fresh DB" boot a no-op rather than an INSERT race.)
INSERT INTO app_state (id, data) VALUES ('main', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
