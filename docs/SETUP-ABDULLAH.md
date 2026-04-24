# Ruhool — First-run Setup Checklist

Written 2026-04-23 for عبدالله. Fifteen minutes to go from fresh clone
to working daily report.

## 1. LLM Provider (2 min)

Without an enabled provider, dispatch + reports compose will fail with
"No enabled LLM provider for model …".

1. Open `/settings` → **API Providers**
2. Pick one and paste its key:
   - **Anthropic** (recommended — defaults used throughout): key from
     https://console.anthropic.com/settings/keys
   - OpenAI — https://platform.openai.com/api-keys
   - Google Gemini — https://aistudio.google.com/app/apikey
3. Click **Save**. Status pill turns green when the key verifies.

Verify: open any conversation → @الراعي → type "test" → you get a
reply. If you see an auth error, re-check the key.

## 2. Resend for reports (10 min, one-time)

1. Sign up at https://resend.com/signup (free: 3 000 emails/month)
2. **Add a sending domain** (required — `onboarding@resend.dev` works
   for test-send only, not production):
   - Click **Domains** → **Add Domain**
   - Type your domain (e.g. `ruhool.yoursite.com`)
   - Copy the DNS records (SPF + DKIM + DMARC) into your DNS
     provider's zone
   - Wait for Resend to verify (usually <5 min)
3. **Generate an API key:** Profile → **API Keys** → Create
   - Name it `ruhool-local`, scope `Full access`
   - Copy the `re_…` secret (shown once)
4. Open Ruhool `/settings` → **Reports**:
   - Paste **API Key** → `re_…`
   - **From**: `Ruhool Reports <reports@yourdomain.com>` (must match
     the verified domain)
   - **Default recipient**: your own email
   - **Save** — a default daily report is auto-seeded (disabled)
5. Click **"أرسل إيميل اختبار"** → wait for Resend 200 → confirm the
   email arrives in your inbox
6. Flip the **power toggle** on the seeded "التقرير اليومي
   التنفيذي" → it will fire at 22:00 Kuwait tonight

If the test email bounces: most common cause is an unverified
domain. Double-check the DNS records are present and Resend shows the
domain as "Verified".

## 3. Google Tasks OAuth (3 min)

You hit a 403 earlier because the OAuth consent screen is in
"Testing" mode. Two options:

**Option A — add yourself as a Test user** (keeps the app private, no
verification needed):

1. https://console.cloud.google.com/apis/credentials/consent
2. Scroll to **Test users** → **+ Add users**
3. Add your Gmail address
4. Save

**Option B — Publish the app** (Tasks API is non-sensitive, needs no
Google review):

1. Same page → **Publish app** button → confirm
2. The warning about "will be visible to anyone with a Google account"
   is technically true but only if they know your `client_id` — in
   practice nobody else can use it

Then back in Ruhool `/settings` → **Google Tasks**:

1. Make sure `Client ID`, `Secret`, `Redirect URI` are still filled
   (they should be from your earlier attempt)
2. **Connect** → Google consent screen → Approve
3. Pick a target list (e.g. "المهام")
4. Flip **Sync enabled** on

Verify: create a task in Ruhool → it appears in Google Tasks within
~2 seconds. Create one in Google Tasks → it appears in Ruhool within
30 seconds (foreground) or 5 minutes (backgrounded).

## 4. Enable the daily report (30 sec)

Once Resend is verified, go back to `/settings` → **Reports** and
toggle **"التقرير اليومي التنفيذي"** ON (the power icon on the left
of its row turns green).

Nothing else to configure — it fires at 22:00 Asia/Kuwait tonight,
then every day after.

---

## Done. What to expect tomorrow morning

- **Email in your inbox at ~22:00 tonight**: "تقرير [اليوم]
  [date]" from the architect, summarizing today's task completions,
  dispatch activity, and one suggestion for tomorrow.
- **Embedded charts** in the email: 30-day task heatmap + priority
  breakdown.
- **Google Tasks stays in sync** whenever either side changes.
