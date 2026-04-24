# Round 3 — RTL pass findings

Swept every Round 1 + Round 2 component at `language='ar'` via Playwright
(`bidi.spec.ts`) and manual eyeballing. Findings:

| component                           | issue                                                             | fixed |
|-------------------------------------|-------------------------------------------------------------------|-------|
| `RoutingChainIndicator`             | Uses `ChevronLeft`/`Right` conditionally — already RTL-aware     | ok    |
| `DispatchDetailDrawer`              | Slide-in from `e` side via `border-e`/`border-s` toggle          | ok    |
| `AuditLogTable` action chips        | Prefix strings LTR via `<bdi>` wrappers                          | ok    |
| `CostPill`                          | `<bdi>` on numeric content                                       | ok    |
| `AgentsListPage` org view tree      | Indent rail flips via `border-s-2` / `border-e-2` in RTL         | ok    |
| `CanvasPage` templates dropdown     | Dropdown anchored `start-0` — mirrors on RTL correctly            | ok    |
| SaveBar                             | `fixed inset-x-0 bottom-0` — symmetrical, no RTL issue            | ok    |
| `ZoteroBrowser` dry-run toggle      | `<bdi>` on numeric status, arrow icons use theme tokens          | ok    |
| `WriteApiKeyField`                  | `inline-flex gap-1.5` aligns correctly both LTR/RTL              | ok    |

## Areas not touched this round (stable)

- Layout sidebar / mobile-tab-bar: pre-existing RTL behavior untouched;
  the layer-3 `<a>` guard still fires.
- Settings tabs rail: its buttons are `text-start` which flips naturally.

## Known residual

None that would block sign-off. Screenshot-diffs across themes are a
stretch deliverable — scope constraint acknowledged in
`docs/round-3/manual-ui-checklist.md`.
