import { test, expect } from '@playwright/test';

test.describe('Zotero sync — dry-run toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/zotero\/collections/, (r) => r.fulfill({ json: { collections: [], tree: [] } }));
    await page.route(/\/api\/zotero\/items/, (r) => r.fulfill({ json: { items: [] } }));
    await page.route(/\/api\/zotero\/refresh-status/, (r) => r.fulfill({ json: { lastRefreshAt: null, daysSince: null, overdue: false, thresholdDays: 14 } }));
    await page.route(/\/api\/zotero\/sync\/status/, (r) => r.fulfill({ json: { lastRunAt: null, lastRunDurationMs: null, lastRunStats: null, running: false, lastError: null } }));
    await page.route(/\/api\/zotero\/config/, (r) => r.fulfill({ json: { mode: 'web', webUserId: '123', hasReadKey: true, hasWriteKey: false, writeEnabled: false } }));
  });

  test('toggle dry-run; POST carries dryRun:true', async ({ page }) => {
    let capturedBody: string | null = null;
    await page.route(/\/api\/zotero\/sync\/run/, (route) => {
      capturedBody = route.request().postData();
      return route.fulfill({ json: { stats: {}, actions: [], startedAt: '', finishedAt: '', durationMs: 0 } });
    });

    await page.goto('/zotero');
    // dry-run switch
    const dryRunToggle = page.getByRole('switch', { name: /dry-run|معاينة فقط/ });
    await expect(dryRunToggle).toBeVisible();
    await dryRunToggle.check();

    const syncBtn = page.getByRole('button', { name: /Preview now|عاين الآن/ });
    await expect(syncBtn).toBeVisible();
    await syncBtn.click();

    await expect.poll(() => capturedBody).toContain('"dryRun":true');
  });

  test('read-only pill shown when no write key', async ({ page }) => {
    await page.goto('/zotero');
    await expect(page.getByText(/read-only|قراءة فقط/).first()).toBeVisible({ timeout: 5000 });
  });
});
