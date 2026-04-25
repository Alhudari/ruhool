# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: perf-budget.spec.ts >> perf budget: /agents
- Location: e2e\perf-budget.spec.ts:82:7

# Error details

```
Error: LCP on /agents

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 3500
Received:    8072
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
        - generic [ref=e166]:
          - generic [ref=e167]:
            - paragraph [ref=e168]: Yesterday
            - generic [ref=e169]:
              - button "آخر الأخبار والتحديثات النظامية" [ref=e170] [cursor=pointer]:
                - img [ref=e171]
                - generic [ref=e173]: آخر الأخبار والتحديثات النظامية
              - button "More actions" [ref=e176] [cursor=pointer]:
                - img [ref=e177]
          - generic [ref=e181]:
            - paragraph [ref=e182]: This Week
            - generic [ref=e183]:
              - button "Al-Khuwy خطة تسريع البحث الدكتوراه" [ref=e184] [cursor=pointer]:
                - img [ref=e185]
                - generic [ref=e187]: Al-Khuwy
                - generic [ref=e188]: خطة تسريع البحث الدكتوراه
              - button "More actions" [ref=e191] [cursor=pointer]:
                - img [ref=e192]
            - generic [ref=e196]:
              - button "Al-Mudawwin بنود العمل المعلّقة وحالتها" [ref=e197] [cursor=pointer]:
                - img [ref=e198]
                - generic [ref=e200]: Al-Mudawwin
                - generic [ref=e201]: بنود العمل المعلّقة وحالتها
              - button "More actions" [ref=e204] [cursor=pointer]:
                - img [ref=e205]
            - generic [ref=e209]:
              - button "Al-Mudawwin استخدام المُدوّن لتنظيم الاجتماعات البحثية" [ref=e210] [cursor=pointer]:
                - img [ref=e211]
                - generic [ref=e213]: Al-Mudawwin
                - generic [ref=e214]: استخدام المُدوّن لتنظيم الاجتماعات البحثية
              - button "More actions" [ref=e217] [cursor=pointer]:
                - img [ref=e218]
            - generic [ref=e222]:
              - button "Al-Khuwy أنا مستعد لمساعدتك! لكن يبدو أنك لم تضع الفكرة السريعة الت" [ref=e223] [cursor=pointer]:
                - img [ref=e224]
                - generic [ref=e226]: Al-Khuwy
                - generic [ref=e227]: أنا مستعد لمساعدتك! لكن يبدو أنك لم تضع الفكرة السريعة الت
              - button "More actions" [ref=e230] [cursor=pointer]:
                - img [ref=e231]
            - generic [ref=e235]:
              - 'button "Al-Bahith ```json" [ref=e236] [cursor=pointer]':
                - img [ref=e237]
                - generic [ref=e239]: Al-Bahith
                - generic [ref=e240]: "```json"
              - button "More actions" [ref=e243] [cursor=pointer]:
                - img [ref=e244]
            - generic [ref=e248]:
              - 'button "Al-Khuwy # مهام اليوم الأول — 22 أبريل 2026" [ref=e249] [cursor=pointer]':
                - img [ref=e250]
                - generic [ref=e252]: Al-Khuwy
                - generic [ref=e253]: "# مهام اليوم الأول — 22 أبريل 2026"
              - button "More actions" [ref=e256] [cursor=pointer]:
                - img [ref=e257]
            - generic [ref=e261]:
              - button "Al-Khuwy استرجاع المهام المعلقة السابقة" [ref=e262] [cursor=pointer]:
                - img [ref=e263]
                - generic [ref=e265]: Al-Khuwy
                - generic [ref=e266]: استرجاع المهام المعلقة السابقة
              - button "More actions" [ref=e269] [cursor=pointer]:
                - img [ref=e270]
            - generic [ref=e274]:
              - button "Clippy Clippy Platform Assistant Introduction" [ref=e275] [cursor=pointer]:
                - img [ref=e276]
                - generic [ref=e278]: Clippy
                - generic [ref=e279]: Clippy Platform Assistant Introduction
              - button "More actions" [ref=e282] [cursor=pointer]:
                - img [ref=e283]
            - generic [ref=e287]:
              - button "Clippy الملاحظة الذرية وكيفية كتابتها" [ref=e288] [cursor=pointer]:
                - img [ref=e289]
                - generic [ref=e291]: Clippy
                - generic [ref=e292]: الملاحظة الذرية وكيفية كتابتها
              - button "More actions" [ref=e295] [cursor=pointer]:
                - img [ref=e296]
            - generic [ref=e300]:
              - button "Al-Khuwy بدء الدكتوراه والخطوات الأولى" [ref=e301] [cursor=pointer]:
                - img [ref=e302]
                - generic [ref=e304]: Al-Khuwy
                - generic [ref=e305]: بدء الدكتوراه والخطوات الأولى
              - button "More actions" [ref=e308] [cursor=pointer]:
                - img [ref=e309]
            - generic [ref=e313]:
              - button "Al-Khuwy بديت الدكتوراة 5-1-2026 لكن اعتبر اليوم الاول بادي من الصفر تقريبا شنو تنصح باختصار الخطوات ل5 ايام" [ref=e314] [cursor=pointer]:
                - img [ref=e315]
                - generic [ref=e317]: Al-Khuwy
                - generic [ref=e318]: بديت الدكتوراة 5-1-2026 لكن اعتبر اليوم الاول بادي من الصفر تقريبا شنو تنصح باختصار الخطوات ل5 ايام
              - button "More actions" [ref=e321] [cursor=pointer]:
                - img [ref=e322]
            - generic [ref=e326]:
              - button "Clippy مسار العمل والمميزات للدكتوراة" [ref=e327] [cursor=pointer]:
                - img [ref=e328]
                - generic [ref=e330]: Clippy
                - generic [ref=e331]: مسار العمل والمميزات للدكتوراة
              - button "More actions" [ref=e334] [cursor=pointer]:
                - img [ref=e335]
            - generic [ref=e339]:
              - button "Al-Khuwy خطة العمل لليوم الأول من الدكتوراه" [ref=e340] [cursor=pointer]:
                - img [ref=e341]
                - generic [ref=e343]: Al-Khuwy
                - generic [ref=e344]: خطة العمل لليوم الأول من الدكتوراه
              - button "More actions" [ref=e347] [cursor=pointer]:
                - img [ref=e348]
            - generic [ref=e352]:
              - button "Al-Khuwy خطة العمل لليوم الأول في BIM" [ref=e353] [cursor=pointer]:
                - img [ref=e354]
                - generic [ref=e356]: Al-Khuwy
                - generic [ref=e357]: خطة العمل لليوم الأول في BIM
              - button "More actions" [ref=e360] [cursor=pointer]:
                - img [ref=e361]
            - generic [ref=e365]:
              - 'button "Al-Khuwy # First Day PhD Research Planning" [ref=e366] [cursor=pointer]':
                - img [ref=e367]
                - generic [ref=e369]: Al-Khuwy
                - generic [ref=e370]: "# First Day PhD Research Planning"
              - button "More actions" [ref=e373] [cursor=pointer]:
                - img [ref=e374]
          - generic [ref=e378]:
            - paragraph [ref=e379]: Older
            - generic [ref=e380]:
              - button "إرسال تنبيه للمهام المهمة" [ref=e381] [cursor=pointer]:
                - img [ref=e382]
                - generic [ref=e384]: إرسال تنبيه للمهام المهمة
              - button "More actions" [ref=e387] [cursor=pointer]:
                - img [ref=e388]
            - generic [ref=e392]:
              - button "اختفاء المهام والتصنيفات من النظام" [ref=e393] [cursor=pointer]:
                - img [ref=e394]
                - generic [ref=e396]: اختفاء المهام والتصنيفات من النظام
              - button "More actions" [ref=e399] [cursor=pointer]:
                - img [ref=e400]
            - generic [ref=e404]:
              - button "وكيل إدارة المهام في منصة رحول" [ref=e405] [cursor=pointer]:
                - img [ref=e406]
                - generic [ref=e408]: وكيل إدارة المهام في منصة رحول
              - button "More actions" [ref=e411] [cursor=pointer]:
                - img [ref=e412]
            - generic [ref=e416]:
              - button "أدوات الذكاء الاصطناعي الحديثة والمتقدمة" [ref=e417] [cursor=pointer]:
                - img [ref=e418]
                - generic [ref=e420]: أدوات الذكاء الاصطناعي الحديثة والمتقدمة
              - button "More actions" [ref=e423] [cursor=pointer]:
                - img [ref=e424]
            - generic [ref=e428]:
              - button "الترحيب والخدمات المتاحة" [ref=e429] [cursor=pointer]:
                - img [ref=e430]
                - generic [ref=e432]: الترحيب والخدمات المتاحة
              - button "More actions" [ref=e435] [cursor=pointer]:
                - img [ref=e436]
            - generic [ref=e440]:
              - button "تعريف فريق رحول الأكاديمي وأدوارهم" [ref=e441] [cursor=pointer]:
                - img [ref=e442]
                - generic [ref=e444]: تعريف فريق رحول الأكاديمي وأدوارهم
              - button "More actions" [ref=e447] [cursor=pointer]:
                - img [ref=e448]
            - generic [ref=e452]:
              - button "تعريف فريق البحث الأكاديمي" [ref=e453] [cursor=pointer]:
                - img [ref=e454]
                - generic [ref=e456]: تعريف فريق البحث الأكاديمي
              - button "More actions" [ref=e459] [cursor=pointer]:
                - img [ref=e460]
            - generic [ref=e464]:
              - button "تحية ترحيب بسيطة" [ref=e465] [cursor=pointer]:
                - img [ref=e466]
                - generic [ref=e468]: تحية ترحيب بسيطة
              - button "More actions" [ref=e471] [cursor=pointer]:
                - img [ref=e472]
            - generic [ref=e476]:
              - button "تقديم الخدمات والمساعدة المتاحة" [ref=e477] [cursor=pointer]:
                - img [ref=e478]
                - generic [ref=e480]: تقديم الخدمات والمساعدة المتاحة
              - button "More actions" [ref=e483] [cursor=pointer]:
                - img [ref=e484]
            - generic [ref=e488]:
              - button "@الراعي مرحبا" [ref=e489] [cursor=pointer]:
                - img [ref=e490]
                - generic [ref=e492]: "@الراعي مرحبا"
              - button "More actions" [ref=e495] [cursor=pointer]:
                - img [ref=e496]
            - generic [ref=e500]:
              - button "@الراعي أوكل عبدان ببحث سريع عن BIM في الكويت" [ref=e501] [cursor=pointer]:
                - img [ref=e502]
                - generic [ref=e504]: "@الراعي أوكل عبدان ببحث سريع عن BIM في الكويت"
              - button "More actions" [ref=e507] [cursor=pointer]:
                - img [ref=e508]
            - generic [ref=e512]:
              - button "Al-Bahith @عبدان @شواشة عرّفوا نفسكم باختصار" [ref=e513] [cursor=pointer]:
                - img [ref=e514]
                - generic [ref=e516]: Al-Bahith
                - generic [ref=e517]: "@عبدان @شواشة عرّفوا نفسكم باختصار"
              - button "More actions" [ref=e520] [cursor=pointer]:
                - img [ref=e521]
            - generic [ref=e525]:
              - button "البحث عن BIM في الكويت" [ref=e526] [cursor=pointer]:
                - img [ref=e527]
                - generic [ref=e529]: البحث عن BIM في الكويت
              - button "More actions" [ref=e532] [cursor=pointer]:
                - img [ref=e533]
            - generic [ref=e537]:
              - button "Al-Bahith @عبدان @شواشة عرّفوا نفسكم باختصار" [ref=e538] [cursor=pointer]:
                - img [ref=e539]
                - generic [ref=e541]: Al-Bahith
                - generic [ref=e542]: "@عبدان @شواشة عرّفوا نفسكم باختصار"
              - button "More actions" [ref=e545] [cursor=pointer]:
                - img [ref=e546]
            - generic [ref=e550]:
              - button "تنسيق الفريق والمساعدة البحثية" [ref=e551] [cursor=pointer]:
                - img [ref=e552]
                - generic [ref=e554]: تنسيق الفريق والمساعدة البحثية
              - button "More actions" [ref=e557] [cursor=pointer]:
                - img [ref=e558]
            - generic [ref=e562]:
              - button "Arabic AI Assistant Platform Overview" [ref=e563] [cursor=pointer]:
                - img [ref=e564]
                - generic [ref=e566]: Arabic AI Assistant Platform Overview
              - button "More actions" [ref=e569] [cursor=pointer]:
                - img [ref=e570]
            - generic [ref=e574]:
              - button "أجهزة لابتوب للطلاب 2026" [ref=e575] [cursor=pointer]:
                - img [ref=e576]
                - generic [ref=e578]: أجهزة لابتوب للطلاب 2026
              - button "More actions" [ref=e581] [cursor=pointer]:
                - img [ref=e582]
            - generic [ref=e586]:
              - button "تحية الراعي والاستفسار عن الأغنام" [ref=e587] [cursor=pointer]:
                - img [ref=e588]
                - generic [ref=e590]: تحية الراعي والاستفسار عن الأغنام
              - button "More actions" [ref=e593] [cursor=pointer]:
                - img [ref=e594]
            - generic [ref=e598]:
              - button "Agent Introduction Protocol" [ref=e599] [cursor=pointer]:
                - img [ref=e600]
                - generic [ref=e602]: Agent Introduction Protocol
              - button "More actions" [ref=e605] [cursor=pointer]:
                - img [ref=e606]
            - generic [ref=e610]:
              - button "# نظام الوكلاء المتخصصين العربي" [ref=e611] [cursor=pointer]:
                - img [ref=e612]
                - generic [ref=e614]: "# نظام الوكلاء المتخصصين العربي"
              - button "More actions" [ref=e617] [cursor=pointer]:
                - img [ref=e618]
            - generic [ref=e622]:
              - button "تعريف الراعي بالممرر في جولات" [ref=e623] [cursor=pointer]:
                - img [ref=e624]
                - generic [ref=e626]: تعريف الراعي بالممرر في جولات
              - button "More actions" [ref=e629] [cursor=pointer]:
                - img [ref=e630]
            - generic [ref=e634]:
              - 'button "رحول: منصة وكلاء متخصصين أكاديميين" [ref=e635] [cursor=pointer]':
                - img [ref=e636]
                - generic [ref=e638]: "رحول: منصة وكلاء متخصصين أكاديميين"
              - button "More actions" [ref=e641] [cursor=pointer]:
                - img [ref=e642]
            - generic [ref=e646]:
              - button "Al-Musammim تعريف الفريق في جولات متعددة" [ref=e647] [cursor=pointer]:
                - img [ref=e648]
                - generic [ref=e650]: Al-Musammim
                - generic [ref=e651]: تعريف الفريق في جولات متعددة
              - button "More actions" [ref=e654] [cursor=pointer]:
                - img [ref=e655]
            - generic [ref=e659]:
              - button "التعريف بالنفس في ثلاث جولات" [ref=e660] [cursor=pointer]:
                - img [ref=e661]
                - generic [ref=e663]: التعريف بالنفس في ثلاث جولات
              - button "More actions" [ref=e666] [cursor=pointer]:
                - img [ref=e667]
            - generic [ref=e671]:
              - button "Al-Musammim Garbled text encoding issue detected" [ref=e672] [cursor=pointer]:
                - img [ref=e673]
                - generic [ref=e675]: Al-Musammim
                - generic [ref=e676]: Garbled text encoding issue detected
              - button "More actions" [ref=e679] [cursor=pointer]:
                - img [ref=e680]
            - generic [ref=e684]:
              - button "Garbled Text Communication Issue" [ref=e685] [cursor=pointer]:
                - img [ref=e686]
                - generic [ref=e688]: Garbled Text Communication Issue
              - button "More actions" [ref=e691] [cursor=pointer]:
                - img [ref=e692]
            - generic [ref=e696]:
              - button "@?????? ?????? ???? ????" [ref=e697] [cursor=pointer]:
                - img [ref=e698]
                - generic [ref=e700]: "@?????? ?????? ???? ????"
              - button "More actions" [ref=e703] [cursor=pointer]:
                - img [ref=e704]
            - generic [ref=e708]:
              - button "Encoding Error in Arabic Message" [ref=e709] [cursor=pointer]:
                - img [ref=e710]
                - generic [ref=e712]: Encoding Error in Arabic Message
              - button "More actions" [ref=e715] [cursor=pointer]:
                - img [ref=e716]
            - generic [ref=e720]:
              - button "debug-test" [ref=e721] [cursor=pointer]:
                - img [ref=e722]
                - generic [ref=e724]: debug-test
              - button "More actions" [ref=e727] [cursor=pointer]:
                - img [ref=e728]
            - generic [ref=e732]:
              - button "Al-Musammim عنوان المحادثة:" [ref=e733] [cursor=pointer]:
                - img [ref=e734]
                - generic [ref=e736]: Al-Musammim
                - generic [ref=e737]: "عنوان المحادثة:"
              - button "More actions" [ref=e740] [cursor=pointer]:
                - img [ref=e741]
            - generic [ref=e745]:
              - button "تحية ترحيبية وعرض مساعدة" [ref=e746] [cursor=pointer]:
                - img [ref=e747]
                - generic [ref=e749]: تحية ترحيبية وعرض مساعدة
              - button "More actions" [ref=e752] [cursor=pointer]:
                - img [ref=e753]
            - generic [ref=e757]:
              - button "جمع الفواكه والخضروات" [ref=e758] [cursor=pointer]:
                - img [ref=e759]
                - generic [ref=e761]: جمع الفواكه والخضروات
              - button "More actions" [ref=e764] [cursor=pointer]:
                - img [ref=e765]
            - generic [ref=e769]:
              - button "تحية ترحيبية وتقديم الخدمات" [ref=e770] [cursor=pointer]:
                - img [ref=e771]
                - generic [ref=e773]: تحية ترحيبية وتقديم الخدمات
              - button "More actions" [ref=e776] [cursor=pointer]:
                - img [ref=e777]
            - generic [ref=e781]:
              - button "ترحيب وعرض خدمات مساعدة" [ref=e782] [cursor=pointer]:
                - img [ref=e783]
                - generic [ref=e785]: ترحيب وعرض خدمات مساعدة
              - button "More actions" [ref=e788] [cursor=pointer]:
                - img [ref=e789]
    - generic [ref=e794]:
      - main [ref=e795]:
        - generic [ref=e796]:
          - button "Switch workspace" [ref=e798] [cursor=pointer]:
            - img [ref=e799]
            - generic [ref=e802]: PhD
            - img [ref=e803]
          - generic [ref=e805]:
            - generic [ref=e806]:
              - text: 12:00
              - generic [ref=e807]: :33
              - text: AM
            - generic [ref=e808]: Fri · 24 Apr
          - button "Search... K" [ref=e809] [cursor=pointer]:
            - img [ref=e810]
            - generic [ref=e813]: Search...
            - generic [ref=e814]:
              - img [ref=e815]
              - text: K
          - button "EN" [ref=e817] [cursor=pointer]:
            - img [ref=e818]
            - generic [ref=e822]: EN
          - generic [ref=e823]:
            - button "Light" [ref=e824] [cursor=pointer]:
              - img [ref=e825]
            - button "Dark" [ref=e831] [cursor=pointer]:
              - img [ref=e832]
          - button "Theme 1" [ref=e835] [cursor=pointer]:
            - img [ref=e836]
            - generic [ref=e842]: Theme 1
          - button "notifications" [ref=e845] [cursor=pointer]:
            - img [ref=e846]
        - generic [ref=e849]:
          - main [ref=e850]:
            - generic [ref=e851]:
              - generic [ref=e852]:
                - generic [ref=e853]:
                  - img [ref=e854]
                  - heading "Agents" [level=1] [ref=e857]
                - generic [ref=e858]:
                  - generic [ref=e859]:
                    - button "List" [ref=e860] [cursor=pointer]:
                      - img [ref=e861]
                      - text: List
                    - button "Org" [ref=e864] [cursor=pointer]:
                      - img [ref=e865]
                      - text: Org
                  - generic [ref=e870] [cursor=pointer]:
                    - checkbox "Show archived" [ref=e871]
                    - text: Show archived
                  - button "New Agent" [ref=e872] [cursor=pointer]:
                    - img [ref=e873]
                    - text: New Agent
              - paragraph [ref=e875]: Built-in Agents
              - generic [ref=e876]:
                - paragraph [ref=e877]: Custom Agents
                - generic [ref=e878]:
                  - img [ref=e879]
                  - paragraph [ref=e882]: No custom agents yet
                  - button "Create your first agent" [ref=e883] [cursor=pointer]
          - button "Split screen (Ctrl+\\)" [ref=e887] [cursor=pointer]:
            - img [ref=e888]
      - complementary [ref=e890]:
        - generic [ref=e891]:
          - img [ref=e892]
          - heading "Active Tasks" [level=2] [ref=e895]
          - generic [ref=e896]: "1"
          - button "Collapse" [ref=e897] [cursor=pointer]:
            - img [ref=e898]
        - generic [ref=e900]:
          - generic [ref=e901]:
            - textbox "New task..." [ref=e902]
            - button [disabled] [ref=e903]:
              - img [ref=e904]
          - paragraph [ref=e905]: Hover a task to add a subtask
        - generic [ref=e908]:
          - button [ref=e909] [cursor=pointer]
          - paragraph [ref=e911]: تجربة
          - generic [ref=e912]:
            - button "Add subtask" [ref=e913] [cursor=pointer]:
              - img [ref=e914]
            - button "Delete" [ref=e918] [cursor=pointer]:
              - img [ref=e919]
        - link "— Open full tasks page →" [ref=e923] [cursor=pointer]:
          - /url: /tasks
  - alert [ref=e924]
  - button "Clippy — ask me anything" [ref=e926] [cursor=pointer]:
    - img [ref=e927]
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
     |                                                          ^ Error: LCP on /agents
  88 |     if (m.fcp != null) expect(m.fcp, `FCP on ${t.name}`).toBeLessThanOrEqual(t.fcpMax);
  89 |     if (m.cls != null) expect(m.cls, `CLS on ${t.name}`).toBeLessThanOrEqual(t.clsMax);
  90 |   });
  91 | }
  92 | 
```