/**
 * R16 — "Start fresh" onboarding endpoint.
 *
 * Wipes user-generated content (conversations, messages, memories,
 * tasks, graph, reports, inbox, activity log) but PRESERVES
 * technical config (provider API keys, googleTasks OAuth, resend
 * config, preferences, schema version, builtin model choices).
 *
 * Then seeds a welcome message from الراعي into the inbox so Abdullah
 * opens the platform to a friendly hand-off — not an empty shell.
 */
import type { Hono } from 'hono';
import crypto from 'node:crypto';
import type { StoreData, ReportInboxItem } from '../store/types.js';

export interface FreshStartRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  logger?: { info: (m: string) => void };
}

const WELCOME_SUBJECT = 'أهلاً بك في رحول يا عبدالله';

const WELCOME_HTML = `<!doctype html>
<html dir="rtl" lang="ar"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>أهلاً بك في رُحول</title>
<style>
  /* R16 — inline @font-face so Thmanyah loads inside the iframe
     even though srcDoc creates an opaque origin. Relative URLs
     resolve via the <base> tag the inbox page injects. For real
     email (Gmail/Outlook) these @font-face rules are ignored and
     the font-family falls back to Georgia/sans — which is fine. */
  @font-face {
    font-family: 'Thmanyah Sans';
    src: url('/fonts/thmanyah/sans/thmanyahsans-Regular.woff2') format('woff2');
    font-weight: 400; font-style: normal; font-display: swap;
  }
  @font-face {
    font-family: 'Thmanyah Sans';
    src: url('/fonts/thmanyah/sans/thmanyahsans-Medium.woff2') format('woff2');
    font-weight: 500; font-style: normal; font-display: swap;
  }
  @font-face {
    font-family: 'Thmanyah Sans';
    src: url('/fonts/thmanyah/sans/thmanyahsans-Bold.woff2') format('woff2');
    font-weight: 700; font-style: normal; font-display: swap;
  }
  @font-face {
    font-family: 'Thmanyah Serif Text';
    src: url('/fonts/thmanyah/serif-text/thmanyahseriftext-Regular.woff2') format('woff2');
    font-weight: 400; font-style: normal; font-display: swap;
  }
  @font-face {
    font-family: 'Thmanyah Serif Text';
    src: url('/fonts/thmanyah/serif-text/thmanyahseriftext-Medium.woff2') format('woff2');
    font-weight: 500; font-style: normal; font-display: swap;
  }
  @font-face {
    font-family: 'Thmanyah Serif Display';
    src: url('/fonts/thmanyah/serif-display/thmanyahserifdisplay-Regular.woff2') format('woff2');
    font-weight: 400; font-style: normal; font-display: swap;
  }
  @font-face {
    font-family: 'Thmanyah Serif Display';
    src: url('/fonts/thmanyah/serif-display/thmanyahserifdisplay-Medium.woff2') format('woff2');
    font-weight: 500; font-style: normal; font-display: swap;
  }
  body { margin: 0; padding: 0; background: #faf6ef; font-family: 'Thmanyah Serif Text', 'Source Serif 4', Georgia, serif; color: #2a2014; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 0; }
  .hero {
    padding: 48px 32px 32px;
    text-align: center;
    background: linear-gradient(180deg, #f0e5d1 0%, #faf6ef 100%);
    border-bottom: 1px solid #e8dfc9;
  }
  .hero svg { display: block; margin: 0 auto 24px; }
  .hero .issue { font-family: 'Thmanyah Sans', sans-serif; font-size: 11px; letter-spacing: 3px; color: #9a7b4a; text-transform: uppercase; margin: 0 0 12px; }
  .hero h1 { font-family: 'Thmanyah Serif Display', serif; font-size: 34px; line-height: 1.25; color: #1a1008; margin: 0 0 8px; font-weight: 500; }
  .hero .tagline { font-family: 'Thmanyah Serif Text', serif; font-style: italic; color: #6b4f3a; font-size: 16px; margin: 0; }
  .author {
    display: flex; align-items: center; gap: 14px;
    padding: 24px 32px; border-bottom: 1px solid #efe7d4;
    background: #fbf7ee;
  }
  .author-avatar {
    width: 44px; height: 44px; border-radius: 50%;
    background: #c97b3a; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Thmanyah Serif Display', serif; font-size: 20px; font-weight: 500;
  }
  .author-meta { flex: 1; }
  .author-name { font-family: 'Thmanyah Sans', sans-serif; font-size: 14px; font-weight: 600; color: #2a2014; margin: 0; }
  .author-role { font-family: 'Thmanyah Sans', sans-serif; font-size: 12px; color: #8a7355; margin: 2px 0 0; }
  .body { padding: 40px 32px 16px; font-size: 17px; line-height: 2.0; }
  .body p { margin: 0 0 20px; }
  .body h2 {
    font-family: 'Thmanyah Serif Display', serif;
    font-size: 24px; line-height: 1.35; color: #1a1008;
    margin: 48px 0 4px; font-weight: 500;
  }
  .section-num {
    font-family: 'Thmanyah Serif Display', serif;
    font-size: 72px; line-height: 1; color: #c97b3a;
    margin: 48px 0 -8px; font-weight: 400;
    opacity: 0.85;
  }
  .agent-grid {
    margin: 24px 0 32px;
    border-top: 1px solid #efe7d4;
  }
  .agent-row {
    display: flex; gap: 16px; align-items: baseline;
    padding: 14px 0;
    border-bottom: 1px solid #efe7d4;
  }
  .agent-name {
    font-family: 'Thmanyah Serif Display', serif;
    font-size: 17px; font-weight: 500; color: #1a1008;
    min-width: 96px;
    text-align: start;
  }
  .agent-role {
    flex: 1;
    font-family: 'Thmanyah Serif Text', serif;
    font-size: 15px; color: #3d2e1f; line-height: 1.7;
  }
  .pullquote {
    font-family: 'Thmanyah Serif Display', serif;
    font-size: 28px; line-height: 1.5;
    color: #6b4f3a;
    text-align: center;
    padding: 36px 24px;
    margin: 48px -16px;
    border-top: 1px solid #e8dfc9;
    border-bottom: 1px solid #e8dfc9;
    font-style: italic;
    font-weight: 400;
  }
  .pullquote::before { content: '"'; color: #c97b3a; font-size: 36px; margin-inline-end: 6px; }
  .pullquote::after { content: '"'; color: #c97b3a; font-size: 36px; margin-inline-start: 6px; }
  .step-title {
    font-family: 'Thmanyah Serif Display', serif;
    font-size: 22px; color: #1a1008; margin: 8px 0 14px;
  }
  .step ul { padding-inline-start: 22px; margin: 0 0 16px; }
  .step li { margin-bottom: 10px; }
  code.inline {
    background: #f0e5d1; color: #6b4f3a;
    padding: 2px 8px; border-radius: 4px;
    font-family: 'JetBrains Mono', monospace; font-size: 14px;
    direction: ltr; display: inline-block;
  }
  .signoff {
    margin-top: 48px; padding-top: 24px;
    border-top: 1px solid #efe7d4;
    font-family: 'Thmanyah Serif Display', serif;
    font-size: 19px; color: #3d2e1f;
  }
  .footer {
    padding: 24px 32px;
    background: #f0e5d1;
    font-family: 'Thmanyah Sans', sans-serif;
    font-size: 12px; color: #8a7355;
    line-height: 1.7;
    text-align: center;
  }
  .footer strong { color: #6b4f3a; }
  .divider {
    text-align: center; color: #c97b3a;
    margin: 40px 0 24px;
    font-size: 16px;
    letter-spacing: 8px;
  }
</style>
</head>
<body>
<div class="wrap">

  <!-- Hero — logo slot left empty; Abdullah will swap in the new
       brand mark when it's ready. -->
  <section class="hero">
    <p class="issue">العدد الأول · ترحيب</p>
    <h1>أهلاً بك على ظهر رُحول</h1>
    <p class="tagline">رحلة بحثية طويلة تحتاج إلى قافلة منظّمة — لا إلى رفيقٍ واحد.</p>
  </section>

  <!-- Author -->
  <div class="author">
    <div class="author-avatar">ر</div>
    <div class="author-meta">
      <p class="author-name">الراعي</p>
      <p class="author-role">مدير غرفة الدكتوراه في رُحول</p>
    </div>
  </div>

  <!-- Opening -->
  <section class="body">
    <p>
      أهلاً بك يا عبدالله،
    </p>
    <p>
      حين اخترتَ اسمَ "رُحول" كنتَ تختار تشبيهاً لا شعاراً فقط: الناقة الذلول
      التي تقود قافلةً في رحلة طويلة، تحمل أثقالاً وتصبر على بُعدِ المسافة.
      الدكتوراه رحلةٌ من هذا النوع. وأنا، بإذن الله، مَن يُنظّم قافلتك.
    </p>
    <p>
      اليوم نبدأ. هذا العدد الأول من نشرات رُحول التي ستصلك هنا في صندوقك،
      وفيه ثلاثة أشياء: تعريفٌ بفريقك، ومسارٌ مقترح للأسبوع الأول، وطريقةٌ
      للتحدّث معنا.
    </p>

    <div class="divider">✦ ✦ ✦</div>

    <!-- Section 1: Team -->
    <p class="section-num">١</p>
    <h2>فريقُ القافلة</h2>
    <p>
      معك في رُحول سبعة وكلاء أساسيّين للبحث والكتابة، وعدد آخر للمهام
      المساندة. لست مضطراً لتذكّرهم الآن — يكفي أن تناديني أنا، وأُوجِّهُك
      لمن يناسب مهمّتك.
    </p>

    <div class="agent-grid">
      <div class="agent-row">
        <div class="agent-name">الباحث</div>
        <div class="agent-role">يبحث في Scopus وWeb of Science ويلتقط الأوراق ذات الصلة بسؤالك البحثي.</div>
      </div>
      <div class="agent-row">
        <div class="agent-name">المُلخِّص</div>
        <div class="agent-role">يقرأ الأوراق معك ويستخرج بنيتها: الهدف، المنهج، النتائج، والفجوات.</div>
      </div>
      <div class="agent-row">
        <div class="agent-name">المُقارِن</div>
        <div class="agent-role">يُقارن بين ورقتين أو أكثر ويُبرِز الفروقات في جداول واضحة.</div>
      </div>
      <div class="agent-row">
        <div class="agent-name">الناقد</div>
        <div class="agent-role">يُراجع كتابتك بصراحة مهذّبة ويقترح تحسينات بنفس صوتك.</div>
      </div>
      <div class="agent-row">
        <div class="agent-name">الكاتب</div>
        <div class="agent-role">مساعد كتابة جواريّ — إعادة صياغة، ربط، تنظيم عناوين في أي موضع.</div>
      </div>
      <div class="agent-row">
        <div class="agent-name">الخوي</div>
        <div class="agent-role">رفيقك اليومي — روتين، أفكار، وذاكرة طويلة المدى لمسيرتك البحثية.</div>
      </div>
      <div class="agent-row">
        <div class="agent-name">المُدوِّن</div>
        <div class="agent-role">يتابع اجتماعاتك مع المشرفين، ويُجهِّزك لكل لقاء، ويُوثِّق المحاضر.</div>
      </div>
    </div>

    <!-- Pull quote -->
    <div class="pullquote">
      رحلة الدكتوراه ليست سباقاً، بل تحمُّلاً طويلاً. والقافلة المنظَّمة تصل حيث يُخفِق الراكبُ الوحيد.
    </div>

    <!-- Section 2: Steps -->
    <p class="section-num">٢</p>
    <h2>مسارُ الأسبوع الأول</h2>
    <p>
      ثلاث مراحل — لا تتجاوز ساعتين يومياً — تجعلك في وضعٍ مُنتج قبل يوم الأحد القادم:
    </p>

    <div class="step">
      <h3 class="step-title">أ · حدِّد سؤالك البحثي (اليوم)</h3>
      <ul>
        <li>افتح محادثةً جديدةً معي (<code class="inline">@الراعي</code>) وأخبرني بالموضوع والزاوية والفجوة المُستهدَفة.</li>
        <li>أُحوّلُك إلى <strong>الخوي</strong> لتثبيت أهدافك طويلة المدى في الذاكرة.</li>
      </ul>
    </div>

    <div class="step">
      <h3 class="step-title">ب · ابدأ القراءة المُنظَّمة (هذا الأسبوع)</h3>
      <ul>
        <li>من الشريط الجانبي: <strong>المصادر والقراءة</strong> ← <strong>قائمة القراءة</strong>.</li>
        <li>استدعِ <code class="inline">@الباحث</code> لاقتراح أوراقٍ مبنيّةٍ على سؤالك.</li>
        <li>لكل ورقةٍ مُهمَّة: اضغط "ابدأ القراءة مع المُلخِّص" — يستخرج الهيكل والاقتباسات.</li>
        <li>كل اقتباسٍ مثيرٍ يُحفَظ كـ "ملاحظةٍ ذرِّية" في <strong>الكتابة</strong>.</li>
      </ul>
    </div>

    <div class="step">
      <h3 class="step-title">ج · ضع خطَّتَك الزمنية (نهاية الأسبوع)</h3>
      <ul>
        <li>صفحة <strong>المهام</strong>: أضف ٥–٧ مهام لأسبوعك القادم.</li>
        <li>اربط المهام الكبرى بـ <strong>اجتماعات الإشراف</strong> — المُدوِّن سيُذكِّرك قبل كل لقاء.</li>
        <li>عيِّن "عادات يومية" (قراءة ٣٠ دقيقة، كتابة ١٥ دقيقة) — الخوي يتتبّعها.</li>
      </ul>
    </div>

    <!-- Section 3: How to talk -->
    <p class="section-num">٣</p>
    <h2>كيف تتحدَّث معنا</h2>
    <p>
      نحن لا نعمل بالإشارات. نداؤك المباشر هو ما يُحرِّكنا:
    </p>
    <ul>
      <li>في أي محادثةٍ، اكتب <code class="inline">@</code> ثم اسم الوكيل لاستدعائه.</li>
      <li>سلسلة وكلاء في رسالةٍ واحدة: <code class="inline">@الراعي ثم @الباحث ثم @المُلخِّص</code>. كلٌّ يقرأ ردَّ سابقه ويبني عليه.</li>
      <li>لستَ متأكّداً مَن المناسب؟ ناديني، وأنا أُوجِّهك.</li>
    </ul>

    <div class="divider">✦ ✦ ✦</div>

    <p>
      تقاريرك الدورية — اليومية منها والأسبوعية — ستصلك هنا في هذا الصندوق.
      إن فعَّلتَ خدمة Resend لاحقاً فستصلك أيضاً على بريدك الخارجي، بلا
      تكرار وبلا فقدان.
    </p>

    <p>
      جاهزٌ متى ما كنتَ جاهزاً. افتح محادثةً جديدة واكتب "ابدأ" — أرشدُك
      للخطوة الأولى بنفسي.
    </p>

    <p class="signoff">
      — الراعي
    </p>
  </section>

  <!-- Footer -->
  <div class="footer">
    <strong>رُحول</strong> · منصّة بحثك الخاصّة<br>
    نشرة ترحيب تصلك مرّةً واحدة. لتعطيل التقارير القادمة أو تعديلها،
    افتح الإعدادات ← التقارير.
  </div>

</div>
</body></html>`;

