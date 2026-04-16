# apps/api refactor map (REL-01)

`src/index.ts` started at **10,299 lines**; target composition-root size is ≤300.

## Stage 1 — DONE (this pass)

Extracted the largest self-contained chunks without changing runtime behavior:

| What moved | Original lines | New module |
|---|---|---|
| `MANAGER_SYSTEM_PROMPT` (الراعي) | ~87 | `src/prompts/manager.ts` |
| `ARCHITECT_SYSTEM_PROMPT` (المصمم) | ~62 | `src/prompts/architect.ts` |
| `NOTIFY_PROMPT_ADDENDUM` | ~27 | `src/prompts/notify-addendum.ts` |
| `RESEARCH_SYSTEM_PROMPT` (عبدان) | ~30 | `src/prompts/specialists/abdan.ts` |
| `READING_HELPER_SYSTEM_PROMPT` (شواشة) | ~22 | `src/prompts/specialists/shwasha.ts` |
| `COMPARATOR_SYSTEM_PROMPT` (رمّانة) | ~20 | `src/prompts/specialists/rammana.ts` |
| `WRITING_CRITIC_SYSTEM_PROMPT` (الصفرا) | ~14 | `src/prompts/specialists/alsafra.ts` |
| `CREATIVE_SYSTEM_PROMPT` (الكرييتف) | ~305 | `src/prompts/specialists/creative.ts` |
| `CONTENT_CREATOR_SYSTEM_PROMPT` (الدبسا) | ~44 | `src/prompts/specialists/aldabsa.ts` |
| `TASKS_AGENT_SYSTEM_PROMPT` (مهام) | ~82 | `src/prompts/specialists/tasks-agent.ts` |
| `MUSHAKHKHIS_SYSTEM_PROMPT` (المشخّص) | ~29 | `src/prompts/specialists/mushakhkhis.ts` |
| `MUNAZZIM_SYSTEM_PROMPT` (المنظّم) | ~29 | `src/prompts/specialists/munazzim.ts` |
| `ANALYST_SYSTEM_PROMPT` (المحلل) | ~53 | `src/prompts/specialists/analyst.ts` |
| `DATA_DIR`, `STORE_FILE`, `PAPERS_DIR`, `NOTES_DIR`, `BACKUPS_DIR`, `ensure*Dir()` | ~14 | `src/config/paths.ts` |
| `ENCRYPTION_KEY_FILE`, `getOrCreateEncryptionKey()`, `ENC_KEY`, `ENC_PREFIX`, `encryptSecret()`, `decryptSecret()` | ~50 | `src/store/encryption.ts` |

Re-entry point is `src/prompts/index.ts` (single import in `index.ts`).

**Result after stage 1:** `src/index.ts` = **9,461 lines**. `pnpm exec tsc --noEmit` error count is identical to baseline (159, all pre-existing).

## Stage 2 — PARTIAL (this pass)

### Extracted in stage 2a

| What moved | Original location | New module |
|---|---|---|
| App factory (Hono + CORS + logger + auth chain) | `index.ts:1912–1932` | `src/server/app.ts`, `src/server/cors.ts`, `src/server/auth.ts` |
| Structured logging (pino) + `x-request-id` middleware | — (new) | `src/server/logging.ts` |
| `GET /api/health` | `index.ts:1995` | `src/routes/health.ts` (`registerHealthRoutes`) |
| `GET /api/modules` | — (new) | `src/routes/modules.ts` (`registerModulesRoutes`) |
| `POST /api/workflows/research/start` | — (new) | `src/routes/workflows.ts` (`registerWorkflowsRoutes`) |
| ARC-04 module loader | — (new) | `src/modules/loader.ts` |
| ARC-02 Temporal worker + workflow | — (new) | `src/workflows/research-workflow.ts`, `src/workers/temporal.ts`, `src/workers/temporal-activities.ts` |
| AGT-05 structured delegation | `index.ts` text-marker pattern | `src/services/agents/manager.ts` |

### Remaining (deferred to stage 2b)

