import { test, expect } from '@playwright/test';

test.describe('Zotero sync status bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/zotero\/collections/, (route) =>
      route.fulfill({ json: { collections: [], tree: [] } }),
    );
    await page.route(/\/api\/zotero\/items/, (route) =>
      route.fulfill({ json: { items: [] } }),
    );
    await page.route(/\/api\/zotero\/refresh-status/, (route) =>
      route.fulfill({ json: { lastRefreshAt: null, daysSince: null, overdue: false, thresholdDays: 14 } }),
    );
  });

  test('shows last run + Sync now; 409 path', async ({ page }) => {
    await page.route(/\/api\/zotero\/sync\/status/, (route) =>
      route.fulfill({ json: {
        lastRunAt: '2026-04-22T10:00:00.000Z',
        lastRunDurationMs: 1500,
        lastRunStats: { matched: 5, updated: 2, conflicts: 0, errors: 0, missingInZotero: 0, missingInVault: 0 },
        running: false, lastError: null,
      } }),
    );
    let syncCalls = 0;
    await page.route(/\/api\/zotero\/sync\/run/, (route) => {
      syncCalls += 1;
      if (syncCalls === 1) return route.fulfill({ json: { stats: {}, actions: [], startedAt: '', finishedAt: '', durationMs: 100 } });
      return route.fulfill({ status: 409, json: { error: 'Sync already in progress' } });
    });

    await page.goto('/zotero');

    const bar = page.getByText(/Vault sync|مزامنة Vault/);
    await expect(bar).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/matched 5|طوبق 5/).first()).toBeVisible();

    await page.getByRole('button', { name: /Sync now|زامِن الآن/ }).click();
    await expect.poll(() => syncCalls).toBeGreaterThanOrEqual(1);
  });
});
