# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: zotero-sync-dry-run.spec.ts >> Zotero sync — dry-run toggle >> toggle dry-run; POST carries dryRun:true
- Location: e2e\zotero-sync-dry-run.spec.ts:12:7

# Error details

```
Error: page.goto: Target page, context or browser has been closed
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Zotero sync — dry-run toggle', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.route(/\/api\/zotero\/collections/, (r) => r.fulfill({ json: { collections: [], tree: [] } }));
  6  |     await page.route(/\/api\/zotero\/items/, (r) => r.fulfill({ json: { items: [] } }));
  7  |     await page.route(/\/api\/zotero\/refresh-status/, (r) => r.fulfill({ json: { lastRefreshAt: null, daysSince: null, overdue: false, thresholdDays: 14 } }));
  8  |     await page.route(/\/api\/zotero\/sync\/status/, (r) => r.fulfill({ json: { lastRunAt: null, lastRunDurationMs: null, lastRunStats: null, running: false, lastError: null } }));
  9  |     await page.route(/\/api\/zotero\/config/, (r) => r.fulfill({ json: { mode: 'web', webUserId: '123', hasReadKey: true, hasWriteKey: false, writeEnabled: false } }));
  10 |   });
  11 | 
  12 |   test('toggle dry-run; POST carries dryRun:true', async ({ page }) => {
  13 |     let capturedBody: string | null = null;
  14 |     await page.route(/\/api\/zotero\/sync\/run/, (route) => {
  15 |       capturedBody = route.request().postData();
  16 |       return route.fulfill({ json: { stats: {}, actions: [], startedAt: '', finishedAt: '', durationMs: 0 } });
  17 |     });
  18 | 
> 19 |     await page.goto('/zotero');
     |                ^ Error: page.goto: Target page, context or browser has been closed
  20 |     // dry-run switch
  21 |     const dryRunToggle = page.getByRole('switch', { name: /dry-run|معاينة فقط/ });
  22 |     await expect(dryRunToggle).toBeVisible();
  23 |     await dryRunToggle.check();
  24 | 
  25 |     const syncBtn = page.getByRole('button', { name: /Preview now|عاين الآن/ });
  26 |     await expect(syncBtn).toBeVisible();
  27 |     await syncBtn.click();
  28 | 
  29 |     await expect.poll(() => capturedBody).toContain('"dryRun":true');
  30 |   });
  31 | 
  32 |   test('read-only pill shown when no write key', async ({ page }) => {
  33 |     await page.goto('/zotero');
  34 |     await expect(page.getByText(/read-only|قراءة فقط/).first()).toBeVisible({ timeout: 5000 });
  35 |   });
  36 | });
  37 | 
```