const WELCOME_MARKDOWN = `# أهلاً بك في رحول يا عبدالله

مرحباً يا عبدالله،

أنا الراعي، المسؤول عن تنسيق عمل فريقك البحثي في رحول. في هذي المنصة معك عدد من الوكلاء المتخصصين، كل واحد منهم يقوم بدور واضح في رحلة الدكتوراه، وأنا من ينسّق بينهم نيابة عنك.

## فريقك البحثي
- **الباحث** — يبحث لك في Scopus وWoS ويلتقط الأوراق ذات الصلة.
- **المُلخِّص** — يقرأ الأوراق ويُلخِّصها بنيوياً.
- **المُقارِن** — يُقارن بين ورقتين أو أكثر.
- **الناقد** — يُراجع كتابتك.
- **الكاتب** — مساعد كتابة جواري.
- **الخوي** — رفيقك البحثي اليومي.
- **المُدوِّن** — يتابع اجتماعات المشرفين.

## خطوات البدء

### ١. حدّد سؤالك البحثي (اليوم)
افتح محادثة معي وأخبرني بالموضوع والزاوية والفجوة.

### ٢. ابدأ القراءة المنظّمة (هذا الأسبوع)
"قائمة القراءة" → @الباحث يقترح الأوراق → @المُلخِّص يستخرج الهيكل → احفظ الاقتباسات كملاحظات ذرّية.

### ٣. ضع خطتك الزمنية (نهاية الأسبوع)
"المهام" — 5-7 مهام + عادات يومية.

— الراعي`;

