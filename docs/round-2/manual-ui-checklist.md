# Round 2 — manual UI verification (additions over Round 1)

All Round 1 checklist items still apply. Round 2 adds:

## Hierarchical dispatch

- [ ] Set `ENABLE_HIERARCHICAL_DISPATCH=true` in `.env` and restart.
- [ ] POST to `/api/dispatch/chat` with `{ "message": "...", "language": "ar" }`.
- [ ] Verify the response `chain` array contains CEO + dept manager +
  ≥1 worker entries (unless the manager picks a `direct_answer`).
- [ ] `totalCostUsd` is sane (< 50¢).
- [ ] Audit log `/audit` shows `dispatch.*` entries for the run.
- [ ] Turn the flag off, re-run — returns 404 "dispatch disabled".
- [ ] Legacy `/api/chat` path still behaves normally.

## Zotero write + dry-run

- [ ] `/zotero` — sync bar shows "read-only" pill when no write key.
- [ ] Open Connection settings → add Write API Key → enable writes.
  - [ ] `/api/zotero/config` now returns `hasWriteKey: true`,
    `writeEnabled: true`.
  - [ ] Sync bar pill flips to "write enabled" / "كتابة مفعّلة".
- [ ] Toggle "dry-run" in the sync bar.
- [ ] Click "Preview now" — audit log shows `zotero-vault-sync.complete`
  with a zero-update run (no side effects).
- [ ] Hit `/api/zotero/sync/dry-run-plan` — returns the plan rows.

## Drawer + chain indicator

- [ ] Components compile + import without errors (covered by
  `dispatch-routing-chain.spec.ts`).
- [ ] When the chain is wired into chat (Round 3 completion work),
  verify click-to-open drawer; focus trap; Escape closes; focus
  returns to indicator.

## Bidi

- [ ] Manual: in Arabic, a note whose frontmatter contains a DOI or
  URL remains readable; no stray `‎` / `‏` inside YAML after a sync.
- [ ] Automated: `packages/core/test/frontmatter-bidi.test.ts` — green.

## Sign-off

- [ ] Date + tester + language tested in.
