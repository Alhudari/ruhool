# Ruhool — Deployment & Architecture Roadmap

**Date**: 2026-04-22
**Audience**: Abdullah Al Hudaifi
**Topic**: How to deploy Ruhool, what works now, what's coming.

---

## Where we are today (2026-04-22)

### Built today
- **PhD Dashboard** at `/phd` — single merged dashboard with tabs (Overview, Tasks, Literature, Meetings, Insights), live charts, milestone timeline, theme-aware (light + dark)
- **Rumman (رمّان)** — Research Companion at `/companion` — bilingual chat, persistent cross-session memory, vault context injection, integration links to شواشة and meetings
- **Meetings** at `/meetings` — Claude Cowork-style meeting recorder with Obsidian write-back
- **Workspace sidebar** — switch between PhD / Studio / Ops / Lab / Intelligence / System contexts; clean focused nav
- **Clippy upgrade** — feature-explainer, guided tour mode, feedback persistence (`[TOUR_FEEDBACK]` parser)
- **Response length toggle** (S/M/L) on all agents — global preference
- **Voice profile** in Settings — long-form free text describing the user's voice; injected into all writing agents
- **PhD context addendum** — start date 2026-01-05, end 2029-2030, thesis title + Birmingham + Kuwait — shared across manager, research, reading-helper, comparator, writing-critic, research-companion
- **PhD working schedule** — 9-5 Birmingham, 1pm break, Mon-Fri default; manager updates it via `[PHD_SCHEDULE]` action tag, all PhD agents read it
- **Vault APIs** — `/api/vault/literature`, `/api/vault/tasks`, `/api/vault/atomic-notes`, `/api/vault/notes/*`
- **`/notes` rebuilt** — reads atomic notes directly from `01 PhD/03 Atomic Notes` with `obsidian://` deep links

### Architecture summary
```
┌──────────────────────────────────┐
│  Web (Next.js 14)  apps/web      │  → port 3000
│  ─────────────────────────────   │
│  Pages: /phd, /companion,        │
│         /meetings, /shwasha,     │
│         /notes, /papers, /tasks  │
└──────────────────────────────────┘
                ↕  proxied
┌──────────────────────────────────┐
│  API (Hono)  apps/api            │  → port 3001
│  ─────────────────────────────   │
│  Routes: /api/chat, /api/agents, │
│  /api/vault/*, /api/companion/*, │
│  /api/meetings/*, /api/clippy/*, │
│  /api/phd-schedule               │
└──────────────────────────────────┘
                ↕
        ┌───────────────┐
        │ Obsidian Vault│  C:\…\Obsidian\PhD  (LOCAL filesystem)
        │ Zotero Local  │  port 23119         (LOCAL only)
        │ Anthropic API │  cloud
        └───────────────┘
```

---

## Three deployment options, ordered by maturity

### Option A — Current: Local-first (today)

**Status**: ✅ Working

- Runs on your laptop only (`pnpm dev`)
- Reads/writes Obsidian vault directly from disk (OneDrive sync handles sharing across your devices)
- Reads Zotero from `localhost:23119` (Zotero Local API)
- All AI calls go to Anthropic cloud
- Memory and conversations persist in `data/store.json`

**Pros**:
- Simplest setup
- Full filesystem speed
- Zotero highlights/PDFs available immediately
- No data leaves your machine except LLM prompts

**Cons**:
- Only works when your laptop is on
- No remote access (phone, other PC)
- Slow when OneDrive is syncing

---

### Option B — Cloud-first: Vercel + Sync (next)

**Status**: 🚧 Roadmap

The web + API both deploy to Vercel. The vault and Zotero are accessed via cloud APIs instead of local filesystem.

**What changes for the cloud deployment:**

| Component         | Local (today)             | Cloud (B)                                    |
|-------------------|---------------------------|----------------------------------------------|
| Vault read/write  | Direct fs (OneDrive)      | Obsidian Sync API **or** Git-backed vault   |
| Zotero            | Local API (port 23119)    | Zotero Web API (free, requires API key)      |
| Store             | `data/store.json`         | Neon Postgres / Vercel KV alternative        |
| Background jobs   | BullMQ + local Redis      | Vercel Queues (beta) or Inngest              |
| File uploads      | Local `data/`             | Vercel Blob (public + private)               |

**To enable cloud option, build adapters:**

1. **`packages/core/src/integrations/obsidian/sync-adapter.ts`**
   Pluggable adapter: `LocalFsAdapter` (today) or `GitVaultAdapter` (clones a Git repo to a tmp dir, commits writes back).

2. **`packages/core/src/integrations/zotero/web-api.ts`**
   Mirror of `local-api.ts` but uses `https://api.zotero.org/users/{id}/...`. Already half-built.

3. **`vercel.ts`** at repo root with proper config (Vercel Functions, blob storage, env wiring).

4. **Deploy steps** (when ready):
   ```bash
   npm i -g vercel
   vercel link
   vercel env add ANTHROPIC_API_KEY production
   vercel env add ZOTERO_USER_ID production
   vercel env add ZOTERO_API_KEY production
   vercel env add OBSIDIAN_GIT_REPO production   # if using Git-backed vault
   vercel deploy --prod
   ```

**Pros**:
- Works from any device, no laptop required
- Phone access via mobile browser
- Always on, always synced

**Cons**:
- Need to migrate vault to Git or pay for Obsidian Sync ($4/mo)
- Need Zotero Web API key (free, but slower than local)
- More moving pieces (Postgres, Blob, etc.)

