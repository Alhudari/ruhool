# Deferred — PRISMA 2020 integration

**Status:** deferred (user's standing decision).

## Context

User owns **two** PRISMA 2020 systematic-review apps and wants to
integrate one of them into Ruhool. The plan is:

1. Pick the canonical source repo.
2. Expose its backend via API.
3. Build a new consumer UI inside Ruhool.
4. Later: merge or retire the other copy.

## The two candidates

| Label | Local path | GitHub | Vercel project | Stack | Approved? |
|-------|------------|--------|----------------|-------|-----------|
| **A — `prisma-sr`** | `C:\Users\alhud\Documents\claude code\prisma-sr` | `https://github.com/Alhudari/prisma-scholar.git` | `prisma-sr` | Next.js + Prisma ORM + libSQL/Turso + bcryptjs + vitest | user said the **older one is approved** — likely this |
| **B — `prisma-scholar`** | `C:\Users\alhud\prisma-scholar` | no remote | `prisma-scholar` | Next 16 + Supabase + Zustand + shadcn | newer, different stack |

## Why deferred

User asked to keep PRISMA parked through Rounds 1-3. This doc records
the state so a future session can pick it up without rediscovery.

## When to un-defer

Any of:
- User confirms which candidate is the canonical source.
- User shares the production Vercel URL for end-user hand-off.
- User wants to ship a PRISMA template pre-wired into the existing
  Canvas templates feature (`CanvasPage.tsx` → PRISMA template already
  exists as a stub — could be upgraded to consume real PRISMA data).

## What the existing codebase already does for PRISMA

- `CanvasPage.tsx` ships a **PRISMA 2020 flow template** (Round 1) —
  pure frontend, doesn't touch either prisma-sr or prisma-scholar.
- The Zotero browser (`ZoteroBrowser.tsx`) is the closest piece to a
  real PRISMA workflow — users pick papers, add them to collections.

## Integration plan sketch (not implemented)

When this un-defers:
1. Add `/api/prisma/*` routes that proxy to the chosen PRISMA app.
2. Build `apps/web/src/components/prisma/` UI panels.
3. Deep-link from the Canvas PRISMA template to the real PRISMA run.
4. Single source of truth: PRISMA data lives in the chosen backend;
   Ruhool renders + decorates with its own agents (Shwasha reads,
   Rammana compares).

Authoring note: don't mention PRISMA in user-facing copy until a
direction is picked — the confusion of having two half-integrated
views is worse than having none.
