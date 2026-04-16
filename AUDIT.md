# Ruhool (رحول) — End-to-End Audit

**Date:** 2026-04-15  
**Auditor:** Automated read-only audit (Claude Opus 4.6)  
**Scope:** `C:/Users/alhud/platform/` — monorepo, excluding `node_modules/` and `.next/`.

---

## Executive Summary

Ruhool is an ambitious local-first, bilingual, multi-agent platform, but the codebase is in a **Phase 0→1 in-progress** state with sharp discrepancies between the stated architecture (Next.js + Hono + LangGraph + Temporal + Drizzle + BullMQ + pgvector) and the implemented reality (a single ~10,200-line `apps/api/src/index.ts` god-file backed by a JSON file store, with LangGraph, Temporal, and Drizzle not actually used in the hot path). The agent-naming invariants are internally inconsistent: the Manager is called **الراعي** in runtime prompts but **الرحول / رحول المدير** in the module manifest and README; **الرحول** is simultaneously both the platform name and a separate "architect" agent, which will confuse users. There are **zero automated tests**, no CI, no structured logging / correlation IDs, no auth on the API, CORS is the only perimeter control, and `dangerouslySetInnerHTML` is used to render user note HTML unsanitized. On the positive side: the theme token system is disciplined, a safety module (`packages/shared/src/safety.ts`) codifies forbidden commands and path constraints, `.env` handling is correct, and the agent persona prompts are rich and culturally grounded.

**Overall health by section (1–10, higher = better):**

| Section | Score |
|---|---|
| 1. Repository & architecture | 4 |
| 2. Agent system | 5 |
| 3. Bilingual (AR/EN) | 6 |
| 4. Theming | 8 |
| 5. UI/UX | 5 |
| 6. Security & privacy | 3 |
| 7. Reliability & observability | 3 |
| 8. Testing & quality | 1 |
| 9. Build / deploy / DX | 5 |
| 10. Documentation | 4 |

**Top 5 risks:**
1. `apps/api/src/index.ts` is a 10,202-line god-file with file-JSON persistence — unmaintainable and a data-loss risk.
2. XSS via `dangerouslySetInnerHTML` rendering user-authored HTML in Quick Notes.
3. No authentication on API; CORS is the only gate — ships "local-first" guarantee but a single misconfigured port exposure leaks everything.
4. Manager agent name collision: README/manifest say **الرحول**, runtime prompts say **الراعي** — also the same string **الرحول** is reused for a different "architect" agent.
5. Zero tests, no CI, no lint rules beyond `tsc --noEmit`; `any` escapes and TODO/FIXME noise growing.

**Go / no-go for production:** **NO-GO.** Treat this as pre-alpha internal tooling. Production readiness requires: test suite + CI, secrets migration from the JSON store, breaking up the api god-file, XSS sanitization, error boundaries, structured logs, and reconciling agent naming.

---

## Critical + High findings (summary table)

