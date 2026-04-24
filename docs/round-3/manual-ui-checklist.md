# Round 3 — manual UI verification (additions over Round 1+2)

Round 1 + 2 checklists still apply. Round 3 adds:

## ARIA treeview

- ✅ auto — covered by `apps/web/e2e/org-view-aria.spec.ts`.
- [ ] Manual screen-reader pass: focus the first item with the
  keyboard, navigate with Arrow Down — VoiceOver / NVDA / Narrator
  should announce "tree, treeitem, level 1, expanded, 1 of 6" or
  equivalent.
- [ ] Arabic: with `language='ar'`, ArrowLeft expands a dept and
  ArrowRight collapses it. Visual indent rail is on the right side.

## Canvas auto-zoom

- ✅ auto — `canvas-auto-zoom.spec.ts` confirms the toolbar button.
- [ ] Manual: load each of the 4 templates and confirm all nodes are
  inside the visible viewport with a small margin after the auto-zoom
  finishes.
- [ ] Press the "Fit to content" button after manually zooming in —
  the canvas re-centers on the content bounding box.

## Suspense skeletons

- ✅ auto — `settings-suspense.spec.ts` confirms the lazy tab loads.
- [ ] Manual on a slow network (Chrome DevTools → Network → Slow 3G):
  switching to the Providers / External Services / Agent Names /
  Shwasha tab shows the skeleton briefly, then real content.

## Bidi + a11y

- ✅ auto — `bidi.spec.ts` and `a11y-axe.spec.ts`.
- [ ] Manual: set `language='ar'`, visit `/audit`, scan for any obvious
  text overlap or reversed numbers in mixed-content cells.

## Health + dispatch flag

- [ ] `curl http://127.0.0.1:3001/api/health` — JSON now includes
  `dispatch: { enabled: true }` (default ON) and `zotero:
  { writeEnabled, deltaEnabled }`.

## Sign-off

- [ ] Date + tester + browser + locale.
- [ ] Cross-link any failure → `docs/round-3/manual-ui-followups.md`
  (created on demand) and reopen the offending deliverable.