Remaining large sections of `src/index.ts` to extract in future passes. Each is listed with its approximate LOC range in the **current** (post-stage-1) file and target module.

- [ ] `BUILTIN_SYSTEM_PROMPTS`, `BUILTIN_AGENTS`, `BUILTIN_AGENT_PERMISSIONS` → `services/agents/registry.ts`
- [ ] `clippy`, `fatin`, `playmaker` inline prompts in `BUILTIN_SYSTEM_PROMPTS` → `prompts/specialists/clippy.ts`, `fatin.ts`, `playmaker.ts`
- [ ] `class AnthropicProvider`, `class OpenAIProvider`, `class GeminiProvider`, `pickProviderForModel()` → `services/llm/{anthropic,openai,gemini,router}.ts`
- [ ] `loadStore()`, `saveStore()`, `store` singleton, all `StoreData`/record interfaces (lines 63–430) → `store/index.ts` + `store/schema.ts`
- [ ] Notification engine (`notificationSSEListeners`, `getAgentNotificationSettings`, `isInQuietHours`, `createNotification`, `parseNotifyActions`, `DEFAULT_NOTIFICATION_SETTINGS`) → `services/notifications.ts`
- [ ] Activity log (`logActivity`, `MAX_ACTIVITY_RECORDS`, `activitySSEListeners`, `AGENT_DISPLAY_NAMES`) → `services/activity.ts` (+ `sse/broadcast.ts`)
- [ ] Task engine (`taskStore`, `updateTask`, `parseTaskActions`, `executeTaskActions`, `getTaskCategories`) → `services/tasks.ts`
- [ ] Approval engine (`parseArchitectActions`, `executeApproval`) → `services/approvals.ts`
- [ ] File handlers (`saveNoteFile`, `deleteNoteFile`, `splitIntoSections`) → `files/notes.ts`
- [ ] Intent/mention detection (`detectIntent`, `detectMention`, `detectAllMentions`, `detectDirectiveMentions`, `MENTION_MAP`, `SUMMON_PATTERNS`, `AGENT_HEADERS`) → `services/routing.ts`
- [ ] Response cache (`responseCache`, `CACHE_TTL_MS`, `getCacheKey`, etc.) → `services/cache.ts`
- [ ] Model selection (`selectModel`) → `services/llm/router.ts`
- [ ] Summary helper (`generateSummary`) → `services/conversations.ts`
- [ ] BullMQ init (`initResearchQueue`, `researchWorker`, `serviceHealth`) → `workers/bullmq.ts`
- [ ] Scheduler (`startScheduleChecker`, `runSchedule`, `sendAutomatedNotifications`) → `workers/scheduler.ts`
- [ ] Watcher `setInterval(... scanForAlerts)` → `workers/watcher.ts`
- [ ] CORS + bearer auth + logger middleware chain (already inline at the top of the app block) → `server/app.ts`, `server/auth.ts`, `server/cors.ts`
- [ ] Every `app.get(...)` / `app.post(...)` / `app.put(...)` route — ~200+ handlers — group by domain into `routes/*.ts`:
  - `routes/health.ts`, `routes/providers.ts`, `routes/agents.ts`, `routes/chat.ts`, `routes/conversations.ts`, `routes/papers.ts`, `routes/notes.ts`, `routes/keep-notes.ts`, `routes/tasks.ts`, `routes/graph.ts`, `routes/runs.ts`, `routes/artifacts.ts`, `routes/ratings.ts`, `routes/prompts.ts`, `routes/triggers.ts`, `routes/hierarchy.ts`, `routes/git.ts`, `routes/clippy.ts`, `routes/awards.ts`, `routes/watcher.ts`, `routes/time.ts`, `routes/settings.ts`, `routes/usage.ts`, `routes/backups.ts`, `routes/memory.ts`, `routes/custom-agents.ts`, `routes/tools.ts`, `routes/workflows.ts`, `routes/matrix.ts`, `routes/notify.ts`, `routes/subscriptions.ts`, `routes/analyst.ts`, `routes/voice.ts`, `routes/audio.ts`, `routes/maps.ts`, ...
