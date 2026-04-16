# Workflow Dashboard (Phase 4)

The Ruhool Workflow Dashboard is the live UI for the multi-agent workflow
orchestrator built in Phases 1–3. It surfaces per-run state, per-step progress,
streaming output, usage/cost, and any artifacts (images, video, audio, files)
produced by specialists.

## Navigation

- Sidebar → **Work** group → **Workflow Runs** (AR: *مسارات العمل*).
- List page: `/workflow-runs`
- Detail page: `/workflow-runs/[id]`

## Pages

### `/workflow-runs` — list

- Header: title + "New run" button (opens the plan dialog).
- Filter chips: All / Running / Completed / Failed / Canceled / Paused.
- Table: Title · Status · Steps (done/total) · Cost · Started · Duration.
- Auto-refreshes every 5 s via `GET /api/workflow-runs`.
- Click a row → detail page.

_Screenshot placeholder: `docs/agents/screenshots/workflow-runs-list.png`_

### `/workflow-runs/[id]` — detail

- Header with title, live status badge, durability mode
  (Durable: Temporal / Fallback: BullMQ / Fallback: inproc), and action buttons
  (Start / Pause / Resume / Cancel) based on the current status.
- Summary bar: Total steps · Current step · Elapsed · Total cost.
- Step timeline: one card per step with status indicator, specialist avatar
  (Arabic initial + color), task description, expected output, live spinner,
  output text (truncated at 500 chars, expandable), usage / cost / duration,
  inline artifacts (`<img>`, `<video controls>`, `<audio controls>`, download
  chips), and error box on failure.
- Live SSE feed from `GET /api/workflow-runs/:id/events` (channel
  `workflow-runs:<id>`) keeps state current without reloads.
- Collapsible "Raw JSON" at the bottom for debugging.

_Screenshot placeholder: `docs/agents/screenshots/workflow-runs-detail.png`_

### Plan dialog

- Modal overlay triggered by "New run".
- Inputs: optional title, task description (textarea).
- Checkbox: "Start immediately after planning" (default on).
- Flow: `POST /api/workflow-runs/plan` → on success, if checkbox set
  `POST /api/workflow-runs/:id/start?durable=true` → navigate to detail.
- Closes on Escape or backdrop click.

_Screenshot placeholder: `docs/agents/screenshots/workflow-runs-plan-dialog.png`_

## Components

| Path | Purpose |
| --- | --- |
| `src/hooks/use-workflow-sse.ts` | Opens fetch-based SSE stream, merges events into `{ status, steps, lastEvent }`. |
| `src/components/workflow-runs/status-badge.tsx` | Bilingual status pill. |
| `src/components/workflow-runs/specialist-avatar.tsx` | Arabic-initial avatar, per-specialist colors, bilingual labels. |
| `src/components/workflow-runs/artifact-preview.tsx` | Switches on `type` / `mimeType` to render image/video/audio/file. |
| `src/components/workflow-runs/step-card.tsx` | Per-step card with status, output, usage, artifacts, error. |
| `src/components/workflow-runs/plan-dialog.tsx` | Plan-and-start modal. |

## i18n

Keys live under `workflowRuns.*` in `src/i18n/{en,ar}.json` (title, filters,
steps progress, cost, elapsed, actions, plan dialog, durability).

## Rules observed

- No API changes, no root `package.json` changes, no edits under `apps/api/**`.
- Design tokens only (`bg-surface`, `text-on-surface`, `border-border`, …).
- RTL aware via `useAppStore().language`; back-arrow icon flips.
- Arabic specialist identifiers are preserved (الراعي, المصمم, عبدان, شواشة,
  الصفرا, رمّانة, الدبسا, الكرييتف, مهام, المحلل, المنظّم, المشخّص).
