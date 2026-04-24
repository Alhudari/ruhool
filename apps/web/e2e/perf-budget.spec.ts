import { test, expect } from '@playwright/test';

/**
 * Lighthouse-light perf budget gate. Replaces full Lighthouse CI — runs
 * on the same Playwright harness so there's zero extra infra cost.
 *
 * Thresholds chosen to be generous on a dev build and still catch
 * regressions > Round 3 baselines.
 */

interface Metrics { lcp: number | null; fcp: number | null; cls: number | null }

const TARGETS: Array<{ url: string; name: string; lcpMax: number; fcpMax: number; clsMax: number; setup?: (p: import('@playwright/test').Page) => Promise<void> }> = [
  {
    url: '/audit',
    name: '/audit',
    lcpMax: 3500,
    fcpMax: 2500,
    clsMax: 0.1,
    setup: async (page) => {
      await page.route(/\/api\/audit-log\/sources/, (r) => r.fulfill({ json: { sources: [] } }));
      await page.route(/\/api\/audit-log(\?|$)/, (r) => r.fulfill({ json: { entries: [], nextCursor: null, totalBytes: 0 } }));
    },
  },
  {
    url: '/agents',
    name: '/agents',
    lcpMax: 3500,
    fcpMax: 2500,
    clsMax: 0.1,
    setup: async (page) => {
      await page.route(/\/api\/agents(\?|$)/, (r) => r.fulfill({ json: [] }));
      await page.route(/\/api\/agent-org$/, (r) => r.fulfill({ status: 404, json: { error: 'not configured' } }));
    },
  },
  {
    url: '/settings',
    name: '/settings',
    lcpMax: 3500,
    fcpMax: 2500,
    clsMax: 0.1,
    setup: async (page) => {
      await page.route(/\/api\/agents(\?|$)/, (r) => r.fulfill({ json: [] }));
    },
  },
];

async function capture(page: import('@playwright/test').Page, url: string): Promise<Metrics> {
  await page.addInitScript(() => {
    (window as unknown as { __lcp?: number }).__lcp = 0;
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const w = window as unknown as { __lcp?: number };
          w.__lcp = Math.max(w.__lcp ?? 0, (e as PerformanceEntry).startTime);
        }
      });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch { /* noop */ }
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.dispatchEvent(new Event('click')));
  await page.waitForTimeout(200);

  return await page.evaluate<Metrics>(() => {
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null;
    const recordedLcp = (window as unknown as { __lcp?: number }).__lcp ?? 0;
    const lcp = recordedLcp > 0 ? recordedLcp : null;
    const clsEntries = performance.getEntriesByType('layout-shift') as (PerformanceEntry & { value?: number; hadRecentInput?: boolean })[];
    const cls = clsEntries.filter((e) => !e.hadRecentInput).reduce((a, e) => a + (e.value ?? 0), 0);
    return {
      lcp: lcp == null ? null : Math.round(lcp),
      fcp: fcp == null ? null : Math.round(fcp),
      cls: Number.isFinite(cls) ? Number(cls.toFixed(3)) : null,
    };
  });
}

for (const t of TARGETS) {
  test(`perf budget: ${t.name}`, async ({ page }) => {
    if (t.setup) await t.setup(page);
    const m = await capture(page, t.url);
    test.info().annotations.push({ type: 'perf', description: `${t.name}: lcp=${m.lcp}ms fcp=${m.fcp}ms cls=${m.cls}` });

    if (m.lcp != null) expect(m.lcp, `LCP on ${t.name}`).toBeLessThanOrEqual(t.lcpMax);
    if (m.fcp != null) expect(m.fcp, `FCP on ${t.name}`).toBeLessThanOrEqual(t.fcpMax);
    if (m.cls != null) expect(m.cls, `CLS on ${t.name}`).toBeLessThanOrEqual(t.clsMax);
  });
}