| ID | Title | File:Line | Severity | Impact | Fix |
|---|---|---|---|---|---|
| SEC-01 | XSS: raw HTML render of user note | `apps/web/src/components/notes-keep/keep-notes-page.tsx:293` | Critical | Arbitrary JS execution from any pasted/synced note | Sanitize with DOMPurify or render as markdown instead of HTML |
| SEC-02 | API has no authN/authZ; only CORS | `apps/api/src/index.ts:2670` | Critical | Any process on localhost (or port-forwarded) can read providers incl. API keys, agents, notes | Add bearer/session middleware; bind to 127.0.0.1 explicitly |
| SEC-03 | Provider API keys stored plaintext in JSON | `apps/api/src/index.ts:64,458` (`data/.store.json`) | Critical | Disk-read or backup leak reveals Anthropic/OpenAI/etc keys | Encrypt at rest with `ENCRYPTION_KEY`; move to OS keychain or DB w/ pgcrypto |
| REL-01 | 10,202-line god-file as server | `apps/api/src/index.ts:1-10202` | Critical | Unmaintainable; any change risks regression in unrelated domains | Split by domain: routes/, services/, workers/, schema/ |
| REL-02 | JSON file store used as primary DB | `apps/api/src/index.ts:47,458-461` | Critical | Race conditions on concurrent writes; corruption on crash; 600 KB file grows unbounded | Commit to Drizzle+Postgres path already scaffolded; JSON only as fallback |
| AGT-01 | Manager name inconsistency across layers | `README.md:5` vs `modules/agent/manager/manifest.json:5` vs `apps/api/src/index.ts:468,958` | High | Users see "الرحول" in marketing/manifest but "الراعي" in chat; prompt explicitly says "لست الرحول" | Pick one canonical name; README says "Ruhool" so runtime must match |
| AGT-02 | "الرحول" reused as both platform name and architect agent | `apps/api/src/index.ts:469,1136` | High | Self-referential confusion; user saying "hi الرحول" is ambiguous | Rename architect agent (e.g., **المصمم** / Al-Musammim) |
| AGT-03 | Specialist agents from memory spec missing or renamed | `apps/api/src/index.ts:467-479` | High | Spec promises عبدان/رمّان/شواشة/الصفرا/رمّانة/الدبسا but `رمّان` is absent; instead extra agents (الكرييتف، مهام، المحلل، المنظّم، المشخّص، الفطين، المُمرر) are present | Document actual roster in README; add رمّان or formally deprecate |
| SEC-04 | `dangerouslySetInnerHTML` for inline bootstrap scripts | `apps/web/src/app/layout.tsx:38,57` | High | Acceptable pattern, but bootstrap script reads `localStorage` keys and injects to DOM; any future value-interpolation would introduce XSS | Move SW registration to `next-pwa` or `useEffect`; keep theme boot minimal + CSP |
| SEC-05 | No CSP, no Trusted Types, permissive viewport | `apps/web/next.config.js:1-7`, `apps/web/src/app/layout.tsx:20-26` | High | No defense in depth vs XSS from SEC-01; `maximumScale:1, userScalable:false` breaks a11y/WCAG 1.4.4 | Add `headers()` with strict CSP; remove `userScalable:false` |
| TEST-01 | Zero tests, no CI | repo-wide | High | Regressions in 12k LOC API untested; refactors terrifying | Add vitest for `packages/core`, supertest for hono routes, Playwright for web smoke |
| OBS-01 | No structured logs, no correlation IDs | `apps/api/src/index.ts:2671` (`logger()` only) | High | Cannot trace a user chat end-to-end through BullMQ job + LLM call + store write | Add pino + requestId middleware; propagate into `logActivity` |
| UX-01 | Viewport locks zoom; harms low-vision and Arabic readers | `apps/web/src/app/layout.tsx:20-26` | High | WCAG 1.4.4 fail; Arabic readers often zoom for diacritics | Remove `maximumScale`/`userScalable` |
| UX-02 | RTL font swap is body-wide; mixed AR/EN prose loses Latin metrics | `apps/web/src/styles/globals.css:21-23` | High | Inline English tokens in Arabic UI render in Arabic font fallback, breaking spacing | Use `:lang(ar)` scoped rule and prefer `unicode-range` font-face splits |
| ARC-01 | Stated stack (LangGraph, Temporal, Drizzle) not wired | `README.md:19-23` vs `apps/api/package.json` (no langgraph/temporal deps) | High | Docs mislead contributors; onboarding wastes hours | Update README to match reality or add deps + minimal integration |
| ARC-02 | Docker compose starts Temporal but code does not connect | `docker-compose.yml:36-63`, no `@temporalio/client` import anywhere | High | Unused container drain + false security that workflows are durable | Remove Temporal containers or implement one workflow to prove the path |
| REL-03 | `index.ts.bak` checked in alongside live file | `apps/api/src/index.ts.bak` | High | Divergent logic ("Abdan (عبدان)" in bak only); confusion about source of truth | Delete `.bak` or move to git history |

Medium/Low/Nit findings appear inline below.

---

## 1. Repository & Architecture

**Structure (verified):**
- `apps/api` — single-file Hono server (10,202 LOC) + 9 small helpers (`agent-os.ts` 416, `agent-runner.ts` 186, `phase2.ts` 318, etc.).
- `apps/web` — Next.js 14 App Router, ~124 files, no API routes (pure client + fetch to :3001).
- `apps/studio` — Remotion bundle (2 files).
- `modules/` — declared as modular seam; only 7 manifests, 4 source files. Currently decorative: API does not load modules dynamically.
- `packages/core`, `packages/db`, `packages/shared` — skeletons; `core/src/index.ts` re-exports from non-existent paths (`./events/index.js`, `./llm/router.js`, etc.) — these files are **absent**. [Critical, ARC-03]
  - **Evidence:** `packages/core/src/index.ts:1-7` imports from paths not present in the directory listing.

