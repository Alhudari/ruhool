import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Lightweight perf capture using the browser's Performance API. Records
 * LCP, CLS proxy, and paint timings for the 4 key Round 1 pages, then
 * writes the markdown table into docs/round-1/perf-baselines.md.
 *
 * Not a replacement for Lighthouse CI — that lands in Round 3. This is a
 * reproducible number we can diff between rounds without external tooling.
 */

interface PerfSample {
  url: string;
  lcpMs: number | null;
  fcpMs: number | null;
  domContentLoadedMs: number | null;
  cls: number | null;
  transferKB: number;
}

const TARGETS: { url: string; label: string; setup?: (page: import('@playwright/test').Page) => Promise<void> }[] = [
  {
    url: '/audit',
    label: '/audit',
    setup: async (page) => {
      await page.route(/\/api\/audit-log\/sources/, (r) => r.fulfill({ json: { sources: [] } }));
      await page.route(/\/api\/audit-log(\?|$)/, (r) => r.fulfill({ json: { entries: [], nextCursor: null, totalBytes: 0 } }));
    },
  },
  {
    url: '/zotero',
    label: '/zotero',
    setup: async (page) => {
      await page.route(/\/api\/zotero\/collections/, (r) => r.fulfill({ json: { collections: [], tree: [] } }));
      await page.route(/\/api\/zotero\/items/, (r) => r.fulfill({ json: { items: [] } }));
      await page.route(/\/api\/zotero\/refresh-status/, (r) => r.fulfill({ json: { lastRefreshAt: null, daysSince: null, overdue: false, thresholdDays: 14 } }));
      await page.route(/\/api\/zotero\/sync\/status/, (r) => r.fulfill({ json: { lastRunAt: null, lastRunDurationMs: null, lastRunStats: null, running: false, lastError: null } }));
    },
  },
  {
    url: '/agents',
    label: '/agents',
    setup: async (page) => {
      await page.route(/\/api\/agents(\?|$)/, (r) => r.fulfill({ json: [] }));
    },
  },
  {
    url: '/settings',
    label: '/settings (agent-names tab)',
    setup: async (page) => {
      await page.route(/\/api\/agents(\?|$)/, (r) => r.fulfill({ json: [] }));
    },
  },
];

async function capture(page: import('@playwright/test').Page, url: string): Promise<Omit<PerfSample, 'url'>> {
  // LCP only fires when the observer is installed before the page renders;
  // install it on every fresh document via init script.
  await page.addInitScript(() => {
    (window as unknown as { __lcp?: number }).__lcp = 0;
    try {
      const po = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const e of entries) {
          const w = window as unknown as { __lcp?: number };
          w.__lcp = Math.max(w.__lcp ?? 0, (e as PerformanceEntry).startTime);
        }
      });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch { /* observer unsupported */ }
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  // Give LCP candidate selection time to settle.
  await page.waitForTimeout(1000);
  // Nudge a user interaction so LCP finalizes.
  await page.evaluate(() => window.dispatchEvent(new Event('click')));
  await page.waitForTimeout(200);

  const nav = await page.evaluate<Omit<PerfSample, 'url'>>(() => {
    const perf = performance;
    const navEntry = perf.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const paints = perf.getEntriesByType('paint');
    const fcp = paints.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null;

    const recordedLcp = (window as unknown as { __lcp?: number }).__lcp ?? 0;
    const lcp = recordedLcp > 0 ? recordedLcp : null;

    const clsEntries = perf.getEntriesByType('layout-shift') as (PerformanceEntry & { value?: number; hadRecentInput?: boolean })[];
    const cls = clsEntries
      .filter((e) => !e.hadRecentInput)
      .reduce((acc, e) => acc + (e.value ?? 0), 0);

    const transferKB = navEntry ? Math.round((navEntry.transferSize ?? 0) / 1024) : 0;

    return {
      lcpMs: lcp == null ? null : Math.round(lcp),
      fcpMs: fcp == null ? null : Math.round(fcp),
      domContentLoadedMs: navEntry ? Math.round(navEntry.domContentLoadedEventEnd) : null,
      cls: Number.isFinite(cls) ? Number(cls.toFixed(3)) : null,
      transferKB,
    };
  });

  return nav;
}

test.describe.configure({ mode: 'serial' });

test('capture perf baselines and write report', async ({ page }) => {
  const samples: PerfSample[] = [];
  for (const t of TARGETS) {
    if (t.setup) await t.setup(page);
    const s = await capture(page, t.url);
    samples.push({ url: t.label, ...s });
  }

  // Write the markdown report.
  const lines: string[] = [
    '# Round 1 — performance baselines (auto-captured)',
    '',
    `Captured ${new Date().toISOString()} via \`apps/web/e2e/perf-baseline.spec.ts\` on the dev build.`,
    'These are the floor numbers Round 2 and 3 must not regress (see thresholds at the end).',
    '',
    '## Numbers',
    '',
    '| URL | LCP (ms) | FCP (ms) | DCL (ms) | CLS | Transfer (kB) |',
    '|-----|----------|----------|----------|-----|---------------|',
  ];
  for (const s of samples) {
    lines.push(`| ${s.url} | ${s.lcpMs ?? '—'} | ${s.fcpMs ?? '—'} | ${s.domContentLoadedMs ?? '—'} | ${s.cls ?? '—'} | ${s.transferKB} |`);
  }
  lines.push(
    '',
    '## Thresholds',
    '',
    '- **LCP**: Round 2/3 may add up to +15% before flagging.',
    '- **CLS**: Round 2/3 must not push above **0.1** on any URL.',
    '- **Transfer**: bundle-size regressions > 20% flagged.',
    '',
    '## Notes',
    '',
    '- Dev build; production numbers will be better.',
    '- LCP on a fully-mocked page can be very fast because there\'s no real',
    '  data work. Re-run after integration Rounds 2/3 to re-baseline.',
    '- Re-run: `pnpm --filter @ruhool/web exec playwright test e2e/perf-baseline.spec.ts`',
    '',
  );

  const outPath = path.resolve(__dirname, '..', '..', '..', 'docs', 'round-1', 'perf-baselines.md');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');

  // Sanity assertions so the test fails loudly if a page errors hard.
  for (const s of samples) {
    expect(s.fcpMs ?? 0).toBeGreaterThan(0);
    expect(s.cls ?? 0).toBeLessThan(0.25);
  }
});
