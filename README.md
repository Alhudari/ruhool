# Ruhool (رحول)

**A local-first, multi-agent orchestration platform.**

Named after the Ruhool (رحول) — the lead she-camel that guides the herd across the desert. The Manager agent, **Al-Ra'i (الراعي)**, is the shepherd that steers that herd and orchestrates specialist agents.

Built for Abdullah Al Hudaifi's PhD research on BIM adoption in Kuwait/GCC/MENA, KSE digital transformation work, and Arabic educational content.

## Status — v0.3.0 (2026-04-23)

Three engineering rounds shipped. See [`CHANGELOG.md`](./CHANGELOG.md) for the full log.

- **Round 1 — Stabilize & See:** unified save pattern across 12 settings
  pages, guarded navigation provider, audit-log reader, streaming
  `/api/audit-log`, audit-log rotation, rate-limit middleware, zod
  validation, boot health summary + `/api/health`, 7 Playwright specs,
  auto-captured perf baselines.
- **Round 2 — Complete the Half-Built:** hierarchical dispatcher
  (CEO → dept manager → workers → synthesis) with cost cap and graceful
  fallback, Zotero write API + dry-run + write-key field, dispatch
  routing-chain UI + detail drawer, store migration runner, agent-org
  file watcher. New routes: `/api/dispatch/{chat,stream,config}`,
  `/api/zotero/{write-config,sync/dry-run-plan}`. Feature-flagged.
- **Round 3 — Polish & Evolve:** WAI-ARIA treeview on the Org view,
  canvas auto-zoom-to-fit, React.lazy + Suspense skeletons on heavy
  settings tabs, agent-org server-side cache invalidated by file watcher,
  bidi utility module, `@axe-core/playwright` integrated. Hierarchical
  dispatch flag defaults ON.

Quality gates at v0.3.0:

| Gate                        | Result |
|-----------------------------|--------|
| `tsc --noEmit` × 3 packages | clean (one pre-existing `postgres` module error in `supabase-store.ts` ignored) |
| Vitest                      | core 5/5, api 119/119 |
| Playwright (R1+R2+R3 specs) | 20 passed, 2 explicit-skip, 0 failures |

Feature flags: see `.env.example`.

## Philosophy

- **Local-first**: your data stays on your machine. Cloud APIs are tools, not storage.
- **Modular**: every capability is a plugin module — agents, tools, skills, themes, workflows.
- **Transparent**: every prompt is readable, every memory is editable, every cost is tracked.
- **Bilingual**: Arabic and English are equal citizens, full RTL support.
- **Safe**: no destructive operations without confirmation, no secrets in git, backups before mutations.

## Stack (shipping today)

- **Frontend** — Next.js 14 (App Router), TypeScript, Tailwind
- **Backend** — Hono (TypeScript), Node 20+
- **Tooling** — pnpm + Turborepo
- **Queue** — BullMQ on Redis (optional — research jobs)
- **Storage** — PostgreSQL (required in prod for providers/usage/conversations/messages; JSON file-store fallback for local dev) via Drizzle ORM. One-time migration: `pnpm --filter @ruhool/api migrate:json-to-pg`. See [`docs/adr/0001-json-store-today.md`](./docs/adr/0001-json-store-today.md).
- **Streaming** — Server-Sent Events (SSE) for agent chat
- **Themes** — 3 built-in: Claude Clean, Desert Caravan, Academic (see [`docs/screenshots/`](./docs/screenshots/) for light/dark previews)

## Stack (planned, not yet wired)

- **Orchestration** — LangGraph (today prompts + text-marker delegation)
- **Durable workflows** — Temporal (containers scaffolded in `docker-compose.yml`, client not yet integrated)
- **ORM** — Drizzle wired for providers/usage/conversations/messages (dual-mode with JSON fallback). Remaining domains still JSON-only; see ADR 0001.
- **pgvector** — schema prepared as text column; vector extension not yet enabled

## Safety Rules

1. Never run broad process-kill commands
2. Never modify files outside `./platform/`
3. Never delete data without explicit confirmation
4. Never commit `.env` or credentials
5. All destructive data operations create backups first

## Getting Started

```bash
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, ENCRYPTION_KEY, RUHOOL_API_TOKEN (prod),
# and at least one LLM provider key (ANTHROPIC_API_KEY recommended)
docker compose up -d        # optional — Postgres/Redis/Temporal containers
pnpm install
pnpm dev
```

The API binds to `127.0.0.1:3001` and the web UI to `http://localhost:3000`.

## Phases

- [x] **Phase 0** — Scaffolding (monorepo, themes, sidebar, i18n)
- [x] **Phase 1** — Foundation (Manager + Research, JSON store, chat SSE)
- [x] **Phase 2** — Reading Helper, comparator, writing critic, artifacts, ratings, watcher, triggers, hierarchy
- [x] **Phase 3** — Custom agents, notifications, budget, cost dashboard, prompts library
- [x] **Phase 4** — Workflows, schedules, tools, library, studio (Remotion), captions
- [x] **Phase 5** — Mobile polish, module loader, hybrid Drizzle/JSON store, tests + CI
- [x] **Phase 6** — Temporal durable workflows (signals: cancel/pause/resume), LangGraph replaced by Temporal + BullMQ