**Findings:**
- [Critical] **ARC-03** `packages/core/src/index.ts:1-7` — imports `./events/index.js`, `./llm/router.js`, `./registry/index.js`, `./memory/index.js` but only `index.ts` and `llm-and-events.ts` exist. Build will fail. Fix: create stubs or correct exports.
- [High] **ARC-01** `README.md:19-23` — claims LangGraph + Temporal + Drizzle + pgvector + BullMQ. Reality: only BullMQ + pg are imported in `apps/api/package.json`; Drizzle in `packages/db` is unused by the running API; LangGraph not present.
- [High] **ARC-02** `docker-compose.yml:36-63` — Temporal + Temporal UI containers with no client integration.
- [High] **REL-02** `apps/api/src/index.ts:47-60, 449-461` — `DATA_DIR/.store.json` is the primary store; 600 KB already. No locking, full-file rewrite on every mutation.
- [High] **REL-01** `apps/api/src/index.ts` — 10,202 lines including inline providers, system prompts, routes, schedulers, workers, file handlers, nodemailer, SSE. No route grouping beyond literal `app.get(...)`. Impossible to reason about cohesion.
- [Medium] **ARC-04** `modules/` is not loaded by code. `apps/api/src/index.ts` has no dynamic `import()` of module manifests. The "plugin" architecture is aspirational.
- [Medium] **ARC-05** `pnpm-workspace.yaml:3` globs `modules/*/*` which matches manifests-only directories without `package.json` — these won't be installable workspaces. Verify `pnpm install` is clean.
- [Low] **ARC-06** `turbo.json` defines `dev/build/test/lint` but no `test` scripts exist in any package.json.

**Local-first verification:** The API boot sequence (`apps/api/src/index.ts:10153-10200`) attempts Postgres then falls back to JSON; no blocking cloud call at boot. LLM calls are **lazy** and only fire on user chat, using locally stored keys. [Verified, OK.] Service worker (`apps/web/public/sw.js`) present but not read here [Unverified].

## 2. Agent System

**Naming consistency — the biggest issue in the project.**

