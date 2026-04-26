# Round 3 — TASK 7 (recursive nested splits) decision

## Decision: **SKIPPED**

## Panel

- **Principal Architect** — SKIP. Current `SplitState` is a flat array
  served by a stable 4-pane max. Moving to a tree requires rewriting
  every split/resize/drag handler and migrating a v2 → v3 localStorage
  schema. High blast radius for a feature the user already said no to
  in an earlier session.
- **Frontend Engineer** — SKIP. The recursive divider-drag math + focus
  + screen-reader semantics add ~400 lines and a non-trivial bug surface.
  A quadrant layout can be simulated today by the user with two rows of
  two panes in their tiled window manager.
- **Performance Engineer** — SKIP. No perf evidence that flat row
  splits are a bottleneck. Recursive tree would add re-render work on
  every resize.
- **QA Engineer** — SKIP. The existing 4-pane row has zero failing
  tests; rewriting it to a tree obligates re-testing every pane-hosted
  page in both orientations × 4 themes. Cost > value.

Unanimous: **skip**. User's earlier stated preference to skip stands.

## What we keep instead

The split-pane system's existing invariants:
- Flat 4-pane row max (horizontal or vertical).
- localStorage v2 schema — no migration touched this round.
- Resize math preserved bit-for-bit.

## If TASK 7 ever becomes worth doing

Re-open this decision only if the user demonstrates a concrete workflow
that demands quadrants (e.g. "I want Zotero in top-left, note in top-
right, chat bottom-left, canvas bottom-right, all live"). The
implementation spec would live in `docs/architecture/nested-splits.md`
and include a v2 → v3 migrator that persists to
`ruhool:splits:v2.backup` for one release before deleting.
