import { test, expect } from '@playwright/test';

const MOCK_AGENTS = [
  { id: 'manager', moduleId: 'manager', name: { en: 'Al-Ra\'i', ar: 'الراعي' }, description: { en: 'CEO', ar: 'المدير' }, icon: 'compass', color: 'amber', builtIn: true },
  { id: 'research', moduleId: 'research-agent', name: { en: 'Abdan', ar: 'عبدان' }, description: { en: 'Research', ar: 'بحث' }, icon: 'search', color: 'purple', builtIn: true },
  { id: 'reading-helper', moduleId: 'reading-helper', name: { en: 'Shwasha', ar: 'شواشة' }, description: { en: 'Reading', ar: 'قراءة' }, icon: 'book-open', color: 'blue', builtIn: true },
];

const MOCK_ORG = {
  org: { version: 1, updatedAt: '2026-04-22', ceo: 'manager', departments: [
    { id: 'research', label: { ar: 'البحث', en: 'Research' }, manager: 'research', workers: ['reading-helper'] },
  ] },
  resolved: {
    ceo: { id: 'manager', name: { en: 'Al-Ra\'i', ar: 'الراعي' }, known: true },
    departments: [{
      id: 'research', label: { ar: 'البحث', en: 'Research' }, manager: 'research', workers: ['reading-helper'],
      managerName: { en: 'Abdan', ar: 'عبدان' }, managerKnown: true,
      workerNames: [{ id: 'reading-helper', name: { en: 'Shwasha', ar: 'شواشة' }, known: true }],
    }],
    unassigned: [],
  },
};

test.describe('/agents Org view', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/agents(\?|$)/, (route) => route.fulfill({ json: MOCK_AGENTS }));
    await page.route(/\/api\/agent-org$/, (route) => route.fulfill({ json: MOCK_ORG }));
  });

  test('toggle List/Org, expand dept, see workers', async ({ page }) => {
    await page.goto('/agents');
    await expect(page.getByRole('heading', { name: /Agents|الوكلاء/ })).toBeVisible();

    // Toggle to Org.
    await page.getByRole('button', { name: /Org|المؤسسة/ }).click();
    // CEO card visible.
    await expect(page.getByText(/Al-Ra'i|الراعي/).first()).toBeVisible();
    // Dept header visible.
    await expect(page.getByText(/Research|البحث/).first()).toBeVisible();
    // Worker visible (dept is default-expanded).
    await expect(page.getByText(/Shwasha|شواشة/).first()).toBeVisible();
  });

  test('unknown agent renders warning chip', async ({ page }) => {
    const bad = JSON.parse(JSON.stringify(MOCK_ORG));
    bad.resolved.departments[0].workers.push('nonexistent');
    bad.resolved.departments[0].workerNames.push({ id: 'nonexistent', name: null, known: false });
    bad.org.departments[0].workers.push('nonexistent');
    await page.route(/\/api\/agent-org$/, (route) => route.fulfill({ json: bad }));
    await page.goto('/agents');
    await page.getByRole('button', { name: /Org|المؤسسة/ }).click();
    await expect(page.getByText('nonexistent')).toBeVisible();
    await expect(page.getByText(/\(unknown\)|\(غير معروف\)/)).toBeVisible();
  });
});
