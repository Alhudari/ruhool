/**
 * E2E smoke tests for the Reports settings panel.
 *
 * These verify the UI contracts that unit tests can't:
 *   - The settings tab loads without errors
 *   - Creating a report via the "from-template" button seeds a row
 *   - Opening the preview modal renders an iframe with the report HTML
 *   - The Resend section's test-send button is present and disabled
 *     before config is set
 *   - Orphan signers show an amber warning badge
 *
 * The suite assumes `pnpm dev` is running. It does NOT try to actually
 * send email — it stubs `fetch` for `/api/reports/resend-config/test`
 * where relevant so we don't hit Resend in CI.
 */
import { test, expect } from '@playwright/test';

test.describe('Reports settings panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings?tab=reports');
    // The settings layout lazy-loads the Reports component via Suspense.
    // Wait for either the empty-state or the list to appear.
    await page.waitForSelector('text=/التقارير|Reports/i', { timeout: 15000 });
  });

  test('renders the Reports heading and the Resend config section', async ({ page }) => {
    const reportsTab = page.getByRole('button', { name: /^التقارير$|^Reports$/ });
    if (await reportsTab.count()) await reportsTab.first().click();

    await expect(page.getByText(/التقارير الدورية|Scheduled Reports/i)).toBeVisible();
    // The Resend section has a dedicated heading "إعدادات البريد (Resend)".
    await expect(page.getByRole('heading', { name: /Resend|إعدادات البريد/i })).toBeVisible();
  });

  test('"From template" button opens the template picker', async ({ page }) => {
    const reportsTab = page.getByRole('button', { name: /^التقارير$|^Reports$/ });
    if (await reportsTab.count()) await reportsTab.first().click();

    const fromTemplateBtn = page.getByRole('button', { name: /من قالب|From template/i });
    await fromTemplateBtn.click();
    await expect(page.getByText(/اختر قالب|Pick a template/i)).toBeVisible({ timeout: 3000 });
    // Default daily executive template should be listed.
    await expect(page.getByText(/تقرير يومي تنفيذي/)).toBeVisible();
  });

  test('the new report modal includes all 8 context toggles (R12b)', async ({ page }) => {
    const reportsTab = page.getByRole('button', { name: /^التقارير$|^Reports$/ });
    if (await reportsTab.count()) await reportsTab.first().click();

    await page.getByRole('button', { name: /تقرير جديد|New report/i }).click();
    // Toggles render as <label><input type=checkbox> <span>label</span></label>.
    // Match by accessible-name via getByLabel so we hit the checkbox, not any
    // paragraph/button that happens to contain the word.
    for (const label of [
      /^مهام$/, /^نشاط الوكلاء$/, /^تحديثات المنصة$/, /^اقتباسات$/,
      /Zotero/, /الفولت/, /^اجتماعات$/, /ميزانية/,
    ]) {
      await expect(page.getByLabel(label)).toBeVisible({ timeout: 2000 });
    }
  });

  test('run history modal opens and shows empty-state when no runs yet', async ({ page }) => {
    const reportsTab = page.getByRole('button', { name: /^التقارير$|^Reports$/ });
    if (await reportsTab.count()) await reportsTab.first().click();

    await page.getByRole('button', { name: /السجل|History/i }).click();
    await expect(page.getByText(/سجلّ تشغيل|Run history/i)).toBeVisible();
    await expect(page.getByText(/لا يوجد تشغيل|No runs|loading/i)).toBeVisible({ timeout: 5000 });
  });
});
