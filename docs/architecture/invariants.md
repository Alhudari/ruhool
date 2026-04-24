# Ruhool — platform invariants

These are the things that must remain true as the system evolves. Break one
and you break user trust — lose notes, silently drop tasks, leak keys, or
corrupt the store. Every PR should be read against this list.

## Single-writer store

- `data/store.json` is the JSON snapshot of user state. It is a read-modify-
  write file with **no database-level locking**.
- **Every write must go through `saveStore()`** in `apps/api/src/store/index.ts`.
  That function routes through `withLock()` — a promise-chain mutex that
  serializes concurrent writes.
- No worker, no route, no service may call `fs.writeFile(STORE_FILE, …)`
  directly. Auditable via `grep -rn "STORE_FILE\|store\.json" apps/api/src`.
- No `await` inside `saveStore()`'s critical section that could starve other
  writers; keep the critical section synchronous (`writeFileSync`).

## Audit log is append-only

- `data/audit-log.jsonl` is one JSON object per line, ordered by write time.
- Entries are **never mutated or deleted**. If the file exceeds 50 MB, it is
  renamed to `audit-log.YYYY-MM-DD.jsonl` and a fresh file starts. The
  rotated file is left on disk untouched.
- Readers (`/api/audit-log`) use line-by-line streaming. Never load the full
  JSONL into memory. Cursor = byte offset.

## Vault writes retry on EPERM

- The vault lives under OneDrive. OneDrive sync can lock files during write
  windows, surfacing as `EPERM`.
- `moveContentsInVault` already retries with backoff. **Any new write path
  that targets the vault must do the same.**
- Writes should be single-file atomic (`fs.writeFile`), not whole-folder.
  Whole-folder renames were observed to fail intermittently on Windows.

## Secret redaction

- API keys, webhook URLs with auth tokens, provider API keys, Zotero write
  keys — none of these may appear in logs in plain form.
- When a log line needs to identify a key, emit `…${key.slice(-4)}`.
- The secrets-sweep grep is part of every Round's definition of done.

## Agent routing (legacy → hierarchical)

- The legacy agent routing (user picks an agent, message goes straight to
  that agent) is the **default and must keep working**.
- Hierarchical routing (CEO → manager → workers → synthesis) lands in
  Round 2 behind feature flag `ENABLE_HIERARCHICAL_DISPATCH`. Not default.
- No refactor of `apps/api/src/routes/chat.ts` may break the legacy path.

## Ruhool is the platform

- Obsidian is a silent backup destination. Never in-product copy tell the
  user "open Obsidian" or "edit this file in your vault". The platform UI
  must be the answer.
- The vault reader auto-detects the vault root; if detection fails, the
  feature that needed it must fail gracefully with a user-facing message
  inside the platform.

## Arabic is Modern Standard Arabic (فصحى)

- All ar copy must be MSA. No Kuwaiti / Gulf / Egyptian dialect tokens in
  user-facing strings. Dialect in agent personality prompts is okay; UI
  chrome is not.
- Every Round's copywriter reviews new strings and records verdicts in
  `docs/round-N/copy-review.md`.

## Theme tokens, not hex / Tailwind color classes

- `bg-surface`, `bg-surface-secondary`, `text-on-surface`, `text-accent`,
  `bg-success`, `bg-warning`, `bg-info`, `bg-error`, `border-border`.
- No `bg-red-500`, `text-emerald-600`, `bg-amber-500/10`. Exceptions: brand
  identity colors for providers (Anthropic purple, etc.) and semantic
  gender indicators in voice selection — already documented where used.

## Time zones

- `Europe/London` primary, `Asia/Kuwait` secondary.
- Agents interpreting "today" / "بكرة" / "ignoring any date" resolve via
  the user's configured primary zone, falling back to the Zotero API's UTC.
- Relative-date user messages get converted to absolute dates before being
  saved to any memory or audit entry.

## Anti-hallucination

- Agents say "لا أعرف" when context is missing. They do not fabricate paper
  titles, citations, supervision meeting summaries, or file paths.
- New features must provide the agent with real context (vault note, Zotero
  item, audit entry) or explicitly tell the agent the context is empty.

## Boot order

- API boot starts workers sequentially with individual try/catch so one
  worker failing does not crash the process.
- Vault-dependent workers run a `getVaultRoot()` precheck; on failure, log a
  clear warning and skip (do not schedule a broken job).
- The summary line `[boot] workers: X=ok, Y=skipped(reason), …` is the
  canonical signal that boot completed.
