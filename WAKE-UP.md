# صباح الخير 🌅 — وضع الـ deploy

## الحالة لما نمت

✅ **كل الكود سليم ومرفوع لـ GitHub** (branch `ruhool-core-review`، commit `ce77ce6`)
✅ **Tests:** 334/334 خضراء
✅ **Types:** نضيفة على api + core + web
✅ **Vercel web:** شغّال، لكن الـ API route صار proxy فقط (يحتاج `NEXT_PUBLIC_API_URL`)
✅ **Railway:** مشروع `ruhool-api` منشأ، service `api` منشأ، env vars الـ ٣ مضبوطة، `railway.json` و `Dockerfile.railway` جاهزين
🟡 **آخر deploy فشل** بسبب 502 من Railway registry (مشكلة Railway infrastructure، مو من كودنا) — يفترض حلت تلقائياً

## شغّل أمر واحد لما تصحى

من `C:\Users\alhud\platform`:

```powershell
railway up
```

لو نجح:
- يطلع لك build logs ثم "Successfully deployed"
- شغّل: `railway domain` للحصول على رابط publik
- ثم: ضف `NEXT_PUBLIC_API_URL` كـ env var على Vercel وأعد deploy للـ web

لو فشل:
- جرّب `railway redeploy` (يستخدم آخر image ناجح بدون rebuild)
- أو افتح [Railway Dashboard](https://railway.com/project/a82bf0de-dc3e-4e40-9bf7-3ac6f8b7f8d0) واضغط "Redeploy" يدوياً

## بعد ما الـ Railway URL يطلع

أعطني الرابط ونكمل:
1. ضبط `NEXT_PUBLIC_API_URL` على Vercel ليتشير للـ Railway URL
2. Redeploy Vercel web
3. Verify (الـ ٢٠ بند في `docs/D-7-VERIFY.md`)

## الملفات اللي حدّثت أو ضفت

تفاصيل في commit message: `git log -1 --format=%B`

## لو قررت تتراجع عن D-7 كلياً

```powershell
git revert ce77ce6
```

ترجع للحالة قبل D-7 (Vercel web بس، API محلي).
