// UX-11 — First paint with `html[lang="ar"]` when Arabic is selected.
// The I18N-03 middleware reads the `ruhool-lang` cookie server-side and the
// root layout uses that header to pick the initial <html lang dir>. This
// test asserts the raw HTML response (pre-hydration) already carries
// `lang="ar"` and `dir="rtl"` — eliminating the ~100ms client-boot FOUC.

import { test, expect } from '@playwright/test';

test('Arabic preference is reflected in initial SSR HTML', async ({
  request,
}) => {
  const res = await request.get('/', {
    headers: { cookie: 'ruhool-lang=ar' },
  });
  expect(res.ok()).toBeTruthy();
  const html = await res.text();
  // <html ... lang="ar" ... dir="rtl" ...> — order not guaranteed.
  expect(html).toMatch(/<html[^>]*\blang="ar"/);
  expect(html).toMatch(/<html[^>]*\bdir="rtl"/);
});

test('English preference is reflected in initial SSR HTML', async ({
  request,
}) => {
  const res = await request.get('/', {
    headers: { cookie: 'ruhool-lang=en' },
  });
  expect(res.ok()).toBeTruthy();
  const html = await res.text();
  expect(html).toMatch(/<html[^>]*\blang="en"/);
  expect(html).toMatch(/<html[^>]*\bdir="ltr"/);
});
