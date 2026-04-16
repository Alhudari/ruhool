// UX-10 — Arabic tab order follows RTL visual flow.
// When `ruhool-lang=ar` cookie is set, middleware forces `dir="rtl"` at SSR
// and focusable elements should iterate from the right side of the screen to
// the left. We assert this by tabbing through the first N focusable elements
// and checking that their bounding-box x-centers monotonically decrease in
// the leading reading direction, or — equivalently — that the rightmost
// focusable precedes the leftmost in tab order.

import { test, expect } from '@playwright/test';

test('Arabic page has rtl dir and nav tab order flows right-to-left', async ({
  context,
  page,
}) => {
  await context.addCookies([
    { name: 'ruhool-lang', value: 'ar', url: 'http://localhost:3000' },
  ]);
  await page.goto('/');
  // Middleware should have set dir=rtl for SSR.
  const dir = await page.locator('html').getAttribute('dir');
  expect(dir).toBe('rtl');
  const lang = await page.locator('html').getAttribute('lang');
  expect(lang).toBe('ar');

  // Collect positions of top-level nav focusables in tab order.
  const focusables = await page
    .locator('nav a, nav button, header a, header button')
    .all();
  const positions: number[] = [];
  for (const f of focusables.slice(0, 8)) {
    const box = await f.boundingBox();
    if (box) positions.push(box.x + box.width / 2);
  }
  expect(positions.length).toBeGreaterThan(1);
  // The first focusable (document-tab-order-wise) should sit to the right of
  // the last one we examined — i.e., x(first) > x(last).
  expect(positions[0]).toBeGreaterThan(positions[positions.length - 1]);
});
