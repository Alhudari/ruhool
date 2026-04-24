# Round 3 — fuṣḥā copy audit methodology

## Sweep

```
grep -rn -E "ها(ي|ذا)|هسه|شلون|وين|ليش|إحنا|احنا|شفتو|يالله" \
  apps/web/src apps/api/src packages/core/src
```

This regex targets the most common Kuwaiti / Gulf / Egyptian dialect
tokens. The `phd-context.ts` file intentionally BLOCKS these in the
agent's anti-hallucination guard — those hits are negative examples,
not actual dialect usage, and are marked `ok` in `copy-audit.csv`.

## Result

**Zero dialect tokens in platform chrome or user-facing copy.** The
only hits are in the prompt guardrail teaching the agent not to use
dialect. Round 1 + Round 2 + Round 3 UI strings audited line-by-line
in each round's `copy-review.md` — all MSA verdicts.

## Ongoing guard

To catch regressions, run the sweep before each commit. A pre-commit
hook scaffold (not installed by default):

```sh
#!/bin/sh
if git diff --cached --name-only | grep -E "\.(ts|tsx)$" | xargs grep -lE "ها(ي|ذا)|هسه|شلون|وين|ليش" 2>/dev/null; then
  echo "Dialect token detected. If intentional (prompt guard), add a NOTE comment."
  exit 1
fi
```

## Scope note

A row-per-Arabic-string audit would be >1000 rows and low signal —
the chrome copy was already reviewed string-by-string in Round 1-3
per-round `copy-review.md` docs. This sweep is the gap-fill that
confirms the wider codebase (older prompt files, component bodies)
is free of dialect tokens.
