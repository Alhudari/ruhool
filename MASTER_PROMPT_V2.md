# RUHOOL PLATFORM — MASTER BUILD PROMPT V2
# Abdullah Al-Mutairi | PhD Research Platform | University of Birmingham
# Generated: 2026-04-24 | Based on full manual review session
═══════════════════════════════════════════════════════════════════════

## HOW TO USE THIS PROMPT
- Paste this entire file at the start of a new session
- Work PHASE by PHASE — never skip ahead
- After each phase: spawn a verification agent (template at bottom)
- Say "اكمل N" to execute phase N only
- Tests must stay 206/206 green at ALL times
- TypeScript must stay clean after every file change

---

## PART 0 — START EVERY SESSION WITH THIS

```bash
cd C:\Users\alhud\platform
git log --oneline -5
git status --short
curl -s http://localhost:3000/api/health | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('Build:',d.get('buildRound'),'| Agents:',d.get('agents'),'| Status:',d.get('status'))"
cd apps/api && pnpm vitest run 2>&1 | tail -3
```

Expected: 206/206 tests green. If not, stop and fix before proceeding.

---

## PART 1 — ABSOLUTE LAWS (never break these)

### Law 1: Obsidian is READ-ONLY
> Obsidian = a database you read from during initial sync only.
> ALL editing, creating, deleting happens inside the platform.
- REMOVE every "Open in Obsidian" edit button — replace with in-platform editor
- REMOVE every page that depends on Obsidian files as its primary data source
- Obsidian vault paths are only used for the initial data import pipeline

### Law 2: Soft + Hard Delete everywhere
Every entity in the platform follows this pattern:
- **Soft delete** → moves to Archive/Trash (still recoverable)
- **Hard delete** → from inside Trash only, with confirmation dialog
- NO direct permanent delete from any list or detail view
- Every delete action shows a toast + Undo button (5 seconds)

### Law 3: Bilingual everywhere
- Every category, list, label, status = Arabic AND English
- Format: `{ en: "Meeting", ar: "اجتماع" }` — both always present
- UI shows the correct language based on `language` store state
- Never store only one language

### Law 4: Performance first
- No blocking data fetches — all parallel with `Promise.all`
- Skeleton loaders, not spinners, for content areas
- Cache API responses in React state — don't re-fetch on every render
- Lazy-load heavy components (graph, PDF viewer, calendar)
- Every list: virtualize if > 50 items
- API routes: add `Cache-Control` headers for static/slow-changing data

### Law 5: No page duplication
- Every feature lives in exactly ONE place
- Cross-links are allowed; duplicate full pages are not
- Merges listed in Part 2 are mandatory

### Law 6: Undo on every destructive action
- Complete task → toast "Completed" + Undo (5s)
- Delete → toast "Deleted" + Undo (5s)
- Archive → toast "Archived" + Undo (5s)
- Undo calls the reverse API endpoint

---

## PART 2 — ARCHITECTURE DECISIONS (merges & structure)

### Page Merge Map
| From (remove) | Into | How |
|---------------|------|-----|
| /home | /phd | /home redirects to /phd |
| /supervision | /phd | becomes a tab/section inside PhD dashboard |
| /grs2 | /phd | becomes a widget/section inside PhD dashboard |
| /mudawwin | /meetings | becomes the draft editor tab inside meeting session |
| Quick Notes | /tasks | merged as a note-type task (yellow, no due time by default) |
| /inbox | sidebar + /phd shortcut | no standalone page; sidebar item + PhD shortcut |
| /papers | /library | papers = entity type inside Unified Library |
| /sources | /library | sources = entity type inside Unified Library |
| /research | /library (sub-view) | research clusters = collections inside Library |
| /notes (atomic) | /library | atomic notes = entity type inside Unified Library |
| /reading (shwasha) | /library (reading sessions sub-view) | reading sessions linked to Library entities |

### New Navigation Structure (sidebar)
```
PhD Section:
  📊 /phd          — PhD Command Center (merged: home + supervision + GRS2)
  📅 /meetings     — Meetings + Mudawwin (merged)
  📚 /library      — Unified Library (papers + sources + research + notes + reading)
  🔬 /zotero       — Zotero Browser (import gateway to Library)
  🗓 /tasks        — Tasks + Quick Notes + Habits (merged)
  🔔 sidebar inbox shortcut

Platform Section:
  🌐 /graph        — Knowledge Graph (evolves with Library)
  🔍 /search       — Smart Search (platform-wide)
  📬 sidebar inbox shortcut
  🔔 /notifications
  📊 /reports-inbox
```

