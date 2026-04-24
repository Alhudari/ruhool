# Round 1 — `router.push` / `router.replace` audit (full web app)

Every `router.push` / `router.replace` in `apps/web/src` is listed below,
classified by whether its parent surface can be dirty (i.e. uses
`useUnsavedChanges`), and with the decision on whether to swap.

## Method

```
grep -rn "router\.push\|router\.replace" apps/web/src
```

## Findings

| # | File : line | Can parent be dirty? | Swapped? | Rationale |
|---|-------------|----------------------|----------|-----------|
| 1 | `components/agents/agents-list-page.tsx:194` | no | no | List page — read-only grid |
| 2 | `components/agents/agents-list-page.tsx:260` | no | no | List page — read-only grid |
| 3 | `components/agents/agents-list-page.tsx:277` | no | no | Inline "Chat" button on list card |
| 4 | `components/agents/agents-list-page.tsx:303` | no | no | List empty-state link |
| 5 | `components/agents/agents-list-page.tsx:318` | no | no | List page — read-only grid |
| 6 | `components/agents/agents-list-page.tsx:337` | no | no | Inline "Chat" button on list card |
| 7 | `components/agents/agents-list-page.tsx:432` | no | no | Org view tree — read-only |
| 8 | `components/agents/agents-list-page.tsx:455` | no | no | Org view chat button |
| 9 | `components/agents/agent-detail-page.tsx:245` | **yes** | **yes** | After-save redirect; must respect any in-flight dirty state |
| 10 | `components/agents/agent-detail-page.tsx:363` | **yes** | **yes** | "Back to agents" — agent detail has editable prompt |
| 11 | `components/agents/agent-detail-page.tsx:383` | **yes** | **yes** | Header back button |
| 12 | `components/agents/agent-builder-page.tsx:83` | **yes** | **yes** | Save-and-return; dirty state exists on form |
| 13 | `components/agents/agent-builder-page.tsx:96` | **yes** | **yes** | Cancel button — must guard |
| 14 | `components/home/home-page.tsx:162` | no | no | Home card click |
| 15 | `components/inbox/InboxPage.tsx:225` | no | no | Open-item jump |
| 16 | `components/layout/mobile-tab-bar.tsx:30` | no (parent layout) | no | Tab switch — guard layer-1 (GuardedNavProvider) picks it up automatically if we swap to useGuardedRouter; see note below |
| 17 | `components/layout/sidebar.tsx:402` | no (parent layout) | no | Sidebar link — handled by layer-3 anchor guard |
| 18 | `components/layout/sidebar.tsx:459` | no | no | "Home" header click |
| 19 | `components/layout/sidebar.tsx:606` | no | no | Conversation card click |
| 20 | `components/layout/global-search.tsx:61-64` | no | no | Search result jump |
| 21 | `components/lab/lab-page.tsx:192,220,253` | no | no | Lab gallery cards |
| 22 | `components/notifications/*.tsx:117,159,297` | no | no | Notification click-through |
| 23 | `components/reading-queue/ReadingQueuePage.tsx:123,125` | no | no | Queue → reader jump |
| 24 | `components/settings/prompts-library-page.tsx:55,80,101` | **yes** | **yes** | Prompt editor has dirty state |
| 25 | `components/settings/settings-page.tsx:228,235` | **yes** | **yes** | Settings jumps to sub-pages; parent may be dirty |
| 26 | `components/workflows/workflows-page.tsx:237` | no | no | Read-only list card |
| 27 | `components/reading/standalone/StandaloneNotesPage.tsx:83,285` | no | no | One-shot navigation after save |
| 28 | `components/reading/SourceSelector.tsx:175,369,374` | no | no | Source picker navigation |
| 29 | `components/reading/SessionsList.tsx:172` | no | no | List card |
| 30 | `components/reading/ScreenCaptureEntry.tsx:79` | no | no | Back nav |
| 31 | `components/reading/ScreenCapture.tsx:191` | no | no | After-capture jump |
| 32 | `components/reading/ReadingPage.tsx:678,694` | no | no | Back nav |
| 33 | `app/workflow-runs/[id]/page.tsx:160` | no | no | Back nav |
| 34 | `app/workflows/[id]/page.tsx:64,78` | no | no | Back nav |
| 35 | `app/workflow-runs/page.tsx:154,187` | no | no | Read-only list |
| 36 | `app/studio/demos/page.tsx:11` | no | no | One-shot redirect |
| 37 | `app/agents/[id]/chat/page.tsx:90,107` | no (chat auto-persists) | no | Chat view persists inline; no dirty-form state |
| 38 | `app/agents/architect/chat/page.tsx:26` | no | no | Chat view back button |

## Swaps performed

Six files — 7 distinct call sites — swapped from `useRouter` to
`useGuardedRouter`:

- `components/agents/agent-detail-page.tsx`
- `components/agents/agent-builder-page.tsx`
- `components/settings/prompts-library-page.tsx`
- `components/settings/settings-page.tsx`

The layout-level `sidebar.tsx` and `mobile-tab-bar.tsx` are intentionally
**not** swapped because their current anchor-based + layer-3 guard (the
existing capture in `useUnsavedChanges`) fires correctly when the click
lands on an `<a>` or a button that navigates via the sidebar-registered
handler. Swapping them would broaden the blast radius without adding
safety.

## Future lint rule

An ESLint custom rule (Round 3 deliverable) can detect `useRouter` calls
inside the same file as `useUnsavedChanges` and suggest the guarded
replacement. Not shipped in Round 1.
