import { test, expect } from '@playwright/test';

/**
 * Guarded-nav smoke. When a settings form is dirty and the user tries to
 * navigate (via any <a> link — the sidebar's Home link is a reliable
 * target), the guard must fire. We accept either the React modal from
 * GuardedNavProvider OR the layer-3 native `confirm()` fallback.
 */

const MOCK = [{
  id: 'research', moduleId: 'research-agent',
  name: { en: 'Abdan', ar: 'عبدان' },
  description: { en: 'deep research', ar: 'بحث عميق' },
  icon: 'search', color: 'purple', builtIn: true,
}];

test.use({ viewport: { width: 1280, height: 900 } });

test.describe('useGuardedRouter / useUnsavedChanges', () => {
  test('dirty form blocks nav via guard', async ({ page }) => {
    await page.route(/\/api\/agents(\?|$)/, (route) => route.fulfill({ json: MOCK }));
    await page.route(/\/api\/agents\/.+\/name$/, (route) => route.fulfill({ json: { ok: true } }));

    // Intercept window.confirm so the layer-3 native path still resolves
    // without actually navigating (we return false = cancel).
    await page.addInitScript(() => {
      (window as unknown as { __confirmSeen?: string[] }).__confirmSeen = [];
      window.confirm = (msg?: string) => {
        ((window as unknown as { __confirmSeen?: string[] }).__confirmSeen ?? []).push(msg ?? '');
        return false;
      };
    });

    await page.goto('/settings');
    await page.getByRole('button', { name: /Agent Names|أسماء الوكلاء/ }).click();

    const input = page.locator('input[dir="ltr"]').first();
    await expect(input).toBeVisible();
    await input.fill('Abdan (edited)');

    // Find any sidebar anchor pointing to a different route.
    const anchors = page.locator('a[href]');
    const count = await anchors.count();
    let clicked = false;
    for (let i = 0; i < count; i += 1) {
      const href = await anchors.nth(i).getAttribute('href');
      if (href && href !== '/settings' && !href.startsWith('#') && !href.startsWith('http')) {
        await anchors.nth(i).click({ force: true, timeout: 3000 }).catch(() => { /* ok */ });
        clicked = true;
        break;
      }
    }
    expect(clicked).toBeTruthy();

    // Accept either path: React dialog OR captured native confirm message.
    const dialog = page.getByRole('dialog', { name: /Unsaved changes|تغييرات غير محفوظة/ });
    const dialogSeen = (await dialog.count()) > 0;
    const confirmSeen = await page.evaluate(() =>
      ((window as unknown as { __confirmSeen?: string[] }).__confirmSeen ?? []).length > 0,
    );
    expect(dialogSeen || confirmSeen).toBeTruthy();
  });
});
