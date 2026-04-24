# Round 1 — bilingual copy review (MSA verdict per string)

Format: `page` → `key` → `en` → `ar` → verdict.

Verdicts:
- `ok` — MSA, clear, no dialect.
- `fixed` — was dialect / awkward; updated version shown.
- `flagged` — needs human translator; do not ship until reviewed.

## /audit page

| key                  | en                                        | ar (MSA)                                        | verdict |
|----------------------|-------------------------------------------|-------------------------------------------------|---------|
| page.title           | Audit Log                                 | سجلّ التدقيق                                    | ok      |
| filter.prefix        | Action prefix                             | بادئة الإجراء                                   | ok      |
| filter.source        | Source                                    | المصدر                                          | ok      |
| filter.from          | From                                      | من                                              | ok      |
| filter.to            | To                                        | إلى                                             | ok      |
| empty.default        | No entries yet.                           | لا توجد سجلات بعد.                              | ok      |
| empty.noMatch        | No entries in this range.                 | لا توجد سجلات ضمن هذا النطاق.                   | ok      |
| loadMore             | Load more                                 | تحميل المزيد                                    | ok      |
| result.count         | Showing {n} entries                       | تظهر {n} سجلات                                  | ok      |

## CostPill

| key          | en                       | ar (MSA)                         | verdict |
|--------------|--------------------------|----------------------------------|---------|
| tokensLabel  | tokens                   | رموز                             | ok      |
| costLabel    | cost                     | التكلفة                          | ok      |
| unavailable  | cost unavailable         | التكلفة غير متاحة                | ok      |

## Guarded-nav modal

| key              | en                                        | ar (MSA)                                             | verdict |
|------------------|-------------------------------------------|------------------------------------------------------|---------|
| title            | Unsaved changes                           | تغييرات غير محفوظة                                   | ok      |
| body             | You have unsaved changes. Leave anyway?  | لديك تغييرات غير محفوظة. هل تريد المغادرة؟           | ok      |
| button.leave     | Leave                                     | غادر                                                 | ok      |
| button.stay      | Stay                                      | ابقَ                                                 | ok      |

## Boot log (server-side, surfaces in dev console and optionally in a toast)

| key            | en                                            | ar                                    | verdict  |
|----------------|-----------------------------------------------|---------------------------------------|----------|
| vault.missing  | Vault root not found; sync scheduler skipped. | (server-only, English by design)      | ok       |

## Notes

- All Arabic copy reviewed by the bilingual product owner (Abdullah) on
  next manual UI pass — see `docs/round-1/manual-ui-checklist.md`.
- No dialect tokens (no هاي/هسه/شلون/وين) present.
- LTR tokens embedded in Arabic (e.g. `zotero.sync.run` prefix chips) use
  `<bdi>` wrappers where rendered inside Arabic sentences.
