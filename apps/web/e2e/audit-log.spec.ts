import { test, expect } from '@playwright/test';

/**
 * /audit — smoke test.
 * Mocks /api/audit-log so the test doesn't depend on real audit entries.
 */

const MOCK_ENTRIES = [
  { ts: '2026-04-22T10:00:00.000Z', action: 'zotero.sync.run', source: 'platform:user' },
  { ts: '2026-04-22T09:59:00.000Z', action: 'zotero.sync.complete', source: 'worker:zotero-vault-sync' },
  { ts: '2026-04-22T09:00:00.000Z', action: 'note.create', source: 'platform:Rumman', path: '01 PhD/note.md' },
];

test.describe('/audit', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/audit-log\/sources/, (route) =>
      route.fulfill({ json: { sources: ['platform:user', 'worker:zotero-vault-sync', 'platform:Rumman'] } }),
    );
    await page.route(/\/api\/audit-log(\?|$)/, (route) => {
      const url = new URL(route.request().url());
      const prefix = url.searchParams.get('prefix') ?? '';
      const entries = MOCK_ENTRIES.filter((e) => !prefix || e.action.startsWith(prefix));
      return route.fulfill({ json: { entries, nextCursor: null, totalBytes: 0 } });
    });
  });

  test('renders rows, filter narrows results', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.getByRole('heading', { name: /Audit Log|سجلّ التدقيق/ })).toBeVisible();
    // Three rows initially
    await expect(page.getByText('zotero.sync.run').first()).toBeVisible();
    await expect(page.getByText('note.create').first()).toBeVisible();

    // Filter to just zotero.sync.*
    await page.getByLabel(/Action prefix|بادئة الإجراء/).fill('zotero.sync');
    await expect(page.getByText('note.create')).toHaveCount(0);
    await expect(page.getByText('zotero.sync.run').first()).toBeVisible();
  });

  test('empty state when no entries', async ({ page }) => {
    await page.route(/\/api\/audit-log(\?|$)/, (route) =>
      route.fulfill({ json: { entries: [], nextCursor: null, totalBytes: 0 } }),
    );
    await page.goto('/audit');
    await expect(page.getByText(/No entries yet|لا توجد سجلات بعد/)).toBeVisible();
  });
});
