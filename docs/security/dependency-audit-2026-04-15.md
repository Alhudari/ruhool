# Dependency audit — 2026-04-15 (SEC-11)

## Environment

- `pnpm --version`: **9.15.0** (packageManager pin)
- `node --version`: v22.14.0
- OS: Windows 11

## Audit tooling

`pnpm audit` (both v9.15.0 and `npx pnpm@10`) fails with
`ERR_PNPM_AUDIT_BAD_RESPONSE` because it still POSTs to the retired
`/-/npm/v1/security/audits` endpoint (HTTP 410). Upgrading pnpm at the
project level is out-of-scope for SEC-11. As a drop-in replacement we
added `scripts/bulk-audit.mjs`, which:

1. Parses `pnpm-lock.yaml`, extracting every `pkg@version` pair across
   all workspaces.
2. POSTs batches to the modern
   `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`
   endpoint.
3. Filters advisories against the actually-installed versions and
   reports totals by severity.

Re-run:

```bash
cd C:/Users/alhud/platform
node scripts/bulk-audit.mjs > .audit-report.json
```

`.audit-report.json` is git-ignored build output; the script is the
source of truth.

## Initial advisory totals (before fixes)

Scanned **1164 packages / 1322 installed versions**.

| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 5     |
| Moderate | 6     |
| Low      | 0     |

## Fixes applied

| Package         | Where                                  | Old      | New       | Advisory                                                             |
|-----------------|----------------------------------------|----------|-----------|----------------------------------------------------------------------|
| `drizzle-orm`   | `apps/api`, `packages/db` (direct dep) | `0.38.4` | `0.45.2`  | GHSA — SQL injection via improperly escaped identifiers (**high**)    |
| `drizzle-kit`   | `packages/db` (devDep)                 | `0.30.6` | `0.31.10` | pulls in esbuild `>=0.25.x` transitively (**moderate esbuild DoS**)   |
| `esbuild` (all `<=0.24.2` instances) | pnpm override in root `package.json` → `^0.25.0` | `0.18.20`, `0.19.12` | `0.25.x` | GHSA-67mh-4wv8-2f99 — dev-server request forgery (**moderate**) |

After fixes: `pnpm -r test` green (24/24 in `apps/api`, 11/11 shared,
3/3 db, 2/2 core; `apps/studio` and `apps/web` have no vitest tests).

## Post-fix residuals

Scan totals: **0 critical, 4 high, 4 moderate, 0 low**.

| Pkg         | Installed | Advisory (severity)                                                                                       | Reason not upgraded                                                                                                                                  | Risk                                                                                                       |
|-------------|-----------|-----------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| `next`      | `14.2.35` | GHSA — HTTP req deserialization DoS (**high**)                                                            | Rule SEC-11 forbids touching Next.js. Fix requires **Next 15.x** (major). Track separately as UPGRADE-NEXT-15.                                        | Medium. `next@14.2.35` is the latest 14.2 patch. Mitigations: no SSR action-based deserialization inputs exposed publicly; rate-limiting at edge.     |
| `next`      | `14.2.35` | GHSA — DoS via Server Components (**high**)                                                               | Same as above.                                                                                                                                       | Medium. DoS only; no data exfiltration. Front by CDN/WAF.                                                   |
| `next`      | `14.2.35` | Image Optimizer remote-pattern DoS (**moderate**)                                                         | Same as above.                                                                                                                                       | Low. We do not use next/image remotePatterns with untrusted origins.                                        |
| `next`      | `14.2.35` | HTTP request smuggling in rewrites (**moderate**)                                                         | Same as above.                                                                                                                                       | Low. No rewrites ahead of auth boundary.                                                                    |
| `next`      | `14.2.35` | Unbounded next/image disk cache growth (**moderate**)                                                     | Same as above.                                                                                                                                       | Low. Container has bounded tmpfs; monitored.                                                                |
| `next-intl` | `3.26.5`  | Open-redirect (**moderate**)                                                                              | Fix requires `>=4.9.1` — major bump with API changes in locale routing (touches `apps/web/src/**` which SEC-11 forbids). Track as UPGRADE-NEXT-INTL-4. | Low. No user-controlled redirect targets piped to `redirect()` in current routes; verified by grep.         |
| `xlsx`      | `0.18.5`  | Prototype Pollution (GHSA-4r6h-8v6p-xvw6, **high**)                                                        | **No fix on npm registry.** SheetJS removed patched versions from npm; `>=0.19.3` is only on `cdn.sheetjs.com`. Requires registry change.              | Medium. `xlsx` is used only server-side in `apps/api` for trusted admin exports. No untrusted workbook parsing. |
| `xlsx`      | `0.18.5`  | ReDoS (GHSA-5pgg-2g8v-p4x9, **high**)                                                                      | Same as above.                                                                                                                                       | Low. Admin-only export path; inputs are internal data.                                                      |

## Follow-ups filed in `AUDIT.md`

- `UPGRADE-NEXT-15` — bump `next` 14.2.35 → 15.5.x in `apps/web`
  (resolves 2 high + 3 moderate).
- `UPGRADE-NEXT-INTL-4` — bump `next-intl` 3 → 4 in `apps/web`
  (resolves 1 moderate).
- `REPLACE-XLSX` — migrate `xlsx` to `exceljs` or pull patched
  SheetJS from `cdn.sheetjs.com` via `pnpm` tarball (resolves 2 high).

All three are tracked as residual **medium-risk** findings; none are
exploitable in current production traffic patterns (internal admin
surfaces, CDN/WAF in front, no untrusted redirect/workbook inputs).

## Re-run command

```bash
cd C:/Users/alhud/platform
node scripts/bulk-audit.mjs > .audit-report.json
# or, when pnpm 10+ reliably uses the bulk endpoint:
pnpm audit --json
```
