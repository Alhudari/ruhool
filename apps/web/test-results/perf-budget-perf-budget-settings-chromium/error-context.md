# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: perf-budget.spec.ts >> perf budget: /settings
- Location: e2e\perf-budget.spec.ts:82:7

# Error details

```
Error: LCP on /settings

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 3500
Received:    11860
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e4]:
      - generic [ref=e5]:
        - img "Ruhool" [ref=e7]
        - generic [ref=e8]: Ruhool
        - button "Collapse sidebar" [ref=e9] [cursor=pointer]:
          - img [ref=e10]
      - button "Switch workspace" [ref=e14] [cursor=pointer]:
        - img [ref=e15]
        - generic [ref=e18]: PhD
        - img [ref=e19]
      - button "New Chat" [ref=e22] [cursor=pointer]:
        - img [ref=e23]
        - text: New Chat
      - button "PhD Research" [ref=e25] [cursor=pointer]:
        - img [ref=e26]
        - generic [ref=e29]: PhD Research
        - img [ref=e30]
      - navigation [ref=e32]:
        - link "Home" [ref=e33] [cursor=pointer]:
          - /url: /
          - img [ref=e35]
          - generic [ref=e38]: Home
        - link "Dashboard" [ref=e39] [cursor=pointer]:
          - /url: /dashboard
          - img [ref=e41]
          - generic [ref=e46]: Dashboard
        - link "Tasks" [ref=e47] [cursor=pointer]:
          - /url: /tasks
          - img [ref=e49]
          - generic [ref=e52]: Tasks
        - link "Quick Notes" [ref=e53] [cursor=pointer]:
          - /url: /notes-keep
          - img [ref=e55]
          - generic [ref=e58]: Quick Notes
        - link "Notifications" [ref=e59] [cursor=pointer]:
          - /url: /notifications
          - img [ref=e61]
          - generic [ref=e64]: Notifications
        - generic [ref=e66]:
          - paragraph [ref=e67]: Today
          - generic [ref=e68]:
            - link "PhD Dashboard" [ref=e69] [cursor=pointer]:
              - /url: /phd
              - img [ref=e71]
              - generic [ref=e74]: PhD Dashboard
            - link "Al-Khuwy" [ref=e75] [cursor=pointer]:
              - /url: /companion
              - img [ref=e77]
              - generic [ref=e80]: Al-Khuwy
            - link "Inbox" [ref=e81] [cursor=pointer]:
              - /url: /inbox
              - img [ref=e83]
              - generic [ref=e86]: Inbox
            - link "Smart Search" [ref=e87] [cursor=pointer]:
              - /url: /search
              - img [ref=e89]
              - generic [ref=e91]: Smart Search
        - generic [ref=e92]:
          - paragraph [ref=e93]: Sources & Reading
          - generic [ref=e94]:
            - link "Sources Hub" [ref=e95] [cursor=pointer]:
              - /url: /sources
              - img [ref=e97]
              - generic [ref=e100]: Sources Hub
            - link "Zotero" [ref=e101] [cursor=pointer]:
              - /url: /zotero
              - img [ref=e103]
              - generic [ref=e105]: Zotero
            - link "Reading Queue" [ref=e106] [cursor=pointer]:
              - /url: /reading-queue
              - img [ref=e108]
              - generic [ref=e110]: Reading Queue
            - link "Reading" [ref=e111] [cursor=pointer]:
              - /url: /shwasha
              - img [ref=e113]
              - generic [ref=e115]: Reading
            - link "Papers" [ref=e116] [cursor=pointer]:
              - /url: /papers
              - img [ref=e118]
              - generic [ref=e120]: Papers
            - link "Knowledge" [ref=e121] [cursor=pointer]:
              - /url: /graph
              - img [ref=e123]
              - generic [ref=e128]: Knowledge
        - generic [ref=e129]:
          - paragraph [ref=e130]: Writing
          - generic [ref=e131]:
            - link "Atomic Notes" [ref=e132] [cursor=pointer]:
              - /url: /notes
              - img [ref=e134]
              - generic [ref=e137]: Atomic Notes
            - link "Al-Mudawwin" [ref=e138] [cursor=pointer]:
              - /url: /mudawwin
              - img [ref=e140]
              - generic [ref=e143]: Al-Mudawwin
            - link "Canvas" [ref=e144] [cursor=pointer]:
              - /url: /canvas
              - img [ref=e146]
              - generic [ref=e151]: Canvas
        - generic [ref=e152]:
          - paragraph [ref=e153]: Supervision
          - generic [ref=e154]:
            - link "Supervision" [ref=e155] [cursor=pointer]:
              - /url: /supervision
              - img [ref=e157]
              - generic [ref=e160]: Supervision
            - link "Meetings" [ref=e161] [cursor=pointer]:
              - /url: /meetings
              - img [ref=e163]
              - generic [ref=e165]: Meetings
    - generic [ref=e167]:
      - main [ref=e168]:
        - generic [ref=e169]:
          - button "Switch workspace" [ref=e171] [cursor=pointer]:
            - img [ref=e172]
            - generic [ref=e175]: PhD
            - img [ref=e176]
          - generic [ref=e178]:
            - generic [ref=e179]:
              - text: 12:00
              - generic [ref=e180]: :51
              - text: AM
            - generic [ref=e181]: Fri · 24 Apr
          - button "Search... K" [ref=e182] [cursor=pointer]:
            - img [ref=e183]
            - generic [ref=e186]: Search...
            - generic [ref=e187]:
              - img [ref=e188]
              - text: K
          - button "EN" [ref=e190] [cursor=pointer]:
            - img [ref=e191]
            - generic [ref=e195]: EN
          - generic [ref=e196]:
            - button "Light" [ref=e197] [cursor=pointer]:
              - img [ref=e198]
            - button "Dark" [ref=e204] [cursor=pointer]:
              - img [ref=e205]
          - button "Theme 1" [ref=e208] [cursor=pointer]:
            - img [ref=e209]
            - generic [ref=e215]: Theme 1
          - button "notifications" [ref=e218] [cursor=pointer]:
            - img [ref=e219]
        - generic [ref=e222]:
          - main [ref=e223]:
            - generic [ref=e224]:
              - generic [ref=e225]:
                - img [ref=e226]
                - heading "Settings" [level=1] [ref=e229]
              - navigation [ref=e231]:
                - button "API Providers" [ref=e232] [cursor=pointer]:
                  - img [ref=e233]
                  - text: API Providers
                - button "External Services" [ref=e237] [cursor=pointer]:
                  - img [ref=e238]
                  - text: External Services
                - button "Google Tasks" [ref=e241] [cursor=pointer]:
                  - img [ref=e242]
                  - text: Google Tasks
                - button "Reports" [ref=e245] [cursor=pointer]:
                  - img [ref=e246]
                  - text: Reports
                - button "Agent Names" [ref=e249] [cursor=pointer]:
                  - img [ref=e250]
                  - text: Agent Names
                - button "Al-Mulakhkhis" [ref=e255] [cursor=pointer]:
                  - img [ref=e256]
                  - text: Al-Mulakhkhis
                - button "Prompts Library" [ref=e258] [cursor=pointer]:
                  - img [ref=e259]
                  - text: Prompts Library
                - button "Approval Level" [ref=e262] [cursor=pointer]:
                  - img [ref=e263]
                  - text: Approval Level
                - button "Appearance" [ref=e266] [cursor=pointer]:
                  - img [ref=e267]
                  - text: Appearance
                - button "Language" [ref=e273] [cursor=pointer]:
                  - img [ref=e274]
                  - text: Language
                - button "Time Zones" [ref=e278] [cursor=pointer]:
                  - img [ref=e279]
                  - text: Time Zones
                - button "Voice" [ref=e282] [cursor=pointer]:
                  - img [ref=e283]
                  - text: Voice
                - button "My Voice" [ref=e286] [cursor=pointer]:
                  - img [ref=e287]
                  - text: My Voice
                - button "Tasks & Notes" [ref=e291] [cursor=pointer]:
                  - img [ref=e292]
                  - text: Tasks & Notes
                - button "Budget" [ref=e295] [cursor=pointer]:
                  - img [ref=e296]
                  - text: Budget
                - button "Notifications" [ref=e298] [cursor=pointer]:
                  - img [ref=e299]
                  - text: Notifications
                - button "Agent Notifications" [ref=e302] [cursor=pointer]:
                  - img [ref=e303]
                  - text: Agent Notifications
                - button "Privacy" [ref=e306] [cursor=pointer]:
                  - img [ref=e307]
                  - text: Privacy
                - button "Backups" [ref=e309] [cursor=pointer]:
                  - img [ref=e310]
                  - text: Backups
          - button "Split screen (Ctrl+\\)" [ref=e335] [cursor=pointer]:
            - img [ref=e336]
      - complementary [ref=e338]:
        - generic [ref=e339]:
          - img [ref=e340]
          - heading "Active Tasks" [level=2] [ref=e343]
          - generic [ref=e344]: "0"
          - button "Collapse" [ref=e345] [cursor=pointer]:
            - img [ref=e346]
        - generic [ref=e348]:
          - generic [ref=e349]:
            - textbox "New task..." [ref=e350]
            - button [disabled] [ref=e351]:
              - img [ref=e352]
          - paragraph [ref=e353]: Hover a task to add a subtask
        - img [ref=e356]
        - link "— Open full tasks page →" [ref=e359] [cursor=pointer]:
          - /url: /tasks
  - alert [ref=e360]
  - button "Clippy — ask me anything" [ref=e362] [cursor=pointer]:
    - img [ref=e363]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * Lighthouse-light perf budget gate. Replaces full Lighthouse CI — runs
  5  |  * on the same Playwright harness so there's zero extra infra cost.
  6  |  *
  7  |  * Thresholds chosen to be generous on a dev build and still catch
  8  |  * regressions > Round 3 baselines.
  9  |  */
  10 | 
  11 | interface Metrics { lcp: number | null; fcp: number | null; cls: number | null }
  12 | 
  13 | const TARGETS: Array<{ url: string; name: string; lcpMax: number; fcpMax: number; clsMax: number; setup?: (p: import('@playwright/test').Page) => Promise<void> }> = [
  14 |   {
  15 |     url: '/audit',
  16 |     name: '/audit',
  17 |     lcpMax: 3500,
  18 |     fcpMax: 2500,
  19 |     clsMax: 0.1,
  20 |     setup: async (page) => {
  21 |       await page.route(/\/api\/audit-log\/sources/, (r) => r.fulfill({ json: { sources: [] } }));
  22 |       await page.route(/\/api\/audit-log(\?|$)/, (r) => r.fulfill({ json: { entries: [], nextCursor: null, totalBytes: 0 } }));
  23 |     },
  24 |   },
  25 |   {
  26 |     url: '/agents',
  27 |     name: '/agents',
  28 |     lcpMax: 3500,
  29 |     fcpMax: 2500,
  30 |     clsMax: 0.1,
  31 |     setup: async (page) => {
  32 |       await page.route(/\/api\/agents(\?|$)/, (r) => r.fulfill({ json: [] }));
  33 |       await page.route(/\/api\/agent-org$/, (r) => r.fulfill({ status: 404, json: { error: 'not configured' } }));
  34 |     },
  35 |   },
  36 |   {
  37 |     url: '/settings',
  38 |     name: '/settings',
  39 |     lcpMax: 3500,
  40 |     fcpMax: 2500,
  41 |     clsMax: 0.1,
  42 |     setup: async (page) => {
  43 |       await page.route(/\/api\/agents(\?|$)/, (r) => r.fulfill({ json: [] }));
  44 |     },
  45 |   },
  46 | ];
  47 | 
  48 | async function capture(page: import('@playwright/test').Page, url: string): Promise<Metrics> {
  49 |   await page.addInitScript(() => {
  50 |     (window as unknown as { __lcp?: number }).__lcp = 0;
  51 |     try {
  52 |       const po = new PerformanceObserver((list) => {
  53 |         for (const e of list.getEntries()) {
  54 |           const w = window as unknown as { __lcp?: number };
  55 |           w.__lcp = Math.max(w.__lcp ?? 0, (e as PerformanceEntry).startTime);
  56 |         }
  57 |       });
  58 |       po.observe({ type: 'largest-contentful-paint', buffered: true });
  59 |     } catch { /* noop */ }
  60 |   });
  61 |   await page.goto(url, { waitUntil: 'networkidle' });
  62 |   await page.waitForTimeout(800);
  63 |   await page.evaluate(() => window.dispatchEvent(new Event('click')));
  64 |   await page.waitForTimeout(200);
  65 | 
  66 |   return await page.evaluate<Metrics>(() => {
  67 |     const paints = performance.getEntriesByType('paint');
  68 |     const fcp = paints.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null;
  69 |     const recordedLcp = (window as unknown as { __lcp?: number }).__lcp ?? 0;
  70 |     const lcp = recordedLcp > 0 ? recordedLcp : null;
  71 |     const clsEntries = performance.getEntriesByType('layout-shift') as (PerformanceEntry & { value?: number; hadRecentInput?: boolean })[];
  72 |     const cls = clsEntries.filter((e) => !e.hadRecentInput).reduce((a, e) => a + (e.value ?? 0), 0);
  73 |     return {
  74 |       lcp: lcp == null ? null : Math.round(lcp),
  75 |       fcp: fcp == null ? null : Math.round(fcp),
  76 |       cls: Number.isFinite(cls) ? Number(cls.toFixed(3)) : null,
  77 |     };
  78 |   });
  79 | }
  80 | 
  81 | for (const t of TARGETS) {
  82 |   test(`perf budget: ${t.name}`, async ({ page }) => {
  83 |     if (t.setup) await t.setup(page);
  84 |     const m = await capture(page, t.url);
  85 |     test.info().annotations.push({ type: 'perf', description: `${t.name}: lcp=${m.lcp}ms fcp=${m.fcp}ms cls=${m.cls}` });
  86 | 
> 87 |     if (m.lcp != null) expect(m.lcp, `LCP on ${t.name}`).toBeLessThanOrEqual(t.lcpMax);
     |                                                          ^ Error: LCP on /settings
  88 |     if (m.fcp != null) expect(m.fcp, `FCP on ${t.name}`).toBeLessThanOrEqual(t.fcpMax);
  89 |     if (m.cls != null) expect(m.cls, `CLS on ${t.name}`).toBeLessThanOrEqual(t.clsMax);
  90 |   });
  91 | }
  92 | 
```