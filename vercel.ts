/**
 * Vercel deployment configuration for Ruhool.
 *
 * NOT READY TO DEPLOY YET — see docs/DEPLOYMENT_ROADMAP.md.
 * The current code uses local Windows paths (C:\Users\alhud\OneDrive...) and
 * localhost:23119 for Zotero. A deploy NOW would 404 on every vault call.
 *
 * Prerequisites before `vercel deploy`:
 *   1. Implement GitVaultAdapter in packages/core/src/integrations/obsidian/vault-adapter.ts
 *   2. Implement Zotero Web API adapter (lazy import in vault-tasks.ts)
 *   3. Switch vault-reader.ts internals to use the adapter pattern
 *   4. Run `vercel env add` for: ANTHROPIC_API_KEY, ZOTERO_USER_ID, ZOTERO_API_KEY,
 *      OBSIDIAN_GIT_REPO, OBSIDIAN_GIT_TOKEN, RUHOOL_VAULT_ADAPTER=git
 *   5. Migrate the JSON store to a real database (Vercel Postgres / Neon)
 *
 * After those: `vercel deploy --prod`.
 */
import { routes, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  buildCommand: 'pnpm build',
  framework: 'nextjs',
  // Apps/web is the Next.js root for Vercel
  outputDirectory: 'apps/web/.next',
  ignoreCommand: 'git diff --quiet HEAD^ HEAD ./apps/web ./apps/api ./packages',
  rewrites: [
    // Proxy /api/* requests to the Hono API. In production the API can be:
    //  (a) deployed as Vercel Functions in apps/api/api/[...slug].ts (preferred)
    //  (b) deployed separately to Railway/Fly and proxied here
    routes.rewrite('/api/(.*)', 'https://your-api-host.example.com/api/$1'),
  ],
  headers: [
    routes.cacheControl('/static/(.*)', { public: true, maxAge: '1 week', immutable: true }),
  ],
  crons: [
    // Weekly cron that pulls latest from the Git-backed vault
    { path: '/api/cron/sync-vault', schedule: '0 */6 * * *' },
  ],
};
