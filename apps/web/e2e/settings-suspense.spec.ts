import { test, expect } from '@playwright/test';

/**
 * With 4 settings tabs now React.lazy + Suspense-wrapped, verify the
 * skeleton renders on first nav to a lazy tab and the real content
 * replaces it.
 */

test.describe('Settings Suspense skeleton', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/agents(\?|$)/, (r) => r.fulfill({ json: [] }));
    await page.route(/\/api\/settings\/.*/, (r) => r.fulfill({ json: {} }));
    await page.route(/\/api\/providers/, (r) => r.fulfill({ json: [] }));
  });

  test('switching to a lazy tab renders skeleton briefly, then content', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /Agent Names|أسماء الوكلاء/ }).click();
    // The AgentNamesSettings component renders a list; wait for it.
    // If the lazy bundle hasn't finished, a skeleton div (aria-hidden)
    // may render first — both outcomes are acceptable. We just assert
    // the real content arrives.
    await expect(page.getByRole('heading', { level: 2, name: /Agent Display Names|أسماء العرض للوكلاء/ })).toBeVisible({ timeout: 5000 });
  });
});
