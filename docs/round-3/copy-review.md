# Round 3 — bilingual copy review

Round 3 added very little new user-facing copy; the work was structural
(ARIA, Suspense, perf, security). New strings in this round:

| key                   | en                  | ar (MSA)           | verdict |
|-----------------------|---------------------|--------------------|---------|
| canvas.fitToContent   | Fit to content      | املأ الشاشة        | ok      |
| zoom.in.title         | Zoom in             | تكبير              | ok      |
| zoom.out.title        | Zoom out            | تصغير              | ok      |

The Round 1 + Round 2 copy review docs (`docs/round-1/copy-review.md`,
`docs/round-2/copy-review.md`) cover all earlier strings.

## Sweep verdict

No dialect tokens introduced. All Arabic chrome strings remain in MSA
(الفصحى).

## Empty states audit

Round 3 added the React.lazy + Suspense skeleton on 4 settings tabs.
The skeleton is `aria-hidden="true"` and shows shapes only — no copy.
The real settings components retain their existing empty states from
Round 1.

| surface                       | empty state present? |
|-------------------------------|----------------------|
| `/audit` (no entries)         | yes (Round 1)        |
| `/agents` unassigned section  | not applicable (only renders when there are unassigned agents) |
| `/zotero` saved-searches      | yes ("No saved searches") |
| `/canvas` no nodes            | n/a — empty canvas IS the empty state |
| dispatch detail drawer        | yes ("No dispatches yet") |