export function registerFreshStartRoutes(app: Hono, deps: FreshStartRoutesDeps): void {
  const { getStore, saveStore, logger } = deps;

  // POST /api/platform/reset-to-fresh — nuke user content, seed welcome.
  app.post('/api/platform/reset-to-fresh', (c) => {
    const store = getStore();

    // Fields we wipe (all user-generated content). Anything not listed
    // stays: providers/apiKeys/resend/googleTasks/taskPrefs/budget/
    // schemaVersion/builtinAgentModels/phdSchedule/etc.
    //
    // R17 — `tasks` + `taskLists` + `keepNotes` REMOVED from the wipe.
    // Abdullah: "المهام لا تحذف اللي اضفتهم". Tasks/notes are ongoing
    // planning artifacts, not ephemeral conversation state, so
    // "start fresh" shouldn't nuke them.
    const wipe: Array<keyof StoreData | string> = [
      'conversations', 'messages', 'memories', 'papers',
      'notes',
      'activityLog', 'usage', 'graphNodes', 'graphEdges',
      'reports', 'reportRuns', 'reportInbox',
      'readingSessions', 'pageAnalyses', 'meetingSessions',
      'watcherAlerts', 'agentRuns', 'notificationRecords',
      'inboxItems', 'approvals', 'customAgents',
      'pinnedConversations', 'schedules', 'workflowRuns',
      'companionMemory', 'conversationMemory',
    ];
    let cleared = 0;
    const s = store as unknown as Record<string, unknown>;
    for (const key of wipe) {
      if (Array.isArray(s[key as string])) {
        cleared += (s[key as string] as unknown[]).length;
        s[key as string] = [];
      } else if (s[key as string] !== undefined) {
        delete s[key as string];
      }
    }
    // taskLists no longer wiped — user's categories are preserved.

    // Seed the welcome inbox item.
    const welcome: ReportInboxItem = {
      id: crypto.randomUUID(),
      reportId: null,
      subject: WELCOME_SUBJECT,
      html: WELCOME_HTML,
      bodyMarkdown: WELCOME_MARKDOWN,
      from: 'manager',
      sentAt: new Date().toISOString(),
      read: false,
      tags: ['onboarding', 'welcome'],
    };
    store.reportInbox = [welcome];

    saveStore();
    logger?.info(`[fresh-start] wiped ${cleared} items; welcome seeded`);
    return c.json({ ok: true, cleared, welcomeId: welcome.id });
  });
}
