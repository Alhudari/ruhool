# D-7 — دليل النشر على Vercel (Phase 1)

هذا الدليل يأخذك من "كل شي مكتوب" إلى "Ruhool شغّال على رابط `https://ruhool-...vercel.app`" خطوة بخطوة.

**ما عملناه قبلك (الكود):**
- ✅ Wave 1: الـ store يقرأ/يكتب من Neon Postgres (مع تشفير + migrations)
- ✅ Wave 2: الـ Hono API ينشر كـ Vercel Function داخل Next.js
- ✅ Wave 2: الـ background workers معطّلة على Vercel
- ✅ Wave 2: الـ vault/Zotero local routes ترجع 503 ناعمة بدل crash

**ما تعمله أنت في الخطوات أدناه:** تثبيت CLI، login، إعداد env vars، deploy.

---

## ١. تثبيت Vercel CLI

```bash
! npm install -g vercel
! vercel --version
```

(الـ `!` prefix يخلّي الأمر يشتغل في session الحالية، عشان أشوف الـ output.)

---

## ٢. Login

```bash
! vercel login
```

افتح الرابط اللي يطلع لك، تسجّل دخول، وارجع للـ terminal.

---

## ٣. ربط المشروع بـ Vercel

من جذر المشروع (`C:\Users\alhud\platform`):

```bash
! vercel link
```

أسئلة سيسألها وما تجاوبه:
- **Set up and deploy?** → Y
- **Which scope?** → اختر حسابك الشخصي
- **Link to existing project?** → N (مشروع جديد)
- **What's your project's name?** → `ruhool` (أو أي اسم تحبّه)
- **In which directory is your code located?** → `./` (افتراضي)

بعد هذي الخطوة بيُنشأ مجلد `.vercel/` في الجذر — لا تـ commit عليه.

---

## ٤. إضافة env vars

كل واحد بأمر منفصل. كل أمر بيسأل القيمة (الصق + Enter):

```bash
! vercel env add DATABASE_URL production
```
→ الصق الـ Neon URL: `postgresql://neondb_owner:...@ep-rough-boat-...-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`

```bash
! vercel env add STORE_BACKEND production
```
→ اكتب: `postgres`

```bash
! vercel env add ENCRYPTION_KEY production
```
→ ولّد مفتاح ثابت أول، احفظه في password manager:
```bash
! node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
الصق الـ 64 حرف الناتج.

> **⚠️ مهم:** خزّن `ENCRYPTION_KEY` في مكان آمن. لو ضاعت، كل المفاتيح المخزّنة في Neon (Anthropic، Resend، إلخ) تصير غير قابلة للقراءة. ما تنشأ مفتاح ثاني أبداً.

(اختياري — لو تبي تـ pre-load مفتاح Anthropic بدل ما تدخله من الواجهة):
```bash
! vercel env add ANTHROPIC_API_KEY production
```

---

## ٥. أول Deploy

```bash
! vercel deploy --prod
```

أول مرة تاخذ ٢-٤ دقايق:
- `Building...` ← Next.js + Hono API
- `Uploading...` ← الـ build artifacts
- `Production: https://ruhool-xxx.vercel.app` ← الرابط النهائي 🎉

---

## ٦. الفحص السريع بعد Deploy

افتح الرابط في المتصفح:

1. **الواجهة تفتح؟** → الصفحة الرئيسية تظهر
2. **`https://your-url.vercel.app/api/health`** → JSON يرد بـ status
3. **افتح Settings → Providers → أضف Anthropic key** (مع زرار Test) → يحفظ نظيف
4. **افتح Library Matrix → اقترح اضف entity** → يُحفظ
5. **أعد تحميل الصفحة** → الـ entity موجود (يعني الـ Neon يحفظ صح)
6. **افتح Library Agent Chat** → ابعث رسالة → يرد عبر SSE

لو شي ما يشتغل، شوف اللي بعد.

---

## ٧. لو حصل خطأ

### A. الـ build فشل
```bash
! vercel inspect <deployment-url> --logs
```
أعطني الـ logs، نشوفها معاً.

### B. الـ API يرد 500
على Vercel UI:
- روح **Project → Deployments → [latest] → Functions**
- اضغط `apps/web/src/app/api/[...route]/route.ts`
- شوف Logs

أكثر سبب محتمل: `ENCRYPTION_KEY` غير مضبوطة → `STORE_BACKEND=postgres requires ENCRYPTION_KEY`.

### C. الـ Neon connection يفشل
- تأكد إن الـ URL يحتوي `-pooler` (مهم للـ cold-start storms)
- تأكد إنه `sslmode=require`
- تأكد إن الـ table `app_state` موجود في الـ DB (ارجع لـ Wave 1 SQL)

### D. الـ web يحمّل لكن الـ chat ما يرد
- تأكد إن `ANTHROPIC_API_KEY` إما في الـ env vars أو مدخلة من Settings UI
- شوف function logs لو فيه error من Anthropic

---

## ٨. تحديثات بعدين

كل push على الـ branch المرتبط (أو `vercel deploy --prod` يدوياً) يبني preview أو production:

```bash
! vercel deploy            # preview على رابط مؤقت
! vercel deploy --prod     # production (يستبدل الـ live)
```

---

## ٩. Rollback لو deploy خرّب

```bash
! vercel rollback
```
يرجّع للـ deployment السابق فوراً.

---

## ما لا يشتغل في Phase 1 (متعمّد)

- **Obsidian vault routes** (`/api/vault/*`) → يرجعون 503 برسالة واضحة
- **Zotero local API** (port 23119) → نفس الشي
- **A-series scheduled tasks** (تذكيرات يومية، Resend retry، Zotero sync) → معطّلة على Vercel
- **PDF export** عبر مسارات محلية → يرجع 503

كل هذي ضمن Phase 1.5 (Git-backed vault + Zotero Web API + Vercel Cron).

---

## القيود المعروفة (#5 من MVA)

في Vercel Functions stateless، نظرياً لو **كنت تستخدم تابين متوازيين بنفس اللحظة**، ممكن يطمس واحد تعديلات الثاني (نسخة كامل من JSONB row تُكتب في كل save). لاستخدام شخصي = احتمال صفر تقريباً، لكن مذكور في `docs/D-7-WAVE-1.md`.

الحل النهائي (Wave 2 من D-7) سيضيف `version` column + OCC لإنذار/تجنب الـ override الصامت.