---

### Option C — Hybrid: Always-on home PC (future)

**Status**: 🔮 Future

A small mini-PC (Intel NUC, Mac mini, or Raspberry Pi 5) at home runs Ruhool 24/7. You access it from anywhere via Tailscale.

**Setup**:
- Mini-PC running Linux + Docker
- Tailscale for secure remote access (no port forwarding needed)
- Local LLMs (Gemma 3, Llama 3.3) for privacy-sensitive tasks via Ollama
- Anthropic API for heavy tasks
- Obsidian vault on the PC; SyncThing or rsync to your laptop

**Architecture**:
```
┌──────────┐    Tailscale     ┌──────────────────┐
│ iPhone   │ ←──────────────→ │  Home Mini-PC    │
│ Laptop   │                  │  ───────────────  │
│ Other PC │                  │  Ruhool web+api  │
└──────────┘                  │  Obsidian vault  │
                              │  Zotero          │
                              │  Local LLM       │
                              │  Postgres        │
                              └──────────────────┘
```

**Pros**:
- Home PC is always on → always-available agents
- Local LLMs for privacy
- No monthly cloud fees
- One vault truth, accessible everywhere

**Cons**:
- Hardware purchase (~$300-600 one-time)
- Initial setup is more work
- You maintain it (updates, backups)

---

## "Even when laptop is off" — the sync question

Today's local-first option needs the laptop on. To get **always-on access without buying hardware**, the cleanest path is:

### Short-term (months 1-3): Git-backed vault

1. `cd "C:\Users\alhud\OneDrive…\Obsidian\PhD"` and `git init`
2. Push to a private GitHub repo (free)
3. Use the [Obsidian Git plugin](https://github.com/Vinzent03/obsidian-git) — auto-commits every X minutes
4. Vercel deployment clones this repo at boot, reads it as the vault
5. Writes from Vercel push back to the repo via GitHub API
6. Your local Obsidian pulls latest on open

**Result**: Vault works on Vercel even when laptop is off. Both laptop and cloud see the same content.

### Medium-term (months 3-6): Zotero Web API

Zotero already syncs to Zotero's cloud (free, 300MB). Get a Web API key at zotero.org/settings/keys. The cloud Ruhool reads via Web API, the local Ruhool keeps using the local API. Both see the same library.

### Long-term (year 1+): Home PC

If you find Vercel limiting (rate limits, function timeouts on long research jobs), migrate to a home PC. Tailscale gives the same "available everywhere" feel without cloud monthly costs.

---

## Audit findings (2026-04-22)

### Clean
- ✅ All Web TypeScript checks pass
- ✅ All API TypeScript checks pass (pre-existing supabase-store error excluded)
- ✅ All new endpoints respond correctly:
  - `GET /api/companion/memory` → `[]` (empty until Rumman fills it)
  - `GET /api/clippy/tour-feedback` → `[]`
  - `GET /api/settings/response-length` → `{ "responseLength": "medium" }`
  - `GET /api/phd-schedule` → full schedule object
  - `GET /api/vault/literature` → 100+ papers from Obsidian
  - `GET /api/vault/atomic-notes` → vault atomic notes
  - `GET /api/vault/tasks?subPath=01%20PhD` → vault task list
- ✅ research-companion (Rumman) registered in agent list
- ✅ Sidebar workspace switcher persists choice in localStorage
- ✅ Theme tokens used everywhere (light + dark both work)

### Known limitations
- ⚠️ Core package has pre-existing `@types/node` missing in tsconfig (template-parser, vault-reader, local-rest, zotero/local-api). Doesn't affect runtime since dependent packages have node types — but blocks `pnpm --filter @ruhool/core typecheck`. Fix: add `"types": ["node"]` to packages/core/tsconfig.json.
- ⚠️ Pages still listed in sidebar but not yet rebuilt with vault-aware data: `/papers` (uses Postgres papers store, not vault literature)
- ⚠️ Some legacy duplications across pages — e.g., `/analyst` and `/usage` both touch cost concerns
- ⚠️ Atomic Notes UI is read-only — no create/edit; Obsidian remains write surface
- ⚠️ Schedule UI not yet exposed — manager handles it via chat; a dedicated `/settings/schedule` panel would help

### Recommended fixes (priority order)
1. Fix `packages/core/tsconfig.json` to include node types (low risk, frees up CI typecheck)
2. Rebuild `/papers` page to read from `/api/vault/literature` instead of Postgres
3. Add `/settings/schedule` UI panel to expose PhD schedule directly (instead of going through manager)
4. Audit `/usage` vs `/analyst` overlap; merge or differentiate

---

## Vercel deployment — what you need to do

When you're ready to deploy:

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel login` and authenticate
3. Run `vercel link` from `C:\Users\alhud\platform`
4. Set env vars: `vercel env add ANTHROPIC_API_KEY production`
5. **Before first deploy**, build the cloud adapters described above (Git vault + Zotero Web API)
6. `vercel deploy --prod`

Don't deploy yet. The current code accesses your local OneDrive path — it would 404 in production. Build the Git/Web API adapters first; otherwise you'd have a broken deployment.

A safer interim: deploy *only the web* to Vercel and keep the API on your laptop, exposed via Tailscale or ngrok. The web stays accessible from anywhere; the API only works when your laptop is on. Less impressive, but a real first step.
