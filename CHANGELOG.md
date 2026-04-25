# Changelog

All notable changes to Ruhool are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added — Round 16 (Fresh start + in-platform inbox) — 2026-04-24

**صندوق التقارير داخل المنصة.**
Abdullah doesn't have Resend configured yet, so `store.reportInbox`
now mirrors every successfully-composed report. Compose is no longer
gated on Resend presence — reports are delivered to the inbox always,
and mailed only if Resend is configured + recipients exist.

- `ReportInboxItem` type: `{ id, reportId, runId, subject, html,
  bodyMarkdown, from, sentAt, read, starred, tags }`
- Routes: `GET /api/reports/inbox` (paginated list, newest first),
  `GET /:id` (full body), `PATCH /:id` (read/starred toggle),
  `DELETE /:id`, `POST /mark-all-read`
- Page at `/reports-inbox` — two-pane mail client UX (list + reader)
  with unread badge, star/delete, pagination
- Sidebar: `reports-inbox` added to QUICK_ACCESS next to notifications

**إعادة بدء + ترحيب.**
New endpoint `POST /api/platform/reset-to-fresh` + **Fresh Start**
button on the Setup page. Wipes user content (conversations,
messages, memories, tasks, graphs, reports) while preserving
technical config (provider keys, Resend config, Google OAuth, prefs).
Seeds a welcome inbox item from الراعي explaining:
- The 7 research agents and their roles
- Three-week onboarding path: define question → structured reading →
  weekly plan
- How to @mention + chain agents
- Where reports land (the new inbox)

### Added — Round 13 (Punch-list marathon) — 2026-04-23

Shipped items 1-10 + 19-23 + Abdullah's setup walkthrough in a single
non-stop pass.

**Reports — resilience + formats.**
- `services/reports/send.ts` — **retry with exponential backoff**
  (30s → 2min → 10min, 3 attempts). Fast-fails on permanent codes
  (400/401/402/403/404/409/422) so "unverified domain" style errors
  bubble up immediately. Transient 5xx / rate-limit gets retried.
- **PDF export.** Preview modal gains a `PDF` button that opens the
  rendered HTML in a fresh window and calls `window.print()` — user
  picks "Save as PDF" in the print dialog. No jspdf/puppeteer dep.
  `HTML` download stays for raw archive.

**Chat SSE → toasts for every action type.**
- `event: tasks` → shows "📋 أُضيفت مهمة" (singular) or "أُضيفت N مهام"
- `event: notifications` → shows "🔔 تنبيه" (singular) or "N تنبيهات"
- `event: reports` → unchanged (already existed)

**Settings IA cleanup.**
- **20 tabs regrouped into 5 semantic bands** — Connections / Agents
  / Identity & Preferences / Life & Finance / Notifications & Safety.
  No tabs removed, but related ones sit adjacent now so it's one
  scroll of the eye to find what you need.
