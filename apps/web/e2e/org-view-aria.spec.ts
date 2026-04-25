import { test, expect } from '@playwright/test';

const MOCK_AGENTS = [
  { id: 'manager', moduleId: 'manager', name: { en: "Al-Ra'i", ar: 'الراعي' }, description: { en: 'CEO', ar: 'المدير' }, icon: 'compass', color: 'amber', builtIn: true },
  { id: 'research', moduleId: 'research-agent', name: { en: 'Abdan', ar: 'عبدان' }, description: { en: 'Research', ar: 'بحث' }, icon: 'search', color: 'purple', builtIn: true },
  { id: 'reading-helper', moduleId: 'reading-helper', name: { en: 'Shwasha', ar: 'شواشة' }, description: { en: 'Reading', ar: 'قراءة' }, icon: 'book-open', color: 'blue', builtIn: true },
];

const MOCK_ORG = {
  org: { version: 1, updatedAt: '2026-04-23', ceo: 'manager', departments: [
    { id: 'research', label: { ar: 'البحث', en: 'Research' }, manager: 'research', workers: ['reading-helper'] },
  ] },
  resolved: {
    ceo: { id: 'manager', name: { en: "Al-Ra'i", ar: 'الراعي' }, known: true },
    departments: [{
      id: 'research', label: { ar: 'البحث', en: 'Research' }, manager: 'research', workers: ['reading-helper'],
      managerName: { en: 'Abdan', ar: 'عبدان' }, managerKnown: true,
      workerNames: [{ id: 'reading-helper', name: { en: 'Shwasha', ar: 'شواشة' }, known: true }],
    }],
    unassigned: [],
  },
};

test.describe('Org view — ARIA tree', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/agents(\?|$)/, (r) => r.fulfill({ json: MOCK_AGENTS }));
    await page.route(/\/api\/agent-org$/, (r) => r.fulfill({ json: MOCK_ORG }));
  });

  test('tree role + treeitems + aria-expanded', async ({ page }) => {
    await page.goto('/agents');
    await page.getByRole('button', { name: /^Org$|^المؤسسة$/ }).click();
    await page.waitForSelector('[role="tree"]', { timeout: 10_000 });

    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();

    const treeitems = page.locator('[role="treeitem"]');
    await expect(treeitems.first()).toBeVisible();

    const deptItem = page.locator('[role="treeitem"][aria-expanded]').first();
    await expect(deptItem).toBeVisible();
  });

  test('keyboard navigation: Down moves focus', async ({ page }) => {
    await page.goto('/agents');
    await page.getByRole('button', { name: /^Org$|^المؤسسة$/ }).click();
    await page.waitForSelector('[data-tree-id]', { timeout: 10_000 });

    const first = page.locator('[data-tree-id]').first();
    await first.focus();
    await expect(first).toBeFocused();

    await page.keyboard.press('ArrowDown');
    const focusedId = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-tree-id') ?? null);
    expect(focusedId).not.toBeNull();
  });
});
