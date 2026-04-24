# Round 1 — manual UI verification checklist

Most items here are now **auto-covered by Playwright** (marked ✅ auto).
The `[ ]` items still require a human run — primarily language/RTL
verification that a machine can't judge well.

Format: `[ ]` unchecked · `[x]` signed off · `✅ auto` covered by CI.

## Guarded navigation

- ✅ auto — dirty form blocks nav via guard (React modal or native confirm).
  Covered by `apps/web/e2e/unsaved-changes-programmatic.spec.ts`.
- [ ] Arabic: open `/settings` → Agent Names tab, dirty a field, click any
  sidebar link. Confirm the dialog reads "لديك تغييرات غير محفوظة…" in MSA.
- [ ] Close the browser tab with a dirty form. Browser's native
  `beforeunload` prompt fires.

## Audit log viewer

- ✅ auto — rows render, prefix filter narrows results, empty state shows.
  Covered by `apps/web/e2e/audit-log.spec.ts`.
- [ ] Arabic copy pass: column headers, empty state, "Load more" are MSA.
- [ ] Action prefix chips like `zotero.sync.run` stay LTR inside Arabic
  sentences (check the `<bdi>` wrapper visually — digit/dot direction).

## SaveBar

- ✅ auto — bar shows on dirty, Ctrl+S saves, last field not covered on
  long external-apis form. Covered by
  `apps/web/e2e/settings-save-bar.spec.ts`.
- [ ] Repeat manual check on the longest form (`Shwasha` tab) with a
  multi-line textarea scrolled all the way.

## Cost pill

- [ ] Manual (not auto yet) — the component renders, but isn't mounted in
  a real chat surface until Round 2. Once mounted, verify the chip reads
  "N tokens · $X.XX" or "غير متاحة" when metadata is missing.

## Agents Org view

- ✅ auto — List/Org toggle, dept expand, worker visibility, unknown-id
  warning chip. Covered by `apps/web/e2e/agents-org-view.spec.ts`.
- [ ] RTL tree mirroring: the border-start rail on worker cards must be
  on the right side when `language='ar'`.

## Zotero database search modal

- ✅ auto — status bar + Sync now + 409 path — covered by
  `apps/web/e2e/zotero-sync-bar.spec.ts`.
- [ ] Manual: open the Scopus modal with a real Scopus key (not mocked),
  run a query that returns > 30 results, click "Load more", confirm
  "Total" count and offset pagination is correct.

## Canvas templates

- ✅ auto — templates dropdown creates a new canvas. Covered by
  `apps/web/e2e/canvas-templates.spec.ts`.
- [ ] Visual: load each of the 4 templates and confirm the layout reads
  well (no overlapping nodes, edges follow the flow).
- [ ] RTL: in `language='ar'`, template names in the dropdown are MSA and
  the dropdown's position mirrors (opens on the correct side of the
  trigger).

## Health

- [ ] Manual: `curl http://127.0.0.1:3001/api/health` returns
  `{ ok: true, workers: { schedule: "ok", … }, vault: { rootDetected },
  zoteroSync: { running, lastRunAt }, uptimeMs }`. Tests don't hit this —
  it's an out-of-band API the Playwright harness doesn't boot.

## Perf baselines

- ✅ auto — `apps/web/e2e/perf-baseline.spec.ts` captures LCP/FCP/CLS on
  the 4 key pages and writes `docs/round-1/perf-baselines.md`.

## Sign-off

- [ ] Date + tester + language tested in.
- [ ] Any manual-only item failing → log in
  `docs/round-1/manual-ui-followups.md` and reopen the relevant Round 1
  deliverable.
