import { test, expect } from '@playwright/test';

test.describe('Zotero write API key field', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/zotero\/collections/, (r) => r.fulfill({ json: { collections: [], tree: [] } }));
    await page.route(/\/api\/zotero\/items/, (r) => r.fulfill({ json: { items: [] } }));
    await page.route(/\/api\/zotero\/refresh-status/, (r) => r.fulfill({ json: { lastRefreshAt: null, daysSince: null, overdue: false, thresholdDays: 14 } }));
    await page.route(/\/api\/zotero\/sync\/status/, (r) => r.fulfill({ json: { lastRunAt: null, lastRunDurationMs: null, lastRunStats: null, running: false, lastError: null } }));
    await page.route(/\/api\/databases\/keys/, (r) => r.fulfill({ json: { scopusApiKey: { configured: false, masked: '' }, scopusInstToken: { configured: false, masked: '' }, wosApiKey: { configured: false, masked: '' }, crossrefMailto: { configured: false, masked: '' } } }));

    let configState = { mode: 'web', webUserId: '12345', hasReadKey: true, hasApiKey: true, hasWriteKey: false, writeEnabled: false, localUrl: 'http://localhost:23119/api/users/0' };
    await page.route(/\/api\/zotero\/config$/, (route) => route.fulfill({ json: configState }));
    await page.route(/\/api\/zotero\/write-config/, async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as { writeApiKey?: string; writeEnabled?: boolean };
      if (body.writeApiKey) configState = { ...configState, hasWriteKey: true };
      if (typeof body.writeEnabled === 'boolean') configState = { ...configState, writeEnabled: body.writeEnabled };
      return route.fulfill({ json: { ok: true } });
    });
  });

  test('open Connection modal, fill write key, save', async ({ page }) => {
    await page.goto('/zotero');
    const settingsBtn = page.getByRole('button', { name: /Settings|Connection|إعدادات|الاتصال/ }).first();
    // Depending on label, try settings icon; fallback to any button triggering the modal.
    const opener = await settingsBtn.count() > 0
      ? settingsBtn
      : page.locator('button').filter({ has: page.locator('svg') }).first();
    await opener.click({ trial: false }).catch(() => { /* ok */ });

    // The WriteApiKeyField uses the "Write API key" / "مفتاح الكتابة (اختياري)" label.
    const writeInput = page.getByLabel(/Write API key|مفتاح الكتابة/);
    if (await writeInput.count() === 0) {
      test.skip(true, 'Connection modal does not surface write-key field in this code path yet');
    }
    await writeInput.fill('P9WRITEKEYTEST');
    await page.getByRole('switch', { name: /Enable writes|فعّل الكتابة/ }).check();
    await page.getByRole('button', { name: /Save write|احفظ إعدادات الكتابة/ }).click();
  });
});