- [ ] Audio/caption/video subsystem (`AudioPlan`, `elevenlabsTTS`, `stableAudioMusic`, caption styling, uploads) → `services/audio/*.ts`, `files/upload.ts`
- [ ] Capability checks (`checkMapbox`, `checkMapTiler`, `checkGeoapify`, `checkThunderforest`, `checkElevenLabs`, `checkStabilityAI`, `checkGroq`, `checkAudiocraft`, `CAPABILITY_CHECKERS`) → `services/capabilities.ts`
- [ ] Matrix (XLSX) module (`readMatrix`, `writeMatrix`, `MATRIX_*`) → `services/matrix.ts`
- [ ] Subscription engine (`ensureSubscriptionDefaults`, `checkSubscriptionRules`, `buildSubscriptionSnapshot`, `estimateAudioPlanCost`, `PRICING`) → `services/subscriptions.ts`
- [ ] Final bootstrap (Postgres init, BullMQ worker, schedulers, `serve(...)`) stays in `src/index.ts` — this is the only code that should remain there. Target final size ≤300 lines.

## Stage 2b — status note (2026-04-15)

This pass did **not** complete the full stage-2b extraction. `src/index.ts`
remains at **9,470 lines** — the decomposition into `store/`, `services/llm/*`,
`services/agents/specialists.ts`, `services/activity.ts`, `workers/*`,
`sse/broadcast.ts`, `files/*`, `mail/*`, and per-domain `routes/*.ts` is still
outstanding. Attempting the full extraction without incremental verification
would risk regressing the preserved fixes (bearer auth, encryption, CSP,
module loader). The work is still tracked above and should resume as its own
focused effort.

Progress this pass:
- `packages/shared` tsc: 2 → 0 (added `@types/node`).
- `apps/api` tsc: 159 → 148 (`@types/nodemailer`, unused locals, Hono-context
  typing in `server/logging.ts`).
- Added AGT-05 integration tests (`services/agents/manager.integration.test.ts`).
- Tests: 31 → 35 passing; 0 failing.

## Stage 2c — status note (2026-04-15, second attempt)

This pass made **partial** progress against the stage-2c plan. The full
extraction of 275 route handlers, the 986-line chat SSE loop (`index.ts`
2148–3134), the notification/approval/task engines, the audio/caption/video
subsystem, the subscription engine and the multi-service capability checker —
all still share the in-memory `store` singleton, `logActivity`, and the
encryption-backed provider list in a dense, cross-referencing way that
cannot be safely untangled in a single extraction pass without a much
longer verification cycle.

### Completed in this pass

| What | Result |
|---|---|
| `src/sse/broadcast.ts` | New leaf module — typed `Channel<T>` registry with `subscribe / publish / size`, centralised error handling. Ready for consumer routes (`activity`, `notifications`, chat) to switch over when they're extracted. |
| OBS-01 console sweep | `apps/api/src/**` outside `scripts/` and `index.ts` dropped from 37 → 0 `console.*` calls. Replaced with `logger.{info,warn,error}` from `server/logging.ts` in: `server/auth.ts`, `store/encryption.ts`, `store/repositories/{db,providers,usage,conversations}.repo.ts`, `agent-os.ts`, `agent-runner.ts`, `daily-backup.ts`, `db-setup.ts`. |
| Baselines preserved | tsc `apps/api` unchanged at **148** errors. Tests **22 passing / 0 failing** (matches pre-pass baseline; the 38-passing figure in the prompt did not match the actual repo state — `pnpm exec vitest run` reports 22). |

### Not completed — deferred

1. **Route extraction** — `index.ts` still holds 275 `app.{get,post,put,delete,patch}` handlers grouped approximately as listed in stage-1 plan (providers, agents, chat, notes, tasks, activity, settings, usage, conversations, messages, papers, prompts, runs, graph, memory, artifacts, ratings, triggers, hierarchy, git, clippy, awards, watcher, time, backups, custom-agents, tools, workflows, matrix, notify, subscriptions, analyst, voice, audio, images, library, creative, captions, approvals, api-keys, cost, maps, keep-notes, task-prefs). Approximate LOC ranges in the current 8,854-line file:
   - `app.get/post/put/delete/patch` handlers: **lines 1368 → 8700** (inclusive of task/approval/schedule helpers they close over).
   - Chat SSE loop + `askPlayMaker` + `detect-agent-names` + helpers: **lines 1988 → 3133** (~1146 LOC).
