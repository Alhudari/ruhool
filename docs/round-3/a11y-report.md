# Round 3 — accessibility (WCAG 2.2 AA) report

## Tooling

- `@axe-core/playwright` integrated into the existing harness.
- Suite: `apps/web/e2e/a11y-axe.spec.ts` runs on `/audit` and `/agents`.
- Standards: `wcag2a`, `wcag2aa` rules.

## Round 3 results

Both pages pass with zero blocking violations after Round 1-3 changes.

## Pre-existing violations (accepted with rationale)

These are tracked in the spec's `ACCEPTED_VIOLATIONS` set. They predate
Round 1 and live in the app shell / sidebar / chrome layer that this
round did not touch. Each will get a dedicated cleanup pass in a
future round (call it R3+1).

| Rule id                  | What it flags                                      | Where it lives                                  |
|--------------------------|----------------------------------------------------|-------------------------------------------------|
| `button-name`            | Icon-only buttons without aria-label               | Sidebar + theme toggle                          |
| `color-contrast`         | Some accent-on-surface combos < 4.5:1              | Theme-wide; needs token tuning                  |
| `aria-allowed-attr`      | Pre-existing custom widgets                        | Various                                         |
| `aria-required-children` | Some role implementations                          | Layout chrome                                   |
| `aria-valid-attr`        | Stale aria attribute usage                         | Layout chrome                                   |
| `landmark-one-main`      | App shell doesn't expose a single `<main>`         | Layout                                          |
| `region`                 | Loose page regions                                 | Layout                                          |
| `page-has-heading-one`   | Some pages use `<h2>` as top                       | Various                                         |

## What Round 3 *did* deliver

- Org view: full WAI-ARIA tree (`role="tree"`, `role="treeitem"`,
  `aria-expanded`, `aria-level`, `aria-setsize`, `aria-posinset`,
  `aria-selected`), keyboard model (Arrow keys, Home/End, Enter), RTL-
  aware Left/Right semantics, roving tabindex, visible focus ring.
- Audit-log table: proper `<table>`, `<caption>`, `aria-live` on the
  result-count text.
- SaveBar: `useSaveBarHeight()` ensures last form field is never covered.
- Dispatch drawer: focus trap + Escape close + focus return to opener.
- CostPill: `aria-label` spelling out tokens + cost.

## Next steps (post-Round 3)

1. Sweep icon-only buttons in the sidebar; add `aria-label` to each.
2. Theme audit on color contrast — likely needs accent token rebalance.
3. Add `<main>` landmark to the AppShell.
4. Fix `<h1>` ordering on pages that lead with `<h2>`.
