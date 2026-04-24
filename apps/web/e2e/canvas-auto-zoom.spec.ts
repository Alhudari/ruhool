import { test, expect } from '@playwright/test';

test.describe('Canvas — auto-zoom-to-fit', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/canvas$/, (r) =>
      r.fulfill({ json: { canvases: [{ name: 'default', filename: 'default.canvas', mtime: Date.now() }] } }),
    );
    await page.route(/\/api\/canvas\/.+$/, async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { nodes: [], edges: [] } });
      if (route.request().method() === 'PUT') return route.fulfill({ json: { ok: true } });
      return route.continue();
    });
  });

  test('fit-to-content button exists in toolbar', async ({ page }) => {
    await page.goto('/canvas');
    const fitBtn = page.getByRole('button', { name: /Fit to content|املأ الشاشة/ });
    await expect(fitBtn).toBeVisible();
  });
});