### Unified Library — Entity Model
Every entity has:
- `id`, `type`, `title`, `coverImage?`
- `notes: string` (main note, markdown)
- `subNotes: SubNote[]` (child notes)
- `links: EntityLink[]` (connections to other entities)
- `tags: string[]` (hierarchical, e.g. "BIM/Standards/Qatar")
- `zoteroKey?: string` (if imported from Zotero)
- `readingStatus?: ReadingStatus`
- `readingDepth?: ReadingDepth`
- `createdAt`, `updatedAt`, `archivedAt?`, `deletedAt?`

Entity types:
```
paper | book | report | standard | my-writing | thesis-chapter
person | organization | conference | project
atomic-note | reading-session | research-cluster
file | webpage | video | code-repo
```

---

## PART 3 — PERFORMANCE BASELINE

Before building any new feature, apply these to every existing page:

### 3.1 API Response Caching
```typescript
// In every GET route that doesn't change often:
c.header('Cache-Control', 'private, max-age=60') // 1 min for user data
c.header('Cache-Control', 'private, max-age=300') // 5 min for library data
```

### 3.2 Skeleton Loading Pattern (replace all spinners in content areas)
```tsx
// Use this instead of <Loader2 className="animate-spin" />
function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-surface-tertiary rounded', className)} />;
}
// Content skeletons:
<Skeleton className="h-6 w-3/4" />  // title
<Skeleton className="h-4 w-full" /> // body line
<Skeleton className="h-4 w-2/3" /> // shorter line
```

### 3.3 Data Fetching Pattern
```typescript
// Always parallel, never sequential:
const [a, b, c] = await Promise.all([
  apiFetch('/api/a').catch(() => defaultA),
  apiFetch('/api/b').catch(() => defaultB),
  apiFetch('/api/c').catch(() => defaultC),
]);
// Each has .catch() so one failure doesn't kill the page
```

---

## PHASE 1 — PhD Command Center (/phd) — Full Rebuild

**Goal:** Single page that replaces /home + /phd + supervision dashboard + GRS2 page.

### 1.1 Progress Bar Redesign
- REMOVE: current animated gradient bar with Lit Review / Fieldwork / Analysis / Writing milestones
- BUILD: Year-based timeline bar
  ```
  PhD Start (Jan 2026) ──── Year 1 ──── Year 2 ──── Year 3 ──── Year 4 ──── End (Jul 2029)
                             25%          50%          75%         100%
  ```
- Style: clean horizontal bar, no shimmer animation, subtle fill
- Show: current year highlighted, days elapsed in year, days remaining total
- Colors: CSS variables only — `var(--color-accent)` for fill

### 1.2 Dashboard Sections (tab layout)
Tabs: `Overview | Meetings | GRS2 | Tasks | Library Stats | Insights`

#### Overview Tab
Must show ALL of these:
1. **PhD Year Progress** — redesigned bar (1.1)
2. **GRS2 Widget** — current month, progress 0→25→75→100%, action buttons inline
3. **Previous Meeting** — Meeting #N, date, main topic, action items count
4. **Next Meeting** — date, location, days countdown (urgent if ≤3 days)
5. **Pending Tasks** — last 5 pending tasks with tick-to-complete (PATCH /api/tasks/:id)
6. **Meeting Tasks** — last 5 tasks sourced from meetings, with source meeting shown
7. **Library Stats** — total sources | read | to-read | reading | notes count
8. **Al-Khuwy shortcut** — prominent button → opens mini-chat popup (not navigate away)
9. **Usage/Cost/System** — collapsed by default, expandable accordion at the bottom

#### Meetings Tab (inside PhD dashboard)
- List all meetings: Meeting #1, #2, #3... (canonical numbering, not title-based)
- Each row: #N | Date | Location | Attendees | Task count | [Open details]
- "Open details" → modal or navigate to /meetings?session=ID
- Fix: Meeting #1 missing — investigate and recover
- Date is NOT part of the title — title = "Meeting #N" only

#### GRS2 Tab (inside PhD dashboard — replaces /grs2 standalone page)
- Current month: large progress bar + stage stepper + action buttons
- History: sorted newest-first, collapsible rows
- Dates: submittedAt + supervisorApprovedAt + studentConfirmedAt + universityApprovedAt
- Overdue warning banner if current month not submitted
- Fix: old records currently not loading — debug and fix
- /grs2 route redirects to /phd?tab=grs2