| Source | Manager name | Architect/Platform name |
|---|---|---|
| `README.md:1-5` | "Ruhool" / رحول (platform + lead agent unified) | N/A |
| `modules/agent/manager/manifest.json:5` | "Ruhool Manager" / **رحول المدير** | N/A |
| `modules/agent/manager/src/index.ts:1` | "Ruhool (رحول)" | N/A |
| `apps/api/src/index.ts:468,958-1010` | **الراعي** (Al-Ra'i, "the shepherd") | **الرحول** is the *architect* agent |
| `apps/web/src/components/layout/sidebar.tsx:58-68` | `manager: الراعي`, `architect: الراعي` (typo — duplicate!) | both map to الراعي |
| `apps/api/src/index.ts.bak:409-412` | "Abdan (عبدان)" listed as research, "الرحول = القائد" (leader) | Older model, now contradicted |

- [High] **AGT-01** Manager name diverges between README/module manifest ("Ruhool / رحول") and runtime system prompt ("الراعي"). The runtime prompt at `apps/api/src/index.ts:960` actively says **"لست الرحول"** — *"I am not Ruhool"* — which contradicts the README and the product name. Users will be bewildered.
- [High] **AGT-02** `apps/api/src/index.ts:469, 1136-1150` — the *architect* agent is named **الرحول**, identical to the platform name. The prompt at line 1148 even instructs it to stay silent when addressed as "@الرحول" in certain contexts. Pick distinct names.
- [High] **AGT-03** `apps/api/src/index.ts:467-479` — specialist roster actually implemented: الراعي (manager), عبدان (research), شواشة, الصفرا, رمّانة, الرحول (architect!), الدبسا, الكرييتف, مهام, المحلل, المنظّم, المشخّص, الفطين, المُمرر. **رمّان (academic research)** from the spec is missing. Eight *additional* agents not in the spec are present.
- [Medium] **AGT-04** `apps/web/src/components/layout/sidebar.tsx:59 & 64` — both `manager` and `architect` map to `{ en: "Al-Ra'i", ar: 'الراعي' }`. Probable copy-paste bug; architect should be الرحول per the server.

**Orchestration control loop:**
- [Medium] **AGT-05** The Manager prompt (`apps/api/src/index.ts:958-1044`) relies on text markers (`أحلتها لعبدان ✓`) rather than structured tool-calls for delegation. No deterministic routing; depends entirely on model following instructions.
- [Medium] **AGT-06** `agent-runner.ts:1-186` [Unverified in detail — not fully read] — spot-check recommended for loop termination conditions, max steps, and cost-guard.
- [Low] **AGT-07** `modules/agent/manager/src/index.ts:32` — `preferredModel: 'claude-sonnet-4-6'` hard-codes a model slug that may not exist on the account. Same in research module. Match against `modules/llm-provider/anthropic/src/index.ts:41-70`. OK for now.

**Prompt construction:**
- [Medium] **AGT-08** System prompts are literal string constants in `index.ts` (lines ~958–1870). No versioning, no diffing, no hot-reload for iteration. `settings/prompts` UI exists but coupling is unclear.
- [Nit] **AGT-09** Prompts contain personal biographical details about "عبدالله" hardcoded (`apps/api/src/index.ts:970` region). Consider a config so the template can be reused.

**Model routing:**
- [Low] **AGT-10** `modules/llm-provider/anthropic/src/index.ts:138` — uses `as Record<string, number>` to pluck `cache_read_input_tokens`; SDK already exposes this field typed in recent versions. Upgrade SDK (currently `^0.39.0`; latest is ~0.6x).

## 3. Bilingual (AR/EN) Correctness

- [High] **UX-02** `apps/web/src/styles/globals.css:21-23` — `[dir='rtl'] body { font-family: var(--font-arabic); }` swaps the **entire** body font to Arabic when language is Arabic. English tokens inside Arabic UI (brand names, code, URLs) will render in an Arabic font's Latin fallback — usually worse metrics.
  - Fix: keep `--font-sans` and rely on `unicode-range` in `@font-face`, or scope Arabic font to `:lang(ar)` + specific elements.
- [Medium] **I18N-01** `apps/web/src/i18n/ar.json` has ~105 keys; `en.json` not inspected but expected to match. Many UI strings in components appear to be hardcoded bilingual `{ en, ar }` objects instead of using `useT()` — the sidebar is an example (`sidebar.tsx:58-110`). Two translation systems coexist.
- [Medium] **I18N-02** `apps/web/src/i18n/use-translation.ts:21-27` — flat key lookup, no pluralization, no interpolation support. Fine now, will bite later.
- [Medium] **I18N-03** `apps/web/src/app/layout.tsx:34` ships SSR with `lang="en" dir="ltr"` hard-coded; the inline boot script (`:39-54`) switches on hydration. Arabic users see flash of LTR English shell for ~100ms. Consider reading a cookie in middleware to pre-render correct `dir`.
- [Medium] **I18N-04** Mixed Unicode in sidebar: `\u0627\u0644\u0643\u0631\u064a\u064a\u062a\u0641` (الكرييتف), `\u0645\u0647\u0627\u0645` (مهام), etc. (`sidebar.tsx:66-67, 100-102`). Mix of literal Arabic and escaped codepoints suggests some editor lost encoding on save. Normalize to UTF-8 literal.
- [Low] **I18N-05** Arabic typography quality: Theme 3 (Academic) uses Amiri (`themes.css:141`) — great for serif body. Theme 1 uses IBM Plex Sans Arabic — good. Theme 2 uses Noto Sans Arabic — acceptable. But `--font-arabic` is **the same** regardless of chosen theme if dir=rtl because of the broad body rule. Confirm intended theme-per-font pairing.
- [Low] **I18N-06** `apps/web/src/styles/globals.css:5` loads 7 Google Fonts families in a single request; blocking for FCP. Add `font-display: swap` (already implicit in Google's URL) and prefer self-hosted via `next/font`.
- [Nit] **I18N-07** AR manifest `name.ar` is `رحول المدير` — grammatically awkward; read naturally as "Ruhool, the manager". The README uses "الرحول — lead she-camel". Pick one.

## 4. Theming (3 themes)

- [OK] Tokens are consistently defined in `apps/web/src/styles/themes.css` for all three themes × light/dark. Tailwind config (`tailwind.config.ts:8-36`) maps them to utility classes. This is a strong foundation.
- [Medium] **TH-01** Hardcoded colors in components: 51 hex literals across 10 component files (`analyst-page.tsx:10`, `knowledge-graph.tsx:11`, `clippy-help.tsx:12`, `tasks-page.tsx:6`, etc.). Audit each; visualization files (knowledge-graph, employee-of-month) may be legitimate (SVG palettes) but clippy-help should tokenize.
- [Medium] **TH-02** Dark-mode variants for themes are complete (claude-clean, vintage-terminal, academic), but **Theme 2 is mislabeled**: the selector is `vintage-terminal` yet comment says "Desert Caravan (Ruhool)" with sand/amber palette (`themes.css:62`). Rename the data-theme to `desert-caravan` to match the concept — users will also see this string in localStorage.
- [Medium] **TH-03 [Unverified]** WCAG AA contrast: did not compute ratios programmatically. Spot checks:
  - `claude-clean` light: `#5c5c5c` on `#fafaf7` ≈ 6.4:1 — AA pass.
  - `claude-clean` dark `--color-on-surface-secondary:#a0a0a0` on `#0a0a0a` ≈ 9:1 — AA pass.
  - `vintage-terminal` light: `#9a7b61` (tertiary) on `#f5ebe0` ≈ 3.3:1 — **AA FAIL for body text**, OK for large/disabled.
  - `academic` light: `#718096` on `#f9f6f0` ≈ 3.7:1 — **AA FAIL for body text**.
  - **Recommendation:** run axe-core/Pa11y across each theme and fix tertiary tokens.
- [Low] **TH-04** `themes.css:111-113` has orphaned comment "Subtle dune pattern via gradient:" with no following gradient — unfinished work.
- [Low] **TH-05** No theme-switch animation / flash-of-wrong-theme mitigation beyond the inline boot script (which is correct). Consider `color-scheme` meta to match browser chrome.
- [Nit] **TH-06** Ring tokens use `40` alpha suffix (`#7c5aed40`) — modern syntax `rgb(... / 25%)` is more readable.

## 5. UI / UX

**Information architecture:** Sidebar (`sidebar.tsx:119-150`) organizes nav into 6 groups (Herd, Organize, Work, Research, Lab, …). 34 distinct pages is a *lot* for a solo-user PhD tool. Consider hide-by-default groups and an "advanced" mode.

- [High] **UX-01** `apps/web/src/app/layout.tsx:20-26` — `maximumScale: 1, userScalable: false` violates WCAG 1.4.4 (Resize text). Remove.
- [Medium] **UX-03** Only **7 `aria-label`/`role`/`tabIndex`** usages across all app components (`voice-mode.tsx:4`, `item-menu.tsx:1`, `notification-bell.tsx:1`, `library-page.tsx:1`). For a 34-page app, accessibility annotations are near-zero.
- [Medium] **UX-04** No global error boundary in `apps/web/src/app/layout.tsx`. One component throw → blank page. Add `error.tsx` and `global-error.tsx` per Next.js App Router convention.
- [Medium] **UX-05** No loading.tsx / Suspense boundaries. Pages read from `apiFetch` but loading state handling is per-component and inconsistent [Unverified sample-wide].
- [Medium] **UX-06** Sidebar items for Arabic (`sidebar.tsx:100-102`) mix escaped unicode (`\u0627\u0644\u0645\u0647\u0627\u0645`) with literal Arabic in same object — suggests a recent paste. Reader confusion & encoding fragility.
- [Medium] **UX-07** `ClippyFloating` mounted globally in `layout.tsx:70` without any gate — a playful "Clippy" helper sits on every page including Settings and Approvals. Consider opt-in or contextual.
- [Low] **UX-08** `tailwind-merge` + `clsx` via `lib/utils.ts` — standard pattern. Good.
- [Low] **UX-09** The `home-page.tsx` and `dashboard-page.tsx` split is unclear; both exist at `/` and `/dashboard`. Define roles.
- [Nit] **UX-10** RTL keyboard focus order depends on DOM order, not `dir` — verify `Tab` flows right-to-left visually in Arabic mode [Unverified].
- [Nit] **UX-11** Screen-reader handling of Arabic: `lang` is set on `<html>` dynamically; confirm first Arabic page load also flips `lang` before SR announces content (currently via boot script — OK).

## 6. Security & Privacy

- [Critical] **SEC-01** `apps/web/src/components/notes-keep/keep-notes-page.tsx:293` — `dangerouslySetInnerHTML={{ __html: note.content || '' }}`. Any `<img onerror>` / `<script>` in a note executes. If notes ever sync across devices or import from files, this becomes remote XSS.
- [Critical] **SEC-02** `apps/api/src/index.ts:2670` — CORS is the only boundary. No bearer token, no session, no origin check beyond `http://localhost:3000`. `curl localhost:3001/api/providers` from any local process reads providers. Binding may be `0.0.0.0` by default with Hono/node-server — verify. At minimum add a `Bearer` guard shared via env + first-run UI.
- [Critical] **SEC-03** `apps/api/src/index.ts:64, 458-461` — `ProviderRecord.apiKey` is plaintext in `data/.store.json`. `.env.example:25` defines `ENCRYPTION_KEY` but no code uses it. The key-redact on the `/api/providers` GET (`apps/api/src/index.ts.bak:360`) only strips for the *response*, not at rest.
- [High] **SEC-04** Bootstrap scripts via `dangerouslySetInnerHTML` in `apps/web/src/app/layout.tsx:38, 57`. Content is currently static, but any future interpolation of a user-controlled value into these scripts would be XSS. Prefer `<Script>` components.
- [High] **SEC-05** No Content-Security-Policy headers. `next.config.js:1-7` is three lines. Add `headers()` with default-src 'self', strict-dynamic for scripts.
- [Medium] **SEC-06** `docker-compose.yml:9, 11` — defaults `ruhool / ruhool_dev` if env missing. Developers running `docker compose up` without `.env` get insecure defaults with the port exposed on 5432. Add a `.env` required gate or fail-fast.
- [Medium] **SEC-07** Prompt-injection: 14 agent system prompts concatenate user messages without separation markers like `<user>` / `<delegation>` tags. Research agent (`modules/agent/research/src/index.ts`) has anti-fabrication rules but not anti-injection. Add structured delimiters and URL-fetch allowlists.
- [Medium] **SEC-08** `packages/shared/src/safety.ts:102-110` — secret regex is a solid start but doesn't flag Claude's `sk-ant-...` specifically (pattern matches generally via `sk-`). Add explicit patterns.
- [Medium] **SEC-09** Notifications: `nodemailer` imported (`apps/api/src/index.ts:34`); SMTP creds stored where? If in `.store.json`, same leak as API keys.
- [Low] **SEC-10** `apps/api/src/db-setup.ts:22` fallback password `ruhool_dev` in source — fine for dev, but ensure Prod refuses to boot with default.
- [Low] **SEC-11** No dependency audit in CI (there is no CI). Run `pnpm audit` manually and triage CVEs.

## 7. Reliability & Observability

- [Critical] **REL-01** (see above) — 10k LOC single file.
- [Critical] **REL-02** (see above) — JSON file store with full rewrite on every mutation (`:458`), no lockfile, no write-ahead log.
- [High] **OBS-01** No structured logging. Only `hono/logger()` (`:2671`) + ad-hoc `console.log`/`console.warn`. 13+ `process.env` reads but no log of which ones are missing at boot.
- [High] **REL-03** `apps/api/src/index.ts.bak` — 990 KB backup file committed-or-present alongside live `index.ts`. Resolve.
- [Medium] **REL-04** `apps/api/src/index.ts:445, 10167` — BullMQ queue init failure is warned then swallowed. Research jobs silently lost when Redis down.
- [Medium] **REL-05** `setInterval(..., 10*60*1000)` for watcher (`:10184`) and 60s schedule checker (`:10129`): if the server process hibernates (Windows suspend), intervals drift. Fine for dev; note for prod.
- [Medium] **REL-06** No error boundaries in web (see UX-04).
- [Medium] **OBS-02** No correlation IDs. A chat `POST /api/chat/stream` spawns queue jobs, LLM calls, store writes — impossible to correlate.
- [Medium] **OBS-03** `logActivity` (`:481-508`) trims in-memory to 500 records and broadcasts via SSE — good for local UI, but persisted into the same `.store.json` on next save → file grows with every chat.
- [Low] **REL-07** `daily-backup.ts` exists (118 LOC) — likely trustworthy as dedicated file but not verified here.
- [Low] **REL-08** No backup-restore verification step documented.

## 8. Testing & Quality

- [High] **TEST-01** Zero test files found in source tree (excluding node_modules). `turbo.json` declares a `test` pipeline but no package has a `test` script.
- [Medium] **Q-01** `any` usage: 10 occurrences in source (8 in `apps/api/src/index.ts`, 1 in `code-fixer.ts`, 1 in `lib/api.ts`). Acceptable volume but each deserves a comment.
- [Medium] **Q-02** `: any` plus `as unknown as X` casts — e.g., `apps/api/src/index.ts:10188` `store as unknown as Phase2StoreLike`. Evidence that the store type has diverged from Phase2's assumed shape. Unify.
- [Medium] **Q-03** `console.log` literal count in app source: ~15 across `apps/api/src/**` + `apps/api/src/db-setup.ts` (18) + `daily-backup.ts` (5). Not excessive, but migrate to `pino`.
- [Medium] **Q-04** TODO/FIXME: 7 occurrences across 4 app files. Low debt; address them.
- [Medium] **Q-05** Lint scripts are `tsc --noEmit` (api) and `next lint` (web) — no eslint config verified. Add `@typescript-eslint/recommended-type-checked`.
- [Low] **Q-06** `tsconfig.base.json` is strict (`noUnusedLocals`, `noUnusedParameters`). Good. But no extends in every package verified.
- [Low] **Q-07** Dead code: `apps/api/src/index.ts.bak`, `data/videos/debug/last-failed-*.tsx` under persisted data — clean up.
- [Nit] **Q-08** `packages/core/src/index.ts` re-exports that don't resolve (see ARC-03) — breaks TS build.

## 9. Build, Deploy, DX

- [Medium] **DX-01** Install surface: pnpm-lock.yaml is 363 KB with `.pnpm` store resolved — expected. First install likely 3–5 min on cold cache. No lockfile issue flagged.
- [Medium] **DX-02** Root `package.json:6-14` — only 4 scripts. No `typecheck`, no `format`, no `ci`, no `prepare`. Solo-dev but still worth.
- [Medium] **DX-03** No Vercel config (`vercel.json` absent). `README` says local-first (good), but if deploying `apps/web`, you'll hit `process.env.NEXT_PUBLIC_API_URL` defaulting to localhost:3001 — confusing.
- [Medium] **DX-04** `apps/api/package.json:28` — `pdf-parse: ^2.4.5`. That package is known for quirky CJS imports (see the `@ts-expect-error` hack at `apps/api/src/index.ts:29-32`). Consider `unpdf` or `pdfjs-dist`.
- [Medium] **DX-05** No `.nvmrc` / `.tool-versions`. `engines.node:>=20` in root is minimal.
- [Low] **DX-06** `turbo.json:12` — `test` depends on `build`, which is slow-cycle for TDD. Split `test:unit` that doesn't.
- [Low] **DX-07** `apps/studio` has Remotion but no build/render script in root.
- [Nit] **DX-08** Emoji usage in console (`:10196` `'\n  Ruhool API running'`) — inconsistent; some have box-drawing, some spaces.

## 10. Documentation

- [High] **DOC-01** `README.md` misstates the stack (LangGraph, Temporal, Drizzle) — see ARC-01.
- [High] **DOC-02** No per-agent documentation. Someone reading `modules/agent/manager/` sees a 36-line `index.ts` with a prompt but no behavior contract (inputs, tools it may call, tokens budget).
- [Medium] **DOC-03** No CONTRIBUTING.md, no CODE_OF_CONDUCT, no AGENTS.md describing the taxonomy, no ADRs for the JSON-store vs Drizzle decision.
- [Medium] **DOC-04** Phase roadmap (`README.md:44-51`) lists Phase 1 as not done, but the codebase clearly has phases 2+ features (writing critic, workflows, cost dashboard). Update.
- [Medium] **DOC-05** `.env.example` is comprehensive (good) but doesn't document which keys are **required** to boot vs optional.
- [Low] **DOC-06** No screenshots of themes in README. For a design-heavy project this is a miss.
- [Nit] **DOC-07** README mixes English and Arabic in headings inconsistently.

---

## Prioritized Remediation Roadmap

### Week 1 — stop the bleeding
1. **SEC-01** Sanitize or markdown-render `keep-notes-page.tsx:293`. Use `react-markdown` (already a dep) or DOMPurify.
2. **SEC-02** Gate the API with a bearer token behind a single env var. Bind to `127.0.0.1` explicitly in `apps/api/src/index.ts:10196`.
3. **AGT-01 / AGT-02** Decide canonical names and search-replace. Suggested:
   - Platform = **Ruhool (رحول)** (unchanged).
   - Manager agent = **الراعي** (Al-Ra'i). Update README + `modules/agent/manager/manifest.json:5` to match runtime.
   - Architect agent rename from **الرحول** to e.g. **المصمم** / *Al-Musammim*.
4. **SEC-03** Encrypt provider API keys at rest using `ENCRYPTION_KEY`. Node `crypto.createCipheriv('aes-256-gcm', ...)`.
5. **UX-01** Remove `maximumScale: 1, userScalable: false` from `apps/web/src/app/layout.tsx`.
6. **REL-03** Delete `apps/api/src/index.ts.bak`.

### Month 1 — structural health
7. **REL-01** Break `apps/api/src/index.ts` into routes/, services/, workers/, prompts/. Target: ≤500 LOC per file. Start by extracting all `SYSTEM_PROMPT` constants into `apps/api/src/prompts/`.
8. **REL-02** Commit to Drizzle+Postgres. Migrate providers, usage, conversations, messages first; keep JSON for user artifacts (notes, tasks) if desired.
9. **TEST-01** Add vitest to `packages/core`, supertest to `apps/api`, Playwright smoke for `apps/web`. CI on GitHub Actions with `pnpm -r test`.
10. **OBS-01 / OBS-02** Introduce pino + requestId middleware. Propagate through BullMQ job opts and LLM calls.
11. **TH-03** Fix AA contrast failures in tertiary text tokens for vintage-terminal and academic themes.
12. **UX-03 / UX-04** Add error boundaries + auditable aria annotations starting with Sidebar, Chat, and Agents pages.
13. **ARC-01 / DOC-01** Update README stack section to reflect reality; add ADR for "why JSON store today".

### Quarter 1 — deliver on the promise
14. **ARC-02** Either remove Temporal containers or implement a durable workflow for Research jobs.
15. **ARC-04** Implement actual module loading from `modules/` (manifest discovery, dynamic import, permission enforcement per `manifest.json`).
16. **SEC-05** Add CSP + Trusted Types; audit with `securityheaders.com` equivalent locally.
17. **I18N-03** Move language detection to Next.js middleware using cookies, eliminating FOUC.
18. **DOC-02** Write per-agent contracts: purpose, inputs, outputs, tools, memory tier, eval set.
19. **AGT-03** Resolve spec vs reality for specialists: implement رمّان (academic research) or formally drop it. Ship an AGENTS.md.
20. **Q-01/02** Eliminate `any` and `as unknown as` casts by unifying `StoreData` with `Phase2StoreLike` / `AgentOSStore` / `RunnerStoreLike`.

---

*End of audit. See inline file:line references for evidence of every finding. No source files were modified; this report is the sole write.*

---

## Addendum 2026-04-15 — SEC-11 dependency audit residuals

After running `scripts/bulk-audit.mjs` (pnpm's own `audit` command fails
with HTTP 410 on the retired endpoint — see
`docs/security/dependency-audit-2026-04-15.md`), the following high/moderate
advisories remain unfixed because they require changes gated by other
workstreams:

- [High] **SEC-11a / UPGRADE-NEXT-15** `next@14.2.35` in `apps/web` has
  two high-severity DoS advisories (HTTP request deserialization,
  Server Components DoS) plus three moderate ones (image optimizer DoS,
  rewrites smuggling, image cache growth). Fix requires upgrading to
  `next@15.5.x` — a major bump forbidden by the SEC-11 scope rules.
  Owner: web team. Mitigation today: CDN/WAF in front; rate limiting.

- [Moderate] **SEC-11b / UPGRADE-NEXT-INTL-4** `next-intl@3.26.5`
  open-redirect advisory. Fix at `>=4.9.1` (major, touches
  `apps/web/src/**` locale routing). Owner: web team. Mitigation today:
  no user-controlled redirect targets in current routes (verified by
  grep).

- [High] **SEC-11c / REPLACE-XLSX** `xlsx@0.18.5` in `apps/api` has two
  high-severity advisories (Prototype Pollution, ReDoS). **No fix is
  published to the npm registry** — SheetJS only publishes patched
  versions to `cdn.sheetjs.com`. Options: (a) replace with `exceljs`,
  (b) install patched tarball from the SheetJS CDN, (c) accept residual.
  Owner: api team. Mitigation today: `xlsx` is used only on
  server-side admin export paths with trusted internal data; no
  untrusted workbook parsing.

**Fixes landed under SEC-11** (documented in detail in the audit doc):
- `drizzle-orm`: 0.38.4 → 0.45.2 (resolves high SQL-injection).
- `drizzle-kit`: 0.30.6 → 0.31.10 (unlocks esbuild 0.25.x).
- `esbuild`: pnpm override pinning all `<=0.24.2` to `^0.25.0`
  (resolves moderate dev-server request forgery, two instances).
- Tests: `pnpm -r test` green, 40/40 (24 in `apps/api`).
