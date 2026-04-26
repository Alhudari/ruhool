# D-7 — قائمة الفحص بعد النشر (Verification)

شغّل هذي بعد ما `vercel deploy --prod` ينجح. كل بند PASS/FAIL — سجّل النتائج عشان نشوفها معاً قبل ما نعلن "Phase 1 done".

استخدم `https://ruhool-xxx.vercel.app` كـ `BASE` في الأمثلة.

## ١. الـ infrastructure يشتغل

| # | الفحص | كيف | المتوقّع |
|---|------|-----|---------|
| 1 | الـ web يفتح | افتح `BASE` في المتصفح | الصفحة الرئيسية تظهر بدون 500 |
| 2 | الـ API يرد | `curl BASE/api/health` | JSON `{ ok: true, ... }` |
| 3 | الـ DB موصول | افتح Neon dashboard → Tables → `app_state` | السطر `main` موجود + `updated_at` حديث |
| 4 | function logs نظيفة | Vercel UI → Functions → catch-all → Logs | لا errors في آخر deploy |

## ٢. الـ store يعمل

| # | الفحص | كيف | المتوقّع |
|---|------|-----|---------|
| 5 | حفظ مفتاح يستمر | Settings → Providers → أضف Anthropic key → ارجع للصفحة | المفتاح موجود (✓) — يعني الـ Neon حفظه |
| 6 | إعادة تحميل تستعيد | F5 على نفس الصفحة | المفتاح ما زال موجود |
| 7 | تشفير صحيح | في Neon SQL Editor: `SELECT data->'providers' FROM app_state WHERE id='main';` | الـ apiKey يبدأ بـ `enc:v1:...` (مو plaintext) |

## ٣. الميزات الأساسية

| # | الفحص | كيف | المتوقّع |
|---|------|-----|---------|
| 8 | Chat يرد | افتح `BASE/chat` → اكتب "السلام عليكم" → ابعث | رد streaming يصل من الراعي |
| 9 | Library Matrix يحمّل | `BASE/library/matrix` | جدول فاضي (أو فيه entities لو نقلت) |
| 10 | إضافة entity تستمر | افتح modal → إضافة → Save → F5 | الـ entity موجود |
| 11 | Library Agent Chat | اضغط Sparkles على entity → اكتب "اقترح قيمة لـ aims" → ابعث | رد + tool_call card |
| 12 | Quick fill (Zap) | اضغط Zap على entity | modal one-shot يفتح + يقترح قيم |

## ٤. الميزات اللي **لازم** ما تشتغل

| # | الفحص | كيف | المتوقّع |
|---|------|-----|---------|
| 13 | Vault routes ترجع 503 | `curl BASE/api/vault/literature` | 503 + JSON `{ unavailableInCloud: true }` |
| 14 | Zotero local 503 | `curl BASE/api/zotero/local/items` | 503 ناعم |
| 15 | لا workers خلفية | function logs خلال ١٠ دقايق idle | لا "scheduler tick" / "watcher run" — يعني الـ guard اشتغل |

## ٥. Cold start + persistence

| # | الفحص | كيف | المتوقّع |
|---|------|-----|---------|
| 16 | بعد ٥ دقايق idle | افتح صفحة، اطلب action، شوف function logs | "Cold start" واضح + `initializeStore` يحمّل من DB |
| 17 | تعديل من تبين | افتح تابين، عدّل في الواحد | (مع #5 limitation) قد يطمس آخر write — متوقّع، single-user OK |

## ٦. Performance sanity

| # | الفحص | كيف | المتوقّع |
|---|------|-----|---------|
| 18 | Cold start latency | أول request بعد idle طويل | < 5s response (Fluid Compute سريع) |
| 19 | Warm response | request متكرر | < 500ms |
| 20 | Streaming يعمل | chat response | يظهر حرف بحرف، مو chunk واحد |

---

## لو فشل بند

- **5/6/7 (store):** افحص `STORE_BACKEND=postgres` فعلاً موجود في env vars + الـ DB reachable
- **8 (chat):** غالباً `ANTHROPIC_API_KEY` ناقصة — أضفها من Settings أو env var
- **13/14 (vault 503):** لو يرد 200 أو 500 بدل 503 → الـ middleware ما اشتغل، شوف routes/index.ts
- **15 (workers):** لو في tick logs → الـ `if (!process.env.VERCEL)` ناقص في مكان

كل issue من هذي → سجّلها في تقرير + نراجع معاً قبل ما نعلن الـ deploy ناجح.

## نتيجة شاملة

عبدالله يكتب تحت:

```
✅ #1-4: infra OK
✅ #5-7: store + encryption OK
✅ #8-12: features OK
✅ #13-15: graceful degrade OK
✅ #16-17: persistence OK
✅ #18-20: performance OK

→ Phase 1 deploy SUCCESS
```

أو يسجّل الفشلات لما يحصل.