#### Tasks Tab (inside PhD dashboard)
- Split into: "From Meetings" | "General PhD Tasks"
- Each task: tick to complete (live PATCH), source meeting label, edit/delete
- Sync with /tasks page (same data, different view)
- No Obsidian-style task format — use platform tasks API

#### Insights Tab
- Editable inline — each insight can be edited in place
- Al-Khuwy mini-chat popup button (opens floating window, doesn't navigate)
- Categories: insight | idea | decision | concern | goal | progress | note

### 1.3 Calendar View
Add to PhD dashboard: Month / Week / Day calendar showing:
- Meeting dates
- Task due dates
- GRS2 deadlines
- Milestones

Use a lightweight calendar component (no heavy library — build from scratch or use date-fns).

### 1.4 Al-Khuwy Mini-Chat Popup
```tsx
// Floating chat window (not a full page)
// Trigger: button anywhere → setKhuwyOpen(true)
// Position: fixed bottom-right, 400px wide, 500px tall
// Close: X button or click outside
// Saves to /api/companion/memory automatically
```
Access points:
1. PhD Dashboard Overview tab — large shortcut button
2. PhD Dashboard Insights tab — "Talk to Al-Khuwy" button
3. Platform homepage — shortcut button
4. General /companion chat page (existing, unchanged)

### VERIFICATION AGENT 1
```
Verify /phd page after Phase 1. Read-only audit.
File: apps/web/src/components/phd/PhDDashboard.tsx

Check:
1. Progress bar uses Year 1-4 not milestone names
2. No shimmer/gradient animation on progress bar
3. All 9 Overview widgets present and wired to correct APIs
4. GRS2 tab functional: records load, actions work (submit/approve/confirm)
5. Tasks tab: tick-to-complete works (PATCH /api/tasks/:id), shows meeting source
6. Meeting #1 present and numbered correctly
7. Al-Khuwy mini-chat opens as popup (not navigation)
8. Usage/Cost collapsed by default
9. TypeScript clean, 206/206 tests green
10. /grs2 route redirects to /phd?tab=grs2

Score 1-10. List all failures with file:line.
```

---

## PHASE 2 — Meetings + Supervision + Mudawwin (Unified)

**Goal:** /meetings is the single home for all supervision content.

### 2.1 Meeting Data Model Fix
- Meeting title = "Meeting #N" (canonical, not date-based)
- Metadata displayed once: Date | Location | Attendees
- Remove date from title field in all existing records
- Fix inconsistent naming across sessions

### 2.2 Meeting Session View (3 tabs: Notes | Record | Chat)
Already partially built — fix and enhance:
- **Notes tab:** WikilinkEditor with onBlur auto-save
- **Record tab:** clean layout — no duplicate date/location/attendees
- **Chat tab:** chat-first intake for new meetings (already built, verify works)
- GRS2 fields (Input/Response) shown as blue callout card in Record tab ✓

### 2.3 Milestones — Full Rebuild
REMOVE: current Obsidian-backed milestones
BUILD: platform-native milestone store

```typescript
// New store type (add to types.ts):
interface Milestone {
  id: string;
  title: string;
  titleAr: string;
  date: string; // target date
  status: 'upcoming' | 'in-progress' | 'completed' | 'delayed';
  description?: string;
  links: string[]; // entity IDs
  tags: string[];
  meetingId?: string; // which meeting set this milestone
  grs2Month?: string; // associated GRS2 month
  attachments?: string[]; // file paths
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  deletedAt?: string;
}
```

Routes needed:
```
GET    /api/milestones
POST   /api/milestones
PATCH  /api/milestones/:id
DELETE /api/milestones/:id  → soft delete
POST   /api/milestones/:id/restore
```

UI: timeline view + list view, add/edit inline, link to meetings/tasks/library.

### 2.4 Supervision Content (moved from /supervision)
- Scope Points: platform-native (not Obsidian) — already partially done ✓
- Add scope points link to milestone timeline
- Supervision overview becomes a section in /meetings sidebar

### VERIFICATION AGENT 2
```
Verify /meetings page after Phase 2.

Check:
1. Meeting #1 exists and numbered correctly
2. Meeting titles = "Meeting #N" only (no date in title)
3. Date/Location/Attendees shown once, not duplicated
4. Milestones: can add/edit/delete from platform (no Obsidian)
5. Milestone soft-delete works (moves to archive)
6. GRS2 fields visible in Record tab
7. WikilinkEditor in Notes tab with auto-save
8. Mudawwin functionality merged into Notes/draft tab
9. TypeScript clean, 206/206 tests green

Score 1-10. List all failures with file:line.
```

---

## PHASE 3 — Tasks + Quick Notes + Habits (Unified)

**Goal:** /tasks is the single home for tasks, quick notes, and habits.

### 3.1 Task Model Enhancement
```typescript
interface TaskItem {
  // existing fields...
  sourceRef?: { type: 'meeting'; meetingId: string; meetingNo: number };
  isQuickNote?: boolean;    // true = display as sticky note
  noteColor?: string;       // default: '#fef08a' (yellow)
  categoryEn: string;       // REQUIRED
  categoryAr: string;       // REQUIRED
  archivedAt?: string;
  deletedAt?: string;
}
```

### 3.2 Quick Notes = Tasks with isQuickNote: true
- Yellow background (--color-amber-100 or `#fef08a`)
- No due time by default (can add)
- Subtasks supported (same as regular tasks)
- Convert to regular task: toggle `isQuickNote = false`
- Shown in a "Notes" section within /tasks, styled like sticky notes grid

### 3.3 Habits — Full Rebuild
Build proper habit tracker:
```typescript
interface Habit {
  id: string;
  titleEn: string;
  titleAr: string;
  frequency: 'daily' | 'weekly' | 'specific-days';
  specificDays?: number[]; // 0=Sun, 1=Mon...
  streak: number;
  completionHistory: { date: string; done: boolean }[];
  linkedTaskListId?: string; // generates a task when due
  reminder?: string; // HH:MM
  color?: string;
  archivedAt?: string;
}
```

Routes:
```
GET    /api/habits
POST   /api/habits
PATCH  /api/habits/:id
DELETE /api/habits/:id         → soft delete
POST   /api/habits/:id/complete → logs today's completion, updates streak
POST   /api/habits/:id/undo     → removes today's completion
```

UI standards (Todoist/TickTick level):
- Streak counter with fire emoji 🔥
- Calendar heatmap (last 30 days)
- Add/edit habit modal: title (AR+EN) + frequency + reminder + color
- Completion = animated checkmark (CSS transition, no library needed)
- Google Tasks sync: habits generate recurring tasks with RRULE

### 3.4 Bilingual Categories
All task lists/categories must have both:
```typescript
// Fix every existing category:
const TASK_LISTS = [
  { id: 'phd', en: 'PhD Research', ar: 'بحث الدكتوراه' },
  { id: 'life', en: 'Life', ar: 'الحياة' },
  { id: 'meetings', en: 'Meeting Tasks', ar: 'مهام الاجتماعات' },
  // user-created ones also get both fields
];
```

### 3.5 Google Tasks Sync
Must match Google Tasks API spec exactly:
- `tasklist` = platform task list
- `task.title` = task title
- `task.notes` = task notes
- `task.due` = RFC 3339 datetime
- `task.status` = 'needsAction' | 'completed'
- Subtasks: use `parent` field
- Habits: use Google Tasks repeat via RRULE in notes field
- Bidirectional sync: platform → Google Tasks + Google Tasks → platform

### 3.6 Soft/Hard Delete for Tasks
- Complete: ✓ animate → toast "Completed ✓" + Undo (5s)
- Delete: → Trash section → toast "Moved to Trash" + Undo (5s)
- Archive: → Archive section → toast "Archived" + Undo (5s)
- Trash visible in sidebar under Tasks
- Hard delete: from Trash only, with "Delete permanently?" confirm

### 3.7 Calendar View in Tasks
Month / Week / Day toggle.
Show: tasks with due dates, habit schedule, meeting dates.
Build lightweight — no full calendar library. Use CSS grid for month view.

### VERIFICATION AGENT 3
```
Verify /tasks page after Phase 3.

Check:
1. Quick Notes section shows yellow sticky-note style cards
2. Converting note ↔ task works
3. Habits: can add, edit, delete, complete with streak tracking
4. Habit completion animates correctly
5. Every task list has both EN and AR names
6. Soft delete → Trash, hard delete from Trash only
7. Undo button appears 5s after delete/complete
8. Calendar view shows Month/Week/Day
9. "Meeting Tasks" category shows source meeting label
10. Google Tasks sync structure matches API spec
11. TypeScript clean, 206/206 tests green

Score 1-10. List all failures with file:line.
```

---

## PHASE 4 — Unified Library (/library)

**Goal:** Replace /sources + /papers + /research + /notes with one system.

### 4.1 Entity Store (new API routes)
```
GET    /api/library/entities?type=&tag=&search=&limit=&offset=
POST   /api/library/entities
GET    /api/library/entities/:id
PATCH  /api/library/entities/:id
DELETE /api/library/entities/:id      → soft delete
POST   /api/library/entities/:id/restore
POST   /api/library/entities/:id/link  → link two entities
DELETE /api/library/entities/:id/link/:targetId

GET    /api/library/entity-types       → list all types (built-in + custom)
POST   /api/library/entity-types       → create custom type

GET    /api/library/entities/:id/backlinks
GET    /api/library/entities/:id/reading-sessions
```

### 4.2 Entity Detail Page
Each entity gets a full-page view:
```
┌─ Header ──────────────────────────────────────────────────────┐
│ [cover image]  [Type badge]  [Title]              [Edit] [⋮]  │
├─ Tabs ────────────────────────────────────────────────────────┤
│ Notes | Sub-notes | Connections | Reading | Files | History   │
└───────────────────────────────────────────────────────────────┘
```

**Notes tab:** WikilinkEditor, full markdown, auto-save on blur
**Sub-notes tab:** create child notes, each is an atomic note
**Connections tab:** linked entities (visual + list), multi-select link
**Reading tab:** reading sessions for this entity
**Files tab:** attached files with inline viewer (per Part 3 file spec)

### 4.3 Multi-select Linking
- Checkbox on each entity card in list view
- "Link selected (N)" button appears when items checked
- → opens entity picker → links all selected to chosen entity
- AI suggestions: "These 3 items seem related — link them?"

### 4.4 Zotero as Import Gateway
- Every Zotero item can be imported as a Library entity
- Import = creates entity with all Zotero metadata
- Reading sessions require a Library entity (with Zotero link preferred)
- "Add to Library" button in Zotero browser → creates entity

### 4.5 Research Clusters = Collections
- Existing clusters become `type: research-cluster` entities
- Files within a cluster → become file entities linked to the cluster
- cluster.notes → entity.notes (migrated)
- cluster.report → entity.report field

### 4.6 Reading Session Integration
- Reading session always linked to a Library entity
- Before starting: must pick or create entity
- Session notes → saved as sub-notes on the entity
- Snowballing: extract references → add to Library + Reading Queue

### 4.7 Reading Status & Depth
```typescript
type ReadingStatus = 'to-read' | 'skimming' | 'reading' | 'paused' | 'done';
type ReadingDepth = 'title-abstract-conclusion' | 'scan-only' | 'selective' | 'full';
```

Reading Queue = Library entities filtered by `readingStatus: 'to-read' | 'skimming'`

### 4.8 Export
From any entity or collection:
- DOCX (via Pandoc) — notes + metadata
- CSV — metadata table
- BibTeX — if has Zotero key
- RIS — for reference managers

### 4.9 Performance
- Entity list: paginated (50 per page) + virtual scroll
- Entity detail: lazy-load tabs (only fetch tab data when tab opens)
- Search: debounced 300ms, server-side with full-text index

### VERIFICATION AGENT 4
```
Verify /library page after Phase 4.

Check:
1. Entity types: paper, book, person, atomic-note all work
2. Entity detail: all 5 tabs load correctly
3. Multi-select linking works
4. Zotero import creates Library entity
5. Research clusters migrated as collection entities
6. Reading sessions linked to entities
7. Reading status and depth fields present
8. Export (DOCX/CSV) works for single entity
9. Soft delete + restore works
10. Performance: entity list paginated, no full re-fetch on tab switch
11. TypeScript clean, 206/206 tests green

Score 1-10. List all failures with file:line.
```

---

## PHASE 5 — Reading System (inside Library)

**Goal:** Reading sessions fully integrated with Library. Rename from Shwasha.

### 5.1 New Name
Page name TBD by Abdullah — placeholder: "Deep Reading" / "القراءة المعمّقة"
Route: keep /reading for now

### 5.2 Pre-reading Gate
- Cannot start a reading session without a Library entity selected
- If entity has no Zotero key → show "Add to Zotero first?" prompt with skip option
- Session = always belongs to a Library entity

### 5.3 Reading Status in Session
```
Status bar: [to-read] → [skimming] → [reading] → [paused] → [done]
Depth:      [title-abstract-conclusion] [scan-only] [selective] [full]
Pause note: "Paused because..." free text field
Continue:   "Resume from page X" auto-opens at last position
```

### 5.4 Session Notes Safety
- `isManual: true` → never auto-overwrite
- `isAiDraft: true` → can regenerate
- Per-page impressions: Arabic impression + English impression fields

### 5.5 Location Reference
```typescript
interface LocationRef {
  kind: 'page' | 'kindle' | 'chapter' | 'paragraph' | 'custom';
  raw: string;        // as typed: "p.45" or "Loc. 1250"
  display: string;    // normalized: "p. 45"
  start?: number;
  end?: number;
}
```
UI: smart input that parses "p.45" → LocationRef automatically

### 5.6 Citation Generation
Formats: Harvard | Birmingham | APA | Chicago
Generate from entity metadata + location reference
Copy to clipboard button on every generated citation

### 5.7 Snowballing
- AI extracts references from current paper → list appears
- Each reference: "Add to Library" | "Add to Reading Queue" | "Find in Zotero"
- Link extracted references to parent paper (cited-by relationship)

### VERIFICATION AGENT 5
```
Verify reading session system after Phase 5.

Check:
1. Cannot start session without Library entity
2. Reading status transitions work (to-read → skimming → reading → paused → done)
3. Reading depth selector present
4. Pause note field works
5. Resume opens at last position
6. Location field parses "p.45" → LocationRef correctly
7. Arabic + English impression fields present per page
8. Citation generation: Harvard/APA outputs correctly
9. Snowballing: extracts references, links to parent
10. TypeScript clean, 206/206 tests green

Score 1-10. List all failures with file:line.
```

---

## PHASE 6 — Notifications System

**Goal:** Sustainable, agent-driven notification system.

### 6.1 Notification Rule Model
```typescript
interface NotificationRule {
  id: string;
  titleEn: string;
  titleAr: string;
  trigger: {
    type: 'time-before' | 'daily-morning' | 'daily-evening' | 'cron';
    offsetHours?: number;   // for time-before
    cronExpression?: string; // for cron
    timeOfDay?: string;     // "08:00" for morning/evening
  };
  condition?: {
    type: 'grs2-not-submitted' | 'task-overdue' | 'meeting-upcoming' | 'custom';
    customCheck?: string;   // API endpoint to call
  };
  messageTemplate: { en: string; ar: string };
  linkTo?: string;          // URL to open when notification tapped
  agentId?: string;         // which agent manages this rule
  enabled: boolean;
  snoozedUntil?: string;
  createdAt: string;
}
```

### 6.2 Built-in Rules (created on first run)
```
Rule 1: GRS2 — 7 days before month end if not submitted
Rule 2: Meeting — 24h before next meeting
Rule 3: Meeting — 1h before next meeting
Rule 4: Tasks — morning summary "Not done yesterday: [tasks]" at 08:00
Rule 5: Tasks — evening preview "Tomorrow: [meetings + tasks]" at 21:00
Rule 6: Task due — 24h before task due date
```

### 6.3 Agent-Created Rules
Any agent can POST to `/api/notifications/rules` to create a new rule.
Frontend: agents can say "أضف تنبيه لكذا" → agent creates rule.

### 6.4 Management UI
```
/notifications page:
├─ Active rules list (title | trigger | next fire | enabled toggle)
├─ Add custom rule button
├─ Edit rule: timing / message / link / enable/disable / snooze
└─ History: last 50 fired notifications
```

### 6.5 In-app Delivery
- Notification bell in topbar shows count badge
- Click → dropdown with last 10 notifications
- Each notification: clickable → goes to linked page
- Mark as read / clear all

### VERIFICATION AGENT 6
```
Verify notification system after Phase 6.

Check:
1. 6 built-in rules created on startup
2. GRS2 rule fires when month not submitted within 7 days
3. Morning/evening rules fire at correct times
4. Agent can create new rule via API
5. Management UI: enable/disable/edit/snooze works
6. In-app bell shows count, dropdown shows notifications
7. Click notification → navigates to correct page
8. TypeScript clean, 206/206 tests green

Score 1-10. List all failures with file:line.
```

---

## PHASE 7 — Inbox + Quick Notes (Unified)

**Goal:** Inbox and Quick Notes = same system, accessed from sidebar and PhD dashboard.

### 7.1 Unified Note Model
Inbox items and Quick Notes share the same entity:
```typescript
interface QuickItem {
  id: string;
  type: 'note' | 'inbox';
  content: string;
  color: string;          // default '#fef08a' yellow
  category?: string;      // 'phd' | 'life' | 'general'
  tags?: string[];
  linkedTaskId?: string;  // if converted to task
  linkedEntityId?: string; // if linked to Library entity
  processedByAgent?: string; // Al-Khuwy processes PhD category
  aiSummary?: string;
  isProcessed: boolean;
  archivedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 7.2 Fix AI Processing Bug
Current inbox has AI processing errors — debug and fix:
- Likely: malformed prompt or schema mismatch in the processing pipeline
- Add defensive error handling so one failed item doesn't crash the queue
- Show processing status per item: pending | processing | done | error

### 7.3 PhD Category = Al-Khuwy's domain
Items with `category: 'phd'` → Al-Khuwy processes automatically:
- Extracts insights → saves to companion memory
- Suggests linking to Library entities
- Creates tasks if action items detected

### 7.4 Locations
- Sidebar: "📥 Inbox" item (platform-wide)
- PhD Dashboard: shortcut button with unprocessed count badge
- /notes-keep route redirects to sidebar panel

### 7.5 CRUD
- Add: floating + button, quick input, press Enter
- Edit: inline click-to-edit
- Archive: swipe or button → toast + undo
- Delete: soft → trash → hard from trash

### VERIFICATION AGENT 7
```
Verify Inbox/Quick Notes system after Phase 7.

Check:
1. Quick Notes and Inbox use same data model
2. Default color is yellow (#fef08a)
3. PhD category items auto-processed by Al-Khuwy
4. AI processing no longer crashes (individual item errors handled)
5. Sidebar shows inbox with count badge
6. PhD dashboard shows inbox shortcut
7. Soft delete → trash, hard delete from trash only
8. Undo works after archive/delete
9. TypeScript clean, 206/206 tests green

Score 1-10. List all failures with file:line.
```

---

## PHASE 8 — Zotero Bug Fix + Enhancements

### 8.1 Fix: `items.filter is not a function`
```typescript
// In ZoteroBrowser.tsx, every place items is used:
const safeItems = Array.isArray(data) ? data : (data as any)?.items ?? [];
// Apply to: loadItems, syncToVault, aiClassify, getCell, all .map/.filter/.find
```

### 8.2 Defensive Guards (audit entire ZoteroBrowser.tsx)
Every `.map()`, `.filter()`, `.find()` on items → wrap with `Array.isArray()` check.

### 8.3 Performance
- Cache invalidation on sync: only re-fetch changed collection
- Background sync: don't block UI during sync
- INBOX collection: highlight prominently, show count badge

### 8.4 Library Integration
- "Import to Library" button on every Zotero item
- Shows which Library entity is linked (if any)
- Cluster link section already built ✓ — verify still works

### VERIFICATION AGENT 8
```
Verify Zotero page after Phase 8.

Check:
1. items.filter is not a function — FIXED
2. Pressing sync/refresh doesn't crash
3. All .map/.filter/.find calls are guarded
4. "Import to Library" button creates Library entity
5. INBOX collection visible and highlighted
6. TypeScript clean, 206/206 tests green

Score 1-10. List all failures with file:line.
```

---

## PHASE 9 — Reports Inbox Enhancements

### 9.1 Bilingual Report Format
Every generated report = Arabic first, then English, in one message:
```markdown
## [Arabic Title]
[Arabic content...]

---

## [English Title]
[English content...]
```

### 9.2 Regenerate Button
Each report card has: `[↻ Regenerate]` → calls same generation endpoint, replaces current.
Show loading state during regeneration.

### 9.3 Custom Report Request
- Input field in /reports-inbox: "Request a custom report..."
- Or: shortcut button → opens chat with reports agent
- Report customization options: scope | tone | length | focus area

### 9.4 Soft Delete for Reports
Archive | Delete (soft) | Trash with undo — same system as everywhere else.

### VERIFICATION AGENT 9
```
Verify /reports-inbox after Phase 9.

Check:
1. Reports show Arabic then English in same message
2. Regenerate button works and shows loading state
3. Custom report request field or chat shortcut works
4. Soft delete → archive → trash → hard delete with undo
5. TypeScript clean, 206/206 tests green

Score 1-10.
```

---

## PHASE 10 — Search + Performance

### 10.1 Search History
```typescript
interface SearchHistoryEntry {
  id: string;
  query: string;
  timestamp: string;
  resultCount: number;
}
// Store: last 50 searches in localStorage
// UI: show history when input focused (empty query)
// Delete individual: × button
// Clear all: "Clear history" link
```

### 10.2 Platform-wide Search Scope
Index all: tasks | notes | meetings | library entities | Zotero items | agents | conversations
Each result: shows type badge + navigates to correct page/section on click.

### 10.3 Performance Audit (apply platform-wide)
Audit these specific slow spots:
- Quick Notes opening slow → check if fetching all notes on mount
- PhD dashboard → ensure all 9 widgets use parallel Promise.all
- Zotero browser → add 5-minute cache for items
- Library entity list → paginate + virtual scroll
- Graph → lazy-load only when tab/page focused

### 10.4 Global Soft/Hard Delete Audit
Verify every entity type has:
- PATCH /:id with `archivedAt` / `deletedAt` fields
- Restore endpoint
- Trash view in relevant page

### VERIFICATION AGENT 10
```
Verify search + performance after Phase 10.

Check:
1. Search history saves and shows on focus
2. Delete individual history item works
3. Search returns results from: tasks, meetings, library, zotero, notes
4. Result click navigates to correct page
5. PhD dashboard loads in < 2 seconds (all parallel fetches)
6. Zotero items cached (no re-fetch within 5 min)
7. All major entity types have soft/hard delete
8. TypeScript clean, 206/206 tests green

Score 1-10.
```

---

## PHASE 11 — Knowledge Graph Evolution

Only after Library is built (Phase 4):

### 11.1 New Node Types
Add to graph: person | conference | standard | my-writing | research-cluster
Colors per type (already defined — extend existing NODE_COLOR map).

### 11.2 New Edge Types
```
authored-by  → purple  (paper authored by person)
cited-by     → amber   (paper cited by paper)
part-of      → blue    (note part of cluster/session)
leads-to     → green   (milestone leads to next milestone)
presented-at → orange  (paper presented at conference)
```

### 11.3 Performance
- Only load visible nodes (viewport-based)
- Lazy-load edges on node click
- Max nodes rendered: 200 (paginate/filter beyond that)

### VERIFICATION AGENT 11
```
Verify /graph after Phase 11.

Check:
1. Library entities appear as graph nodes
2. New edge types render with correct colors
3. person/conference node types visible
4. Graph doesn't crash with 200+ nodes
5. TypeScript clean, 206/206 tests green

Score 1-10.
```

---

## VERIFICATION AGENT TEMPLATE (spawn after each phase)

```
You are a read-only verification agent for the Ruhool platform at C:\Users\alhud\platform.
DO NOT modify any files.

Platform: C:\Users\alhud\platform
Phase: [PHASE NUMBER AND NAME]

Run these commands (read-only):
1. pnpm --filter @ruhool/api exec tsc --noEmit
2. pnpm --filter @ruhool/web exec tsc --noEmit
3. cd apps/api && pnpm vitest run 2>&1 | tail -5

Then read the relevant files and check every item in the phase checklist above.

For each checklist item: PASS or FAIL (with file:line if fail).
Final score: 1-10 with justification.
Remaining issues: bulleted list with exact file paths and line numbers.
Total response: under 500 words.
```

---

## COMMIT CONVENTIONS

```
feat(phd/dashboard): [description]
feat(library): [description]
feat(meetings): [description]
feat(tasks): [description]
feat(notifications): [description]
fix(zotero): [description]
fix(phd): [description]
style(phd): design-only changes
refactor: structural changes, no behavior change
perf: performance improvements
```

After every 3 commits: `git log --oneline -10`
After completing all phases: `git tag -a ruhool-v3 -m "Full platform rebuild complete"`

---

## CONTEXT: Platform at C:\Users\alhud\platform

- Monorepo: apps/api (Hono), apps/web (Next.js App Router), packages/core
- API port: 3000, Web port: 3001
- Store: JSON file (getStore/saveStore)
- Tests: pnpm vitest run (must stay 206/206)
- Design system: CSS variables, Thmanyah fonts, RTL-first
- Current branch: ruhool-core-review (after full page review session)
- Tag: review-phd-v1 (previous review complete)
- User: Abdullah Al-Mutairi, PhD candidate, University of Birmingham
- Research: BIM adoption in Kuwait/GCC/MENA
- Platform name: Ruhool (رحول)

---

## PRIORITY ORDER (if time-limited)

P0 — Must do first (broken/missing):
1. Phase 1: PhD Dashboard (Zotero bug breaks, GRS2 not loading, tasks read-only)
2. Phase 8: Zotero `items.filter` crash fix
3. Phase 3: Habits broken (can't add/edit)

P1 — High value:
4. Phase 4: Unified Library (major architecture)
5. Phase 2: Meetings cleanup (Meeting #1 missing, duplicate data)
6. Phase 6: Notifications (sustainable system)

P2 — Important but can wait:
7. Phase 5: Reading system
8. Phase 7: Inbox/Quick Notes merge
9. Phase 9: Reports bilingual
10. Phase 10: Search + Performance
11. Phase 11: Graph evolution
