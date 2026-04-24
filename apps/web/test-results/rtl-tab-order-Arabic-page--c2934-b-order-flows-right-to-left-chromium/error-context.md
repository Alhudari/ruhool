# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rtl-tab-order.spec.ts >> Arabic page has rtl dir and nav tab order flows right-to-left
- Location: e2e\rtl-tab-order.spec.ts:11:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "rtl"
Received: "ltr"
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
              - generic [ref=e180]: :32
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
                - img "Ruhool" [ref=e227]
                - heading "Hello, Abdullah" [level=1] [ref=e228]
                - paragraph [ref=e229]: How can I help you today?
              - generic [ref=e231]:
                - textbox "Type your message here..." [ref=e232]
                - generic [ref=e233]:
                  - button [ref=e234] [cursor=pointer]:
                    - img [ref=e235]
                  - button [ref=e238] [cursor=pointer]:
                    - img [ref=e239]
                  - button [disabled] [ref=e242]:
                    - img [ref=e243]
              - button "Voice Mode" [ref=e247] [cursor=pointer]:
                - img [ref=e248]
                - text: Voice Mode
              - generic [ref=e250]:
                - paragraph [ref=e251]: Most Used Agents
                - generic [ref=e252]:
                  - button "Al-Ra'i (الراعي) The guide — leads the herd" [ref=e253] [cursor=pointer]:
                    - img [ref=e255]
                    - generic [ref=e257]:
                      - paragraph [ref=e258]: Al-Ra'i (الراعي)
                      - paragraph [ref=e259]: The guide — leads the herd
                  - button "Al-Bahith (الباحث) The bull — deep research" [ref=e260] [cursor=pointer]:
                    - img [ref=e262]
                    - generic [ref=e265]:
                      - paragraph [ref=e266]: Al-Bahith (الباحث)
                      - paragraph [ref=e267]: The bull — deep research
                  - button "Al-Mulakhkhis (المُلخِّص) Guided paper reading" [ref=e268] [cursor=pointer]:
                    - img [ref=e270]
                    - generic [ref=e272]:
                      - paragraph [ref=e273]: Al-Mulakhkhis (المُلخِّص)
                      - paragraph [ref=e274]: Guided paper reading
                  - button "Al-Naqid (الناقد) Critique your drafts" [ref=e275] [cursor=pointer]:
                    - img [ref=e277]
                    - generic [ref=e282]:
                      - paragraph [ref=e283]: Al-Naqid (الناقد)
                      - paragraph [ref=e284]: Critique your drafts
                - button "View All Agents" [ref=e286] [cursor=pointer]
              - generic [ref=e287]:
                - paragraph [ref=e288]: New capabilities
                - generic [ref=e289]:
                  - link "🎯 Runs" [ref=e290] [cursor=pointer]:
                    - /url: /runs
                    - generic [ref=e291]: 🎯
                    - generic [ref=e292]: Runs
                  - link "🧠 Memory" [ref=e293] [cursor=pointer]:
                    - /url: /memory
                    - generic [ref=e294]: 🧠
                    - generic [ref=e295]: Memory
                  - link "📄 Artifacts" [ref=e296] [cursor=pointer]:
                    - /url: /artifacts
                    - generic [ref=e297]: 📄
                    - generic [ref=e298]: Artifacts
                  - link "👁️ Watcher" [ref=e299] [cursor=pointer]:
                    - /url: /watcher
                    - generic [ref=e300]: 👁️
                    - generic [ref=e301]: Watcher
                  - link "📊 Evaluator" [ref=e302] [cursor=pointer]:
                    - /url: /evaluator
                    - generic [ref=e303]: 📊
                    - generic [ref=e304]: Evaluator
                  - link "⚡ Triggers" [ref=e305] [cursor=pointer]:
                    - /url: /triggers
                    - generic [ref=e306]: ⚡
                    - generic [ref=e307]: Triggers
                  - link "📚 Library" [ref=e308] [cursor=pointer]:
                    - /url: /library
                    - generic [ref=e309]: 📚
                    - generic [ref=e310]: Library
                  - link "📊 Analyst" [ref=e311] [cursor=pointer]:
                    - /url: /analyst
                    - generic [ref=e312]: 📊
                    - generic [ref=e313]: Analyst
          - button "Split screen (Ctrl+\\)" [ref=e317] [cursor=pointer]:
            - img [ref=e318]
      - complementary [ref=e320]:
        - generic [ref=e321]:
          - img [ref=e322]
          - heading "Active Tasks" [level=2] [ref=e325]
          - generic [ref=e326]: "0"
          - button "Collapse" [ref=e327] [cursor=pointer]:
            - img [ref=e328]
        - generic [ref=e330]:
          - generic [ref=e331]:
            - textbox "New task..." [ref=e332]
            - button [disabled] [ref=e333]:
              - img [ref=e334]
          - paragraph [ref=e335]: Hover a task to add a subtask
        - img [ref=e338]
        - link "— Open full tasks page →" [ref=e341] [cursor=pointer]:
          - /url: /tasks
  - alert [ref=e342]
  - button "Clippy — ask me anything" [ref=e344] [cursor=pointer]:
    - img [ref=e345]
```

# Test source

```ts
  1  | // UX-10 — Arabic tab order follows RTL visual flow.
  2  | // When `ruhool-lang=ar` cookie is set, middleware forces `dir="rtl"` at SSR
  3  | // and focusable elements should iterate from the right side of the screen to
  4  | // the left. We assert this by tabbing through the first N focusable elements
  5  | // and checking that their bounding-box x-centers monotonically decrease in
  6  | // the leading reading direction, or — equivalently — that the rightmost
  7  | // focusable precedes the leftmost in tab order.
  8  | 
  9  | import { test, expect } from '@playwright/test';
  10 | 
  11 | test('Arabic page has rtl dir and nav tab order flows right-to-left', async ({
  12 |   context,
  13 |   page,
  14 | }) => {
  15 |   await context.addCookies([
  16 |     { name: 'ruhool-lang', value: 'ar', url: 'http://localhost:3000' },
  17 |   ]);
  18 |   await page.goto('/');
  19 |   // Middleware should have set dir=rtl for SSR.
  20 |   const dir = await page.locator('html').getAttribute('dir');
> 21 |   expect(dir).toBe('rtl');
     |               ^ Error: expect(received).toBe(expected) // Object.is equality
  22 |   const lang = await page.locator('html').getAttribute('lang');
  23 |   expect(lang).toBe('ar');
  24 | 
  25 |   // Collect positions of top-level nav focusables in tab order.
  26 |   const focusables = await page
  27 |     .locator('nav a, nav button, header a, header button')
  28 |     .all();
  29 |   const positions: number[] = [];
  30 |   for (const f of focusables.slice(0, 8)) {
  31 |     const box = await f.boundingBox();
  32 |     if (box) positions.push(box.x + box.width / 2);
  33 |   }
  34 |   expect(positions.length).toBeGreaterThan(1);
  35 |   // The first focusable (document-tab-order-wise) should sit to the right of
  36 |   // the last one we examined — i.e., x(first) > x(last).
  37 |   expect(positions[0]).toBeGreaterThan(positions[positions.length - 1]);
  38 | });
  39 | 
```