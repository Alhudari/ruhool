# Round 3 — security review

## Secrets sweep (Round 2 additions)

Grepped for `console.log` / `console.warn` / `console.error` on key-
bearing identifiers in:

- `apps/api/src/services/dispatch/*.ts`
- `apps/api/src/routes/dispatch.ts`
- `apps/api/src/routes/zotero.ts` (write-config endpoint)
- `apps/api/src/workers/zotero-vault-sync.ts`
- `packages/core/src/integrations/zotero/write-api.ts`

**Zero leaks.** Every audit-log entry that touches a key emits
`keyEnding: key.slice(-4)` — never the plaintext.

## Path-traversal audit

Every route that takes a user-supplied string:

| Route                                   | User input            | Used as path? | Safe? |
|-----------------------------------------|-----------------------|---------------|-------|
| `GET /api/audit-log`                    | prefix, source, dates | No — filters  | ✅    |
| `POST /api/databases/saved-searches`    | query, label          | No — stored   | ✅    |
| `DELETE /api/databases/saved-searches/:id` | id                 | No — lookup   | ✅    |
| `PUT /api/agent-org`                    | ceo, dept ids         | No — stored   | ✅    |
| `GET /api/zotero/sync/dry-run-plan`     | (none)                | —             | ✅    |
| `POST /api/zotero/sync/run`             | dryRun                | —             | ✅    |
| `POST /api/dispatch/chat`               | message               | No — passed to LLM | ✅ |
| `PUT /api/zotero/write-config`          | writeApiKey           | Stored in store.json encrypted-at-rest via existing provider encryption path | ✅ |

No user input is interpolated into a file path anywhere in Round 2+3
code.

## CSP + security headers

Inspected `apps/web/next.config.js`. Existing configuration:

- `Content-Security-Policy` — restrictive, allows same-origin + the API
  host + websockets. Dev adds `unsafe-eval` for React refresh; production
  strips it.
- `X-Frame-Options: SAMEORIGIN` (not DENY — split-pane iframes need it).
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.

No changes required.

## Rate-limit coverage

Round 1 middleware applied in Round 1 to:
- `POST /api/databases/saved-searches`
- `POST /api/zotero/sync/run`

Round 2 added routes **not yet rate-limited**:
- `POST /api/dispatch/chat` — LLM-backed, expensive. **Follow-up:** add
  a rate-limit in the next maintenance pass; not shipped in Round 3 to
  keep the feature-flag rollout clean.
- `PUT /api/zotero/write-config` — infrequent user action; low risk of
  abuse on a single-user box.

## Authorization

Out of scope for Round 3 (user-local app). Round-wide RUHOOL_API_TOKEN
header (see `.env.example`) protects the whole API when deployed; no
per-route changes needed.

## Conclusion

No P0/P1 findings. Follow-up ticket for dispatch-chat rate-limit.
