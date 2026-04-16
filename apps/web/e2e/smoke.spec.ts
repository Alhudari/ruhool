import { test, expect } from '@playwright/test';

test('home page renders and lang attribute present', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  // Expect html[lang] attribute to be defined (SSR ships 'en', client may flip).
  const lang = await page.locator('html').getAttribute('lang');
  expect(lang).toBeTruthy();
  expect(errors, `console errors: ${errors.join('\n')}`).toEqual([]);
});