2. **Workers (bullmq / scheduler / watcher)** — still inline in `index.ts`:
   - `initResearchQueue()` + BullMQ worker init: lines 141–153, 8775–8793.
   - `startScheduleChecker()` + `sendAutomatedNotifications()` + `runSchedule()`: lines 8762–8800, 8708–8760, 7117–~7800.
   - File-system watcher: lines 8800–8812.
3. **Files / mail leaves** — `pdf-parse` wrapper, upload handlers, nodemailer SMTP still inline.
4. **AGT-05 live wiring** — `services/agents/manager.ts` exposes the structured `delegateToSpecialistTool`, but `index.ts` chat loop still uses text-marker parsing. Wiring lives behind chat extraction (#1).
5. **`index.ts` composition root** — still **8,854 LOC**, not the ≤300-LOC target.

### Rationale for stopping here rather than forcing partial route extraction

The routes close over ~40 module-scope symbols (`store`, `saveStore`, `logActivity`, `notificationSSEListeners`, `activitySSEListeners`, `taskStore`, `updateTask`, `detectIntent`, `detectMention`, `MENTION_MAP`, `AGENT_HEADERS`, `selectModel`, `parseArchitectActions`, `parseTaskActions`, `executeTaskActions`, `parseNotifyActions`, `createNotification`, `executeApproval`, `responseCache`, `getCacheKey`, `generateSummary`, `pickProviderForModel`, `BUILTIN_AGENTS`, `BUILTIN_SYSTEM_PROMPTS`, `BUILTIN_AGENT_PERMISSIONS`, `AGENT_DISPLAY_NAMES`, `AGENT_TOPICS`, `CAPABILITY_CHECKERS`, `PRICING`, `MATRIX_*`, audio helpers, subscription helpers, `runResearch`, `serviceHealth`, `researchQueue`, ffmpeg mux helpers, `API_KEY_FIELDS`, `API_KEY_FLAG_MAP`, ...). Moving a route without first migrating its dependencies either (a) creates a circular import back to `index.ts` or (b) forces an ever-growing shared-state module whose contents re-create the monolith under a new name.

A safer sequencing is:
1. Extract the **state + helpers** modules first (`store/index.ts` singleton expansion, `services/activity.ts`, `services/notifications.ts`, `services/tasks.ts`, `services/routing.ts`, `services/cache.ts`, `services/agents/registry.ts`, `services/capabilities.ts`, `services/subscriptions.ts`, `files/notes.ts`, `mail/nodemailer.ts`, `workers/{bullmq,scheduler,watcher}.ts`).
2. Then extract routes in groups of 10–20, each run against `tsc --noEmit` and vitest.
3. Finally wire AGT-05 tool-use inside the extracted `routes/chat.ts`.

That remains the plan; it is larger than one extraction pass can safely deliver.

## Guardrails for stage 2

1. Keep the singleton `store: StoreData` and `saveStore()` in `store/index.ts`; all extracted modules import from there, not each other, to avoid cycles.
2. Preserve the bearer-auth middleware (`RUHOOL_API_TOKEN`) exempting `/api/health`.
3. Preserve `hostname: '127.0.0.1'` binding.
4. Preserve AES-256-GCM encryption around `ProviderRecord.apiKey`.
5. Each move must leave `pnpm exec tsc --noEmit` error count ≤ 159 (the current baseline).
6. Prefer `registerFooRoutes(app)` pattern: extract routes as `export function registerFooRoutes(app: Hono): void { app.get(...); ... }` and call each from `src/index.ts`.
7. Move code verbatim first; polish only after tsc passes.

---

## Stage 2d cleanup pass (final)

After all stage-2d work, `src/index.ts` is **1,440 LOC**. Target was ≤300; what
remains is composition root (no inline routes left — verified by
`grep -nE "^app\\.(get|post|put|delete|patch)" index.ts` returning zero matches).

### Why the file is still > 300 LOC

The remaining surface is helper closures and boot sequencing that legitimately
belong at the composition root because they wire deps shared by multiple
register calls:

1. **Imports (~80 LOC)** — every `register*Routes` and shared service factory.
2. **Store bootstrap + defaults (~50 LOC)** — `getStore()`, default-array
   seeding (customAgents, memories, papers, notes, library*), built-in
   "Experiments" category + seed tags, prompt-override restoration, provider
   restoration. Every register call closes over `() => store`.
3. **Notification primitives (~120 LOC)** —
   `getAgentNotificationSettings`, `isInQuietHours`, `createNotification`,
   `DEFAULT_NOTIFICATION_SETTINGS`. Consumed by `parseNotifyActions`,
   `registerNotificationRoutes`, `registerSubscriptionsRoutes`,
   `checkSubscriptionRules`, `sendAutomatedNotifications`.
4. **Chat-runtime helpers (~250 LOC)** — `parseArchitectActions`,
   `parseTaskActions`, `executeTaskActions`, `parseNotifyActions`,
   `executeApproval`, `extractGraphFromMessage`, `autoTitleIfNeeded`,
   `autoSummarizeIfNeeded`, `_getChatProviderForHelpers`, `generateSummary`,
   `splitIntoSections`. Each is an arrow over the shared closure used by
   `registerChatRoutes` and worker paths.
5. **Subscription engine (~80 LOC)** — `checkSubscriptionRules` + scheduler
   boot. Routes are already in `routes/subscriptions.ts`; only the
   rule-firing scheduler stays inline because it depends on inline
   `createNotification`.
6. **Notification automation (~60 LOC)** — `sendAutomatedNotifications` +
   `startScheduleChecker`.
7. **Audio + render-audio + captions wiring (~80 LOC)** — pure factory wiring.
8. **Studio demo + library deps (~120 LOC)** — `STUDIO_DEMOS`,
   `DEMO_REQUIREMENTS`, `DEMO_MAP_COST` literal data passed to
   `registerStudioDemosRoutes`.
9. **`estimateAudioPlanCost` helper (~20 LOC)** — used by `routes/cost.ts`
   (via dep) and by `renderAudioService` factory; single source of truth.
10. **Async boot IIFE (~60 LOC)** — sequencing-sensitive Postgres + module
    loader + Temporal + BullMQ + watcher + `serve()`.

### Routes extracted in this cleanup pass

| Route group | Module |
| --- | --- |
| `/api/maps/proxy` | `routes/maps.ts` (NEW) |
| `/api/task-graph` + `/api/runs/*` + `/api/control/snapshot` | `routes/runs.ts` (NEW) |
| `/api/prompts` (built-in + custom) | merged into `routes/prompts.ts` |
| `/api/workflows` CRUD + run + runs | merged into `routes/workflows.ts` |
| `/api/notify` | `routes/notify.ts` (NEW) |
| `/api/cost/estimate` | `routes/cost.ts` (NEW) |
| `/api/render/queue/status` | merged into `routes/render.ts` |
| `/api/library` list + archive + delete | merged into `routes/library.ts` (`registerLibraryListRoutes`) |

### Pushing further

Reaching ≤ 300 requires extracting the non-route closures into factory
modules (notification service, chat-runtime helpers, subscription scheduler).
Each is a multi-step deps-threading change touching multiple consumers
that risks the 55 tsc / 24 tests invariant. The directive prioritises
preserving baselines, so those extractions are deferred.

### Invariants verified at end of pass

- `pnpm --filter @ruhool/api exec tsc --noEmit` → **55** errors (baseline preserved).
- `pnpm --filter @ruhool/api exec vitest run` → **24** passed (baseline preserved).
- `grep -nE "^app\\.(get|post|put|delete|patch)" apps/api/src/index.ts` → **zero** inline routes.
