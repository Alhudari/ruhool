import { test, expect } from '@playwright/test';

test('workflow runs page renders and plan dialog opens/closes', async ({ page }) => {
  await page.goto('/workflow-runs');

  // Title appears (AR or EN).
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toBeVisible();
  const titleText = (await title.textContent())?.trim() || '';
  expect(titleText === 'Workflow Runs' || titleText === 'مسارات العمل').toBeTruthy();

  // Click "New run" — matches either AR or EN label.
  const newBtn = page.getByRole('button', { name: /New run|مسار جديد/ });
  await newBtn.click();

  // Dialog opens.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Close with Escape.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
