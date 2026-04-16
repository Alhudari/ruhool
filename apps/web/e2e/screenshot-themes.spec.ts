// DOC-06 — capture 3 themes x (light | dark) screenshots at `docs/screenshots/`.
// Runs only when the dev server is available. Invoke with:
//   pnpm --filter @ruhool/web exec playwright test e2e/screenshot-themes.spec.ts
// The resulting PNGs are committed to `docs/screenshots/` and linked from
// README.md. Placeholders may exist there if screenshots have not been run yet.

import { test } from '@playwright/test';
import path from 'node:path';

const THEMES = ['claude-clean', 'desert-caravan', 'academic'] as const;
const VARIANTS = ['light', 'dark'] as const;

for (const theme of THEMES) {
  for (const variant of VARIANTS) {
    test(`screenshot ${theme} ${variant}`, async ({ page }) => {
      // Preload localStorage so the boot script picks the right theme.
      await page.addInitScript(
        ([t, v]) => {
          try {
            localStorage.setItem('ruhool-theme', t);
            localStorage.setItem('ruhool-variant', v);
            localStorage.setItem('ruhool-language', 'en');
          } catch {}
        },
        [theme, variant],
      );
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const out = path.resolve(
        __dirname,
        `../../../docs/screenshots/${theme}-${variant}.png`,
      );
      await page.screenshot({ path: out, fullPage: false });
    });
  }
}