- **System workspace reordered** — `setup` demoted to last position
  (it's destructive), `settings` + `conversations` + `ambient` grouped
  in a sensible order. `usage` added to Diagnostics.

**A2A readiness.**
- `data/agent-cards.json` — 19 agent cards in A2A v0.2 schema shape
  (`capabilities`, `domains`, `streaming`, `auth`). Not yet exposed
  over HTTP — this is a zero-cost "have it ready for Phase 2" move
  so when A2A bridging lands (local Gemma / Tailscale federation /
  3rd-party agents), the descriptors are already written.

**Tests — 185 → 190.**
- 5 new unit tests in `compose.test.ts` for R12b enrichment blocks
  (Zotero / Vault / Meetings / Budget — each verified to inject
  when enabled and omit when disabled).
- 2 new E2E specs:
  - `reports-settings.spec.ts` — settings panel smoke, template
    picker, 8-toggle editor modal, run history modal
  - `r12-regression.spec.ts` — /lab redirects, Thmanyah font loaded,
    notes-keep in QUICK_ACCESS across workspaces, empty participant
    lists allowed, no chainMentions errors on boot

**Docs.**
- `docs/SETUP-ABDULLAH.md` — tight first-run walkthrough for the
  three user actions (Provider key / Resend domain + API key /
  Google OAuth Test user). 15 min end-to-end.

**Skipped honestly:**
- **Agent cards HTTP endpoint** — deferred; the JSON stands ready
  but there's no `/.well-known/agent.json` or `/a2a/agents` route
  yet. Wiring that is part of future Phase 2 A2A adoption.
- **Dispatch → REPORT_ACTIONS proxy** — after code review, not
  applicable: `/api/dispatch/chat` uses hierarchical routing prompts
  (not persona prompts), and doesn't target architect.

### Added — Round 12b (Context enrichment + IA consolidation) — 2026-04-23

Follow-on pass after R12 — no stops.

**Report context enrichment.** The daily/weekly reports composer now
has four new optional context sources. Each is off by default and
opt-in via `report.includeContext`:
- `zotero` — new papers this week + last sync timestamp
- `vault` — Obsidian notes edited/created in the last 24h
- `meetings` — meetings today + phdSchedule upcoming items
- `budget` — 24h LLM spend + month-to-date vs monthly cap
Surfaced in the report editor modal as four new toggles beside the
existing tasks/dispatches/changelog/quotes ones. Route validator,
type, and compose all extended in sync.

**Knowledge graph checked** — stores agent IDs canonically, renders
labels live from paper titles + note contents, no stale old names.
No migration needed.

**Sidebar IA consolidation.**
- Merged `ops` + `intelligence` workspaces into a single **Agents &
  Ops** workspace (Arabic: "الوكلاء والتشغيل"). Four subsections
  inside: Team, Automation, Live, Analysis — covers the same items
  that previously required switching between two workspaces.
- Sidebar workspaces now: phd → agents → studio → system (from 5
  categories down to 4).

**Strict cast for `chainMentions`** in chat.ts — narrows `unknown[]`
to `string[]` via type predicate so TypeScript validates without a
double-cast trick.

**Tests: 185/185 passing. tsc clean on api/core/web.**

### Changed — Round 12 (Naming + IA + chat bug fixes) — 2026-04-23

Deep-clean pass across the platform to retire the old camel-herd agent
names and fix several chat/navigation bugs.

**Naming — single source of truth.**
- Canonical Arabic display names finalized and centralized in
  `apps/api/src/services/activity.ts::AGENT_DISPLAY_NAMES`:
  - research: عبدان → **الباحث**
  - reading-helper: شواشة → **المُلخِّص**
  - writing-critic: الصفرا → **الناقد**
  - comparator: رمّانة → **المُقارِن**
  - content-creator: الدبسا → **السارد**
  - creative: الكرييتف → **المبدع**
  - research-companion: رمّان → **الخوي**
  - sayyaq: السياق → **الكاتب**
  - (unchanged) manager: الراعي · doctor: الدكتور · architect: المصمم
  - (new in picker) fatin, playmaker, clippy, research-companion,
    mudawwin, sayyaq — previously missing from chat-view's
    ALL_BUILTIN_AGENTS (so they couldn't be added to a conversation).
- Mass rename applied across 58 runtime files (prompts, services,
  UI components, routes) + 18 test files. Old camel names retired.
- `specialists.ts::SPECIALIST_ALIAS_MAP` keeps old Arabic names as
  routing aliases so any lingering @mentions of old names still
  resolve correctly — UI shows new names, legacy inputs still work.

**Fixes.**
- **Sequential multi-mention chains broke past hop 1.** `chat.ts`
  only advanced the mention chain when `depth === 0`, so
  "@الراعي ثم @الباحث ثم @المُلخِّص" stopped at الباحث. Now the chain
  is re-established on every turn: server accepts a new
  `body.chainMentions` field, client captures it from
  `next_agent_queued` SSE (`chainMentions`) and replays on each
  follow-up. Sequences of N agents now run to completion.
- **New conversations auto-inserted الراعي.** `conversations.ts`
  participant endpoints defaulted an empty list to `['manager']`, so
  solo specialist chats couldn't be created. All three endpoints
  (GET, POST, DELETE) now preserve an empty participant list.
- **Workspace switcher didn't sync with sidebar.** Top toggle used
  `ruhool.active-workspace` localStorage key while sidebar used
  `ruhool-workspace`. Sidebar migrated to the canonical key + now
  listens for the `ruhool:workspace-change` CustomEvent, so PhD↔Life
  switching propagates live in both directions.

**IA cleanup.**
- **Lab merged into Studio.** `/lab` now redirects to `/studio`.
  `lab` workspace + NAV_ITEMS_MAP entry removed from the sidebar.
- **Quick Notes in sidebar QUICK_ACCESS.** `notes-keep` moved from
  the System workspace section up to the always-visible quick-access
  row, next to Tasks and Notifications.
- Thmanyah platform typeface installed (R11 bonus, self-hosted
  woff2) — Sans + Serif Text + Serif Display × 5 weights, wired
  through CSS custom properties across all three themes.

**Test suite: 185 → 185 passing.** Rename pass touched 18 test files;
all green after. Full tsc clean on api/core/web.

### Added — Round 11 (Reports polish: depth pass) — 2026-04-23

Follow-up to honest self-audit gaps after R9/R10. Four batches, all
shipped sequentially without pause.

**R11-1 — Deeper test coverage.**
- `charts.test.ts` — SVG structure, 30-cell grid, intensity mapping,
  habit exclusion for priority bars.
- `compose.test.ts` — single-agent flow, active-vs-inactive feedback
  injection, last-3-sent memory recall (with cross-report isolation),
  charts omitted when `tasks` context disabled, multi-agent sections
  flow (provider called once per section + once for editor; drafts
  land in editor prompt; costs aggregate).
- `reports.test.ts` (new) — auto-seed branch (seeds on triad, skips
  when reports already exist, skips on incremental saves);
  onFailure wiring (invoked on mailer throw, not invoked on success).
- **168 → 185 tests passing** (29 test files).

**R11-2 — Test-send + orphan signer.**
- `POST /api/reports/resend-config/test` — server-side sends a trivial
  Arabic-RTL HTML email via the current Resend config to the default
  recipient. Catches bad API key, unverified domain, or typo'd
  recipient BEFORE the first scheduled run. UI: "أرسل إيميل اختبار"
  button next to Save (visible when config is complete + not dirty).
  Inline banner shows ✅ messageId or ⚠️ error.
- `GET /api/reports/signer-health` — returns reports whose `signedBy`
  (or any section's `signedBy`) references an agent the platform no
  longer knows about. Loaded with the reports list; each affected row
  shows an amber warning "الوكيل الموقّع X غير موجود — غيّره من التحرير".
- POST/PUT validators reject unknown signer IDs with a 400.

**R11-3 — Conditional prompt injection + subject templates.**
- `REPORT_ACTIONS_PROMPT` is no longer baked into
  architect/manager/doctor system prompts. Injected dynamically by the
  Proxy ONLY when `shouldInjectReportActions(store)` returns true —
  i.e. at least one report exists, or a recent message (last 30)
  matches `/تقرير|report|إيميل|بريد|digest|.../i`. Saves ~800 tokens
  per turn on unrelated conversations.
- `resolveSubjectTemplate(template, store)` — substitutes
  `{{date}}` · `{{weekday}}` · `{{taskCount}}` · `{{completedToday}}` ·
  `{{week}}` (ISO week no.) inside the report name. Runs both on the
  configured name and on any `# Title` the agent produces. Unknown
  tokens left intact. Arabic weekday via Intl. UI hint shows available
  variables beneath the name field.

**R11-4 — Run-now + template library + HTML download.**
- Run history modal gains a "Send" icon per row (for reports that
  still exist) — re-runs `POST /api/reports/:id/send` and reloads.
  Inline banner at top of the modal shows success/error.
- **Template library** — four curated presets: daily executive
  (architect, 22:00), weekly PhD (manager, Sunday 9:00), weekly life
  (doctor, Thursday 21:00), weekly bundle (manager + doctor sections
  → architect editor, Friday 20:00). "From template" button opens a
  picker; chosen template seeds the editor (which the user can still
  customize before saving).
- **HTML download** — preview modal now has a "تنزيل" button that
  saves the rendered HTML as `<subject>-<date>.html`. For archiving
  without adding a PDF dependency.

### Added — Round 9 (Reports hardening) + Round 10 (Report memory) — 2026-04-23

**Round 9 — Polish + rigor pass over the reports system.**

*Important (R9a):*
- **Tests:** 41 new vitest cases for schedule math (daily/weekly/monthly
  with Asia/Kuwait timezone wrap-arounds), chat-action parser (nested
  JSON in schedule blobs, name-based ID fallback), and the send
  orchestrator (happy path, missing config, no recipients, mailer
  failure, compose failure). 168/168 pass.
- **Live context injection:** architect/manager/doctor system prompts
  now get a live snapshot of the current reports list (id · name ·
  schedule · enabled state · feedback) via a Proxy on
  BUILTIN_SYSTEM_PROMPTS. No more guessing by the LLM.
- **Failure notifications:** `onFailure` hook in the send pipeline
  calls createNotification when a scheduled (or chat/manual) send
  fails. User sees "📨 فشل إرسال <name>" in the notifications feed
  without opening settings.

*Medium (R9b):*
- **Run history UI:** "History" button opens a modal listing the last
  50 runs with status, cost, tokens, recipients, timestamps.
- **Chat toasts:** top-center toast confirms when an agent executes
  `[REPORT:CREATE/UPDATE/TOGGLE/SEND/DELETE/FEEDBACK]` — success (6s)
  or error (10s).
- **Multi-agent sections:** `ReportDefinition.sections[]` lets each
  section be composed by a different agent. The top-level `signedBy`
  then edits the drafts into one bundled email. Section editor in
  the settings modal. Empty `sections` = original single-agent flow.

*Cosmetic (R9c):*
- **Inline SVG charts:** two email-safe charts are rendered into
  report HTML — 30-day completion heatmap (5×6 grid, intensity-scaled
  green) + priority breakdown (stacked horizontal bars, open vs done).
  No external images, no CSS that email clients strip.
- **Auto-seed:** completing Resend config (key + from + default
  recipient) for the first time auto-creates a disabled
  "التقرير اليومي التنفيذي" so the user only needs to toggle it on.

**Round 10 — Report memory.** The composer was amnesiac: every send
looked identical and ignored your feedback. Fixed:

- `ReportDefinition.feedback[]` — an accumulating list of instructions
  ("اجعلها أقصر", "لا تذكر الميزانية", "أضف دائماً توصية لبكرة"). Each
  entry has `source` (chat/settings/auto), `addedBy`, `active`, and is
  injected verbatim into the composer system prompt under a
  "FEEDBACK / INSTRUCTIONS (HONOR THESE)" block. Active toggle per
  entry (soft-disable instead of delete).
- `ReportRunRecord.bodySnippet` — first ~800 chars of each sent
  markdown body is persisted. The composer sees the last 3 snippets
  and is told "avoid verbatim repetition; data-driven changes are
  fine".
- New chat marker: `[REPORT:FEEDBACK:<id-or-name>] <plain text>` OR
  `{"text":"...","addedBy":"..."}`. Agents use it whenever the user
  gives persistent feedback ("next time avoid…", "make it shorter",
  "always include…"). One-off asks don't get recorded.
- Settings UI: a feedback list per report (add, enable/disable, delete)
  below the context toggles in the editor modal.

### Added — Round 7c (Fast Google Tasks sync) + Round 8 (Reports) — 2026-04-23

**Round 7c — Fast sync.** Google Tasks has no webhook API, so we can't
get true real-time, but we got close:
- `services/google-tasks-trigger.ts` — debounced trigger that runs a
  full push+pull tick. Task CRUD routes (`POST`/`PUT`/`DELETE`
  `/api/tasks`, toggle, etc.) fire it after every save. Bursts
  collapse into a single sync ~2s after the last edit. In-flight
  syncs queue a rerun so edits made mid-tick land next pass.
- `POST /api/google-tasks/sync/tick` — lightweight endpoint the web
  UI calls every 30s while the tasks tab is open, and immediately on
  `visibilitychange` / window focus. No-op when disconnected.
- Background scheduler dropped from 15 min → 5 min as the "tab
  closed" backstop.
- Net effect: **local → Google ≈ 2s. Google → local ≈ ≤ 30s foreground,
  instant on tab return, ≤ 5min background.**

**Round 8 — Scheduled reports (full).**
- `store.reports[]` + `store.reportRuns[]` + `store.resend` config.
- `ReportDefinition` supports daily/weekly/monthly/manual schedules
  with per-report timezone, custom prompt, signing agent
  (architect / manager / doctor), recipient list, and context toggles
  (tasks / dispatches / changelog / agent quotes).
- Backend:
  - `services/reports/schedule.ts` — no-dep cron math (handles DST via
    Intl.DateTimeFormat). Computes `nextRunAt` in UTC from local
    wall-clock intent.
  - `services/reports/compose.ts` — builds 24h context snapshot, sends
    it to the signing agent with a base-instructions addendum (Arabic,
    tight, addresses عبدالله by first name), renders markdown → HTML
    shell with RTL-safe styling.
  - `services/reports/mailer.ts` — Resend REST client (no SDK).
  - `services/reports/send.ts` — pipeline orchestrator: compose → mail
    → record run → advance `nextRunAt` on success or failure (no retry
    storms).
  - `workers/reports-scheduler.ts` — 60s tick, scans enabled reports,
    fires any whose `nextRunAt` has passed.
- Routes:
  - `GET/PUT /api/reports/resend-config` — Resend API key + from +
    default recipient.
  - `GET/POST/PUT/DELETE /api/reports` — CRUD.
  - `POST /api/reports/:id/send` — immediate send.
  - `POST /api/reports/:id/preview` — compose without mailing.
  - `GET /api/reports/runs` — last 50 runs.
- UI: Settings → **التقارير** tab with list + inline editor modal
  (schedule picker, day-of-week/day-of-month controls, signer dropdown,
  recipients, prompt textarea, context toggles), Resend config section,
  preview modal rendering HTML in an iframe.
- **Chat intents:** architect / manager / doctor can emit
  `[REPORT:CREATE] {...}`, `[REPORT:UPDATE:<id-or-name>] {...}`,
  `[REPORT:TOGGLE:...]`, `[REPORT:SEND:...]`, `[REPORT:DELETE:...]`
  markers in their replies. `services/chat/report-actions.ts` parses
  and executes them (resolves ID-or-name refs), and the chat loop emits
  a `reports` SSE event with the result summary. Agents can now manage
  the user's recurring reports conversationally.

### Added — Round 6b/6c/7b (Habit editor + background workers) — 2026-04-22

**Round 6b — Full habit editor UI.**
- `HabitSection` appended to the task editor: toggle isHabit, frequency
  picker (daily / skip-weekends / weekly / custom), 7-circle day-of-week
  selector, duration slider (0–180 min), start/end date pickers,
  cross-workspace and today flags.
- `HabitStatsRing` embedded inline when editing an existing habit —
  animated SVG completion ring + current/longest streaks + 30-day
  history grid.
- Client `TaskItem` interface now carries `habitStartDate` /
  `habitEndDate`.

**Round 6c — Habit spawner daily cron.**
- `services/habit-spawner.ts` extracted from the route handler. Route
  (`POST /api/tasks/habits/spawn-due`) and the hourly worker now call
  the same `spawnHabitsForToday` function — a single source of truth
  for frequency rules, Kuwait-weekend detection, and start/end-date
  windows.
- `startHabitSpawnerChecker` wired in `boot.ts` — runs 45s after boot
  and every 60 min thereafter. Idempotent, so the margin on midnight
  roll-overs and timezone edges is free.

**Round 7b — Google Tasks periodic sync worker.**
- `workers/google-tasks-sync.ts` — every 15 min (90s boot delay):
  refreshes the access token if expired, pushes non-habit tasks, then
  pulls remote changes with last-write-wins merge. Cheap when disabled
  (zero work if `syncEnabled=false` or not connected). Errors recorded
  on `store.googleTasks.lastError` so the next tick retries and the UI
  can surface the failure.
- `startGoogleTasksSync` wired in `boot.ts`. Boot summary now lists
  `habit-spawner=...` and `google-tasks-sync=...`.

### Fixed

- Google Tasks OAuth callback redirected to the API origin
  (`http://127.0.0.1:3001/settings?gt=connected` → 404) instead of the
  web UI origin. Now redirects to `${WEB_ORIGIN}/settings?gt=connected`
  (defaults to `http://localhost:3000`). Existing connections made
  before this fix are safe — the tokens were saved before the redirect.

### Added — Round 6 (Tasks 2.0) + Round 7 (Google Tasks sync) — 2026-04-23

**Round 6 — Tasks 2.0.**
- `TaskItem` extended: `isHabit`, `habitFrequency` (daily / skip-weekends
  / weekly / custom), `habitDays`, `habitTemplateId`, `durationMinutes`,
  `habitStartDate`/`habitEndDate`, `scheduledFor`, `isToday`,
  `crossWorkspace`.
- Store migration 004 backfills defaults on existing rows.
- New endpoints:
  - `GET /api/tasks/today` — today-flagged + today-scheduled + due-today
    across all workspaces.
  - `POST /api/tasks/habits/spawn-due` — idempotent: creates today's
    instance of each habit that's due, skipping weekends when the habit
    is configured that way.
  - `GET /api/tasks/habits/:id/stats` — total instances, completed days,
    completion rate, current streak, longest streak, 30-day history
    grid.
- UI: top-level view tabs (All / Today / Habits). Cross-workspace tasks
  bypass the workspace filter.
- `HabitStatsRing` component — animated SVG ring with streak, 30-day
  completion rate, and history dots. Ready to drop into the task editor
  once you expose a habit-editor form.

**Round 7 — Google Tasks sync.**
- Full OAuth 2.0 flow: user creates a Google Cloud project → pastes
  Client ID + Secret + Redirect URI → clicks Connect → Google consent →
  refresh token stored.
- Settings panel at `/settings` → "Google Tasks" / "مزامنة Google Tasks".
- Endpoints:
  - `GET/PUT /api/google-tasks/config`
  - `POST /api/google-tasks/oauth/start`
  - `GET /api/google-tasks/oauth/callback`
  - `POST /api/google-tasks/disconnect`
  - `GET /api/google-tasks/lists`
  - `POST /api/google-tasks/sync/push` — Ruhool → Google
  - `POST /api/google-tasks/sync/pull` — Google → Ruhool
- Push: creates or PATCHes by `externalId`. Skips habits (templates
  are Ruhool-only). Pull: merges by `externalId`, flags conflicts via
  `metadata.googleTasksConflict` when both sides advanced past the
  last sync checkpoint (last-write-wins otherwise).
- Account email surfaced. List selector. Last-sync timestamp.
  Connect/disconnect is one click.

### Added — Round 4 (Workspaces) + Round 5 (Dispatch-in-Chat) — 2026-04-23

**Round 4 — Workspaces.**
- Agent org schema v2: top-level `workspaces[]` instead of single CEO.
  Two workspaces: **الدكتوراه** (PhD, CEO الراعي) and **الحياة** (Life,
  CEO الدكتور). `data/agent-org.json` migrated.
- New `doctor` builtin agent for the Life workspace CEO.
- Store migration 003: `workspaceId` backfilled to `'phd'` on every
  existing conversation, task, keep-note.
- `WorkspaceSwitcher` in top toolbar; active workspace in localStorage.
- Agents Org view: workspace tabs + per-workspace tree + Shared
  services + Platform admin sections.
- Shared services: الفطين، الكاتب، المُمرر، المشخّص، Clippy.
- `GET/PUT /api/agent-org` accepts v1 legacy + v2 workspaces shapes.

**Round 5 — Dispatch-in-conversation.**
- Dispatcher emits `onStep` events per hop. `/api/dispatch/chat`
  persists each step as a conversation message with `dispatchId`,
  `dispatchStep`, chain, cost, tokens.
- `MsgRecord` extended with dispatch fields + `workspaceId`.
- `ChatView.sendMessage`: CEO target (`manager` or `doctor`) + dispatch
  enabled → POSTs to `/api/dispatch/chat`, refetches messages. Legacy
  apiStream untouched.
- Bubble styling: dept-selected captions muted + indented, worker drafts
  indented, synthesis bubble shows `border-s-2` accent + CostPill +
  chain indicator.
- Synthesis prompt enforces markdown (subheadings, bullets, bold).

### Renames — trait-based Arabic

| Old | New |
|---|---|
| عبدان | الباحث |
| شواشة | المُلخِّص |
| رمّانة | المُقارِن |
| الصفرا | الناقد |
| رمّان | الخوي |
| الدبسا | السارد |
| الكرييتف | المبدع |
| السياق | الكاتب |

Clippy kept. IDs unchanged — data references intact.

### Fixed

- **Canvas resize** — every node now has a bottom-right grip. Drag to
  change width/height. Min 120×80.
- **Clippy overlap** — moved to `bottom: 72` so the split-screen button
  owns the bottom corner.
- **Dispatch conversation persistence** — `/api/dispatch/chat` now
  creates a conversation on the fly if none is passed + persists the
  user message before fan-out. Client picks up `conversationId` from
  the response so scrollback works on first turn.
- **الدكتور system prompt** — `apps/api/src/prompts/doctor.ts` + wired
  into `BUILTIN_SYSTEM_PROMPTS`. Direct chat with الدكتور works; he
  defers PhD topics to الراعي.
- **Tasks workspace filter** — chip row on `/tasks`: الكل / الدكتوراه /
  الحياة. Persists in localStorage. New tasks are stamped with the
  current workspace automatically.

### Added — Round 3 follow-up pass (2026-04-23)

Gap-closer on items flagged in the Round 3 sign-off report.

- **Canvas node resize handle** — bottom-right corner grip on every
  node. Drag to change width/height. Addresses user-reported bug.
- **/dispatch test page** (`apps/web/src/app/dispatch/page.tsx`) —
  lets the user exercise hierarchical dispatch end-to-end with a
  visible CostPill + RoutingChainIndicator + DispatchDetailDrawer.
  Cleaner than surgically editing the 2500-line chat-view.
- **Rate-limit on `/api/dispatch/chat`** — 6 burst, ~10/min refill
  (existing `apps/api/src/middleware/rate-limit.ts`).
- **Zotero delta sync with `since=<version>`** —
  `zoteroListItemsRichWithVersion()` added to `@ruhool/core`. Worker
  reads `store.zoteroVaultSync.lastZoteroVersion`, passes to Zotero,
  persists updated `Last-Modified-Version` header. Round 2 stub
  upgraded to real delta.
- **`@next/bundle-analyzer`** — `ANALYZE=true next build` generates
  a treemap. New `pnpm analyze` script in `apps/web`.
- **Playwright perf budget spec** (`apps/web/e2e/perf-budget.spec.ts`)
  — LCP / FCP / CLS budgets on 3 key pages. Fails CI on regression.
- **Prompt eval suite** (`apps/api/test/integration/dispatch-eval.test.ts`)
  — 8 mock-LLM scenarios covering routing decisions, fan-out,
  direct_answer, unknown workers, error paths. Complements the
  Round 2 dispatch integration tests.
- **a11y follow-ups** — `<main id="main-content">` landmark added to
  AppShell; aria-label on icon-only Menu/Close buttons; axe suite
  no longer needs `landmark-one-main` in its accepted list.
- **fuṣḥā sweep** across entire codebase —
  `docs/round-3/copy-audit.csv` + `copy-audit-methodology.md`. Zero
  dialect tokens in user-facing copy; the only hits are the explicit
  BLOCKLIST inside the agent anti-hallucination guard.

### Documentation

- `docs/deferred/prisma.md` — formal "deferred" record covering the
  two candidate PRISMA apps, why it's parked, and un-defer criteria.
- `docs/round-3/prompt-eval.md` — eval strategy + when to upgrade to
  real-LLM scoring.
- `docs/round-3/copy-audit-methodology.md` — sweep command + ongoing
  guard script.

## [0.3.0] — 2026-04-23

### Added — Round 3 (Polish & Evolve)

- **WAI-ARIA treeview** on the Agents Org view —
  `apps/web/src/components/agents/agents-list-page.tsx`. Roles: `tree`,
  `treeitem`, `group`. Attributes: `aria-expanded`, `aria-level`,
  `aria-setsize`, `aria-posinset`, `aria-selected`. Roving tabindex.
  Keyboard model: ArrowUp/Down (navigate), ArrowLeft/Right (collapse/
  expand, RTL-mirrored), Home/End (jump), Enter/Space (activate).
- **Canvas auto-zoom-to-fit** — fires after a template loads; also
  available as an explicit "Fit to content" toolbar button (
  `apps/web/src/components/canvas/CanvasPage.tsx` — `fitToContent()`).
- **React.lazy + Suspense skeletons** on the four heaviest settings
  tabs (`providers`, `external-apis`, `agent-names`, `shwasha`).
  Shared skeleton in `apps/web/src/components/settings/SettingsSkeleton.tsx`.
- **Bidi utilities** in `packages/core/src/util/bidi.ts` —
  `hasDirectionalMarks`, `stripBom`, `stripSurroundingDirectionalMarks`,
  `countDirectionalMarks`. Re-exported from `@ruhool/core`.
- **Server-side cache** on `/api/agent-org` — invalidated by the
  agent-org file watcher started in `apps/api/src/index.ts`.
- **`@axe-core/playwright`** integrated into the e2e harness;
  `apps/web/e2e/a11y-axe.spec.ts` runs WCAG2A+AA scan on every page
  Round 1-3 touched.
- **Round 3 specs** — `org-view-aria.spec.ts`, `canvas-auto-zoom.spec.ts`,
  `settings-suspense.spec.ts`, `bidi.spec.ts`, `a11y-axe.spec.ts`.

### Changed — Round 3

- **`ENABLE_HIERARCHICAL_DISPATCH` defaults ON.** Override with
  `ENABLE_HIERARCHICAL_DISPATCH=false` to fall back to the legacy
  direct-chat path.
- `ENABLE_ZOTERO_DELTA_SYNC` defaults ON (no change in code; documented
  in `.env.example`).
- API health endpoint now returns `dispatch.enabled` and
  `zotero.{writeEnabled, deltaEnabled}` so deploys can observe flag
  state.
- CSP / security headers reviewed in
  `docs/round-3/security-review.md`; no changes required.

### Documentation

- `docs/round-3/task-7-decision.md` — decision (skipped).
- `docs/round-3/rtl-pass.md` — RTL sweep findings.
- `docs/round-3/security-review.md` — secrets/path-traversal/CSP review.
- `docs/round-3/a11y-report.md` — axe results + accepted pre-existing
  violations.

### Added — Round 2 (Complete the Half-Built)

- **Hierarchical dispatcher** (`apps/api/src/services/dispatch/`) —
  state machine: routed → dept-selected → worker-selected →
  worker-responded → synthesized. Cost cap ($0.50 default, configurable),
  parallel worker fan-out via `Promise.all`, per-worker timeout, graceful
  fallback on single-worker failure, "لا أعرف" surface on total failure.
  Feature-flagged by `ENABLE_HIERARCHICAL_DISPATCH`.
- **Dispatch routes** — `POST /api/dispatch/chat` (one-shot),
  `GET /api/dispatch/stream` (SSE), `GET /api/dispatch/config`. Added as
  separate routes rather than editing the 1843-line `chat.ts`; legacy
  chat behavior fully preserved.
- **Hierarchy prompts** (`apps/api/src/prompts/hierarchy.ts`) —
  dynamic CEO + dept manager prompts built at request time with the
  agent-org roster injected. Prompt version tag `2026-04-22.r2`.
- **Zotero write API** (`packages/core/src/integrations/zotero/write-api.ts`)
  — `patchItemTags` with `If-Unmodified-Since-Version`. Typed
  `VersionConflictError` on 412.
- **Vault → Zotero push** in the sync worker — only when
  `writeEnabled === true` and a write key is set. Falls back to pull +
  conflict-flag on any 412 / missing config.
- **Dry-run mode** in the sync worker — plans the operations without
  writing anywhere. Plan persisted to
  `store.zoteroVaultSync.lastDryRunPlan` (capped at 200 items). Exposed
  at `GET /api/zotero/sync/dry-run-plan`.
- **Store migrations runner** (`apps/api/src/store/migrations/`) with
  two initial migrations: `001-zotero-delta-fields` (seeds
  `lastZoteroVersion` + `lastDryRunPlan`) and `002-dispatch-limits`
  (seeds `limits.hierarchicalDispatchUsd` + `dispatchMaxFanout`).
- **Agent-org file watcher** (`apps/api/src/state/agent-org-watcher.ts`)
  — debounced fs.watch that notifies subscribers when
  `data/agent-org.json` changes.
- **Write API key field** in the Connection settings modal with separate
  read/write split and a "show" toggle.
- **Sync bar v2** — dry-run checkbox, write-mode indicator pill, preview
  vs sync button label switch.
- **Routing chain indicator + dispatch drawer**
  (`apps/web/src/components/chat/RoutingChainIndicator.tsx`,
  `DispatchDetailDrawer.tsx`) — bilingual, RTL, focus trap on drawer,
  Escape closes, tokens + cost per step.
- **Health endpoint extended** — `/api/health` now returns `dispatch`,
  `zotero.writeEnabled`, `zotero.deltaEnabled`, plus the existing worker
  statuses.
- **Feature flags in `.env.example`** — documented
  `ENABLE_HIERARCHICAL_DISPATCH`, `ENABLE_ZOTERO_WRITE`,
  `ENABLE_ZOTERO_DELTA_SYNC`, `DISPATCH_WORKER_TIMEOUT_MS`,
  `NEXT_PUBLIC_GUARDED_NAV`.

### Testing

- **Vitest** — `apps/api/test/integration/dispatch.test.ts` (6 cases
  covering happy path, direct_answer, worker failure, total failure,
  missing org, budget cap) and `zotero-write.test.ts` (5 cases on the
  write path). `packages/core/test/frontmatter-bidi.test.ts` (3 cases
  on YAML round-trip with Arabic + LTR embedded content).
- **Playwright** — `dispatch-routing-chain.spec.ts` (smoke),
  `zotero-sync-dry-run.spec.ts` (toggle + POST body), `zotero-write-key-
  settings.spec.ts`.

### Docs

- `docs/architecture/dispatch-contract.md` — authoritative state-machine
  + shape + cost-cap contract.
- `docs/round-2/copy-review.md` — MSA verdict per string.
- `docs/round-2/perf-notes.md` — latency budget + delta-sync deferral
  note.
- `docs/round-2/manual-ui-checklist.md` — Round 2 human verification.

### Added — Round 1 (Stabilize & See)

- **Guarded navigation** (`apps/web/src/lib/navigation/guarded-router.ts`,
  `GuardedNavProvider.tsx`) — `useGuardedRouter()` consults a dirty registry
  and prompts the user before `router.push`/`replace`/`back` leaves a dirty
  form. Feature-flagged via `NEXT_PUBLIC_GUARDED_NAV` (default on in dev).
- **Audit log reader** — new page `/audit`
  (`apps/web/src/app/audit/page.tsx`,
  `apps/web/src/components/audit/AuditLogTable.tsx`) with prefix / source /
  date-range filters and cursor pagination. Bilingual ar/en, RTL correct.
- **Streaming audit-log API** (`apps/api/src/routes/audit-log.ts`) — line-by-
  line reads via `readline`; never loads the JSONL into memory. Cursor is the
  byte offset of the last emitted entry.
- **Audit-log rotation** — when `data/audit-log.jsonl` exceeds 50 MB, it is
  renamed to `data/audit-log.YYYY-MM-DD.jsonl` and a fresh file begins. Safe
  under a stat-then-rename race (try/catch keeps appending if rotation fails).
- **Rate-limit middleware** (`apps/api/src/middleware/rate-limit.ts`) —
  in-memory token-bucket applied to `POST /api/databases/saved-searches` and
  `POST /api/zotero/sync/run`.
- **Zod validation** on post-last-session routes: `POST /api/databases/saved-
  searches`, `DELETE /api/databases/saved-searches/:id`, `PUT /api/agent-org`.
- **Cost pill** (`apps/web/src/components/chat/CostPill.tsx`) — per-turn USD
  cents + token count chip attached to assistant messages.
- **Boot health check** — `apps/api/src/server/boot.ts` now emits a structured
  `[boot] workers:` summary line and skips the Zotero-Vault sync scheduler if
  `getVaultRoot()` returns nothing valid.
- **`/api/health` endpoint** — returns `{ ok, workers, vault, zotero }` for
  platform health probes.
- **SaveBar layout fix** — `useSaveBarHeight()` hook exported from
  `apps/web/src/components/settings/save-bar.tsx`. Settings pages use a
  spacer `<div>` with that height so the floating bar never covers the last
  field.
- **Playwright smoke tests** (7 new specs under `apps/web/e2e/`): audit-log,
  unsaved-changes-programmatic, settings-save-bar, agents-org-view,
  zotero-db-search-modal, zotero-sync-bar, canvas-templates.

### Changed

- `apps/web/src/hooks/use-unsaved-changes.ts` now registers with the guarded-
  router context in addition to its existing `<a>` + `beforeunload`
  interception. Programmatic `router.push` is finally guarded.
- Secret redaction sweep: anywhere a Zotero API key, provider key, or other
  secret could have landed in a `console.*` log in post-last-session code
  now emits `...${key.slice(-4)}` instead.

### Documentation

- `CHANGELOG.md` established (this file).
- `docs/architecture/invariants.md` — platform-wide invariants
  (single-writer store, audit append-only, vault EPERM retry, etc.).
- `docs/round-1/` — 8 specialist docs:
  - `router-push-audit.md` (every settings call site + swap decision)
  - `store-write-audit.md` (write funnel verification)
  - `save-bar-layout.md` (padding strategy rationale)
  - `perf-baselines.md` (LCP/INP/CLS for key pages)
  - `manual-ui-checklist.md` (post-CI human verification)
  - `dispatch-design.md` (Round 2's execution spec)
  - `copy-review.md` (every new bilingual string, MSA verdict)
