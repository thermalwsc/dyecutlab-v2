# Landing page + sign-up flow — `/updates` (v1)

**Scope of this change:** a standalone lead-capture page for DYE CUT LAB / DICI
plus a subscribers table, an insert-only API route, and Brevo confirmations
(email + SMS). Nothing in the existing DICI flow (`app/page.tsx`,
`app/project/[projectId]`, `app/api/baba`, `app/api/projects/**`) was modified.

---

## 1. What was built

| File | Purpose |
|---|---|
| `app/updates/page.tsx` | New route `/updates`. Server component: page metadata + OG tags. |
| `app/updates/SignupForm.tsx` | Client component: branded form, inline validation, inline success state. Mobile-first, reuses the existing visual language (white/black, lime accent, `DYE CUT / LAB` wordmark, pill CTA). |
| `app/api/subscribers/route.ts` | `POST /api/subscribers`. Validates → saves to Supabase → sends Brevo confirmations. |
| `lib/subscribers.ts` | Shared email/phone validation + E.164 normalization + consent copy. Used by the form (client) and the route (server). |
| `lib/brevo.ts` | Server-only Brevo REST client (`/v3/smtp/email`, `/v3/transactionalSMS/send`, `/v3/contacts`) + on-brand HTML email template. |
| `supabase/migrations/20260925000000_create_subscribers.sql` | `subscribers` table, constraints, unique indexes, RLS (INSERT-only for `anon`/`authenticated`). |
| `.env.example` | Every environment variable, with where to get each value. |
| `.gitignore` | Added (the repo had none) so `.env*.local` can never be committed. |

Flow: form → `POST /api/subscribers` → validate → **insert into Supabase**
(source of truth, blocks the success state) → sync Brevo contact → send email
and/or SMS (best effort; failures are logged, never block success) → JSON
response drives the inline success panel.

Duplicate protection: unique indexes on `lower(email)` and `phone`; Postgres
`23505` is reported as "already subscribed" and **no confirmation is re-sent**
(so the form cannot be used to spam an existing contact). Plus a best-effort
in-memory throttle of 5 submissions / 10 minutes per IP (Vercel-set
`x-real-ip`, else the last `x-forwarded-for` hop) returning `429`.

---

## 2. Environment variables to set in Vercel

Set all of these for **Preview and Production** (Project → Settings →
Environment Variables). None of the Brevo values may carry a `NEXT_PUBLIC_`
prefix — they must stay server-only.

| Variable | Required | Notes |
|---|---|---|
| `BREVO_API_KEY` | **Yes** | Brevo → SMTP & API → API Keys (v3, `xkeysib-…`). Without it both confirmations are skipped (sign-up still saved). |
| `BREVO_SENDER_EMAIL` | **Yes for email** | Sender/domain verified in Brevo. Without it the email confirmation is skipped. |
| `BREVO_SENDER_NAME` | No | Defaults to `DYE CUT LAB`. |
| `BREVO_LIST_ID` | No | Numeric Brevo list id for new sign-ups. Optional: contacts still sync without it. |
| `BREVO_SMS_SENDER` | No | Defaults to `DYECUTLAB` (≤11 chars, letters/digits). Must be registered in Brevo; US carriers need a registered long/short code instead of an alphanumeric sender ID. |
| `BREVO_SMS_TYPE` | No | `marketing` (default) or `transactional`. See §4. |
| `NEXT_PUBLIC_SUPABASE_URL` | Already set | Unchanged. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Already set | Unchanged. |
| `OPENAI_API_KEY` | Already set | Unchanged — but see §6 (build fails without it). |

Locally: copy `.env.example` → `.env.local` and fill in the Brevo values.

---

## 3. Brevo opt-out handling — what we rely on (and what we don't)

Verified against Brevo's own API docs, not assumed:

- **SMS STOP → rely on Brevo.** Brevo handles opt-out keywords on its side, so
  we deliberately built **no custom STOP-reply webhook**. Important caveat from
  the SMS API reference: *including a stop code reclassifies the message from
  transactional to marketing*. That is why `BREVO_SMS_TYPE` defaults to
  `marketing` — the required copy ("Reply STOP to unsubscribe") makes Brevo
  treat it as marketing regardless. Consequences to confirm with the client:
  1. marketing SMS is not sent during restricted hours (per Brevo: 10pm–8am,
     Sundays, French public holidays; relevant to the account/settings);
  2. an opt-out is stored **in Brevo**, so `subscribers.unsubscribed_at` is not
     updated automatically. Mirroring STOP back into Supabase needs a Brevo
     event webhook — deferred to v2, and only worth building once someone is
     actively sending campaigns.
  If transactional behaviour is preferred instead, set
  `BREVO_SMS_TYPE=transactional` — but then Brevo does not process STOP for
  those messages, so a custom STOP flow would become necessary.
- **Email unsubscribe → Brevo's built-in flow is NOT sufficient.** Brevo's
  unsubscribe machinery applies to campaign emails; transactional email sent
  through `POST /v3/smtp/email` gets no automatic unsubscribe link or
  `List-Unsubscribe` header. So v1 uses an explicit "reply to this email to
  unsubscribe" line in the template plus staff-side opt-out handling in Brevo.
  A tokenized unsubscribe link (`unsubscribed_at` + a signed route) is deferred.
- **Opt-outs are never reversed by us:** contact sync does not send
  `emailBlacklisted` / `smsBlacklisted`, so a STOP or unsubscribe recorded in
  Brevo is never silently cleared by a new form submission.

**Contact sync:** new sign-ups are upserted into Brevo (`POST /v3/contacts`,
`updateEnabled: true`, `attributes.FNAME` and `attributes.SMS`, optional
`listIds`) at the same time as the Supabase insert. Supabase remains the source
of truth; Brevo is a mirror.

---

## 4. Assumptions to confirm with the client

1. **Route is `/updates`.** `/` is already the DICI chat flow, so the landing
   page could not take the root without touching that code (out of scope).
   If the client wants this at `/` (as the public front door, with the chat
   flow moved to something like `/start`), that is a follow-up routing change.
2. **Copy is new, not client-supplied.** Headline "GET PRODUCT UPDATES FIRST.",
   sub-line, and the success-state wording are first drafts written to match
   the existing tone. The SMS disclosure uses the exact sentence requested.
3. **SMS consent = providing a phone number + visible disclosure**, matching the
   spec's `sms_opt_in` default-true-if-phone rule. There is no separate checkbox
   (the existing `clients` capture does use one). If legal wants an affirmative
   checkbox, it is a small change to both the form and `lib/subscribers.ts`.
4. **Numbers without a country code are assumed US (+1)** and normalized to
   E.164 before saving (`9175550123` → `+1917550123`). Non-US visitors must
   include `+`. Consider a country selector if the audience is global.
5. **`BREVO_SMS_SENDER=DYECUTLAB`** because Brevo's docs restrict alphanumeric
   sender IDs to letters and digits (11 max) and US carriers require a
   registered long/short code. The real registered sender ID needs to come from
   the Brevo account before SMS can deliver.
6. **Extra compliance boilerplate** (e.g. "Msg frequency varies", "consent is
   not a condition of purchase") is *not* included — add it if counsel asks.
7. **Duplicate sign-ups are acknowledged but not merged** (see §5 limitations).

---

## 5. Explicitly out of scope for this v1

- Admin/staff view of subscribers, CSV export, segmentation, reporting.
- Analytics, UTM capture, A/B testing, CAPTCHA / bot protection.
- Double opt-in for email, and a tokenized unsubscribe link.
- Brevo event webhooks (delivered/bounce/unsubscribe/STOP) → mirroring
  `unsubscribed_at` back into Supabase.
- Merging a returning lead's second channel: if someone signs up with email
  first and later adds their phone, the insert hits the unique index and is
  treated as "already subscribed" — the phone is **not** merged. Fixing it needs
  a `SUPABASE_SERVICE_ROLE_KEY` server path (read + update), which was
  deliberately deferred so the public key stays INSERT-only.
- Distributed rate limiting (Upstash/Vercel KV). Current limiter is per
  serverless instance and best-effort.
- Any change to the existing DICI chat flow, project state machine, or routes.

---

## 6. Deployment

Preview first — do not promote straight to production.

1. **Apply the migration** (required before the page can work):
   `supabase db push` after `supabase link --project-ref <ref>`, or paste
   `supabase/migrations/20260925000000_create_subscribers.sql` into the Supabase
   SQL editor. Verify the table exists with RLS enabled and only an `INSERT`
   policy for `anon`.
2. **Set the Brevo env vars** in Vercel for *Preview* (see §2), and make sure
   the sender email/domain and SMS sender are verified in Brevo.
3. **Push a branch** (`git push origin <branch>`) or run `vercel deploy` — Vercel
   creates a preview URL. Review `/updates` on a phone viewport: empty-submit
   error, invalid email error, invalid phone error, email-only, phone-only,
   both, and the success panel.
4. **Smoke-test the preview:** submit a real email/phone you control and confirm
   the row in Supabase plus the Brevo confirmation (check Brevo → Transactional
   → Logs if the message does not arrive).
5. **Promote to production** only after sign-off, with the same env vars present
   in the Production scope.
6. `npm run build` requires `OPENAI_API_KEY` and the Supabase vars at build time
   (pre-existing module-scope clients in `app/api/baba/route.ts` and
   `lib/supabase.ts`). Missing values fail the build — pre-existing behaviour,
   not introduced here.

## 7. Verified locally

- `next build` (Next.js 16.3.1, Turbopack): **passes**, TypeScript clean,
  `/updates` prerendered static, `/api/subscribers` dynamic.
- ESLint on all new/changed files: **no problems**. (`app/page.tsx` and
  `app/project/[projectId]/page.tsx` still report pre-existing
  warnings/errors — untouched by this work.)
- Live HTTP checks against `next dev`:
  - `GET /updates` → `200`; page contains the exact SMS disclosure, the
    "add an email address, a mobile number, or both" hint, OPTIONAL labels and
    the page metadata.
  - `POST` with `{}` → `400` `{"errors":{"form":"Add an email address or a mobile number so we can reach you."}}`
  - `POST` bad email → `400` `{"errors":{"email":"Enter a valid email address, like you@brand.com."}}`
  - `POST` bad phone → `400` `{"errors":{"phone":"Enter a valid mobile number with country code, like +1 917 555 0123."}}`
  - `POST` non-JSON → `400` "We couldn't read that request."
  - `POST` valid phone/email with unreachable Supabase → `500` with a friendly
    JSON message and `SUBSCRIBER SAVE ERROR:` logged server-side (no HTML crash
    page, no false success).
  - 6th submission from the same IP → `429`.

## 8. Verified against the live Supabase project (after the migration)

Run against `https://hkwnztdopattlugxqxum.supabase.co` with the real publishable key:

| Check | Observed result |
|---|---|
| `GET /` (previously crashed with `supabaseUrl is required`) | `200` |
| `GET /updates` | `200`, `<title>Get DYE CUT LAB + DICI Updates</title>` |
| `POST` email-only, new lead | `200 {"ok":true,"alreadySubscribed":false,…}` — row written through the anon INSERT policy |
| `POST` same email as `CLINE-Test-Updates@EXAMPLE.com` | `alreadySubscribed:true` → lower-cased storage + case-insensitive unique index + `23505` handling all confirmed |
| `POST` phone `5555550123` (no country code) | written → normalized to `+15555550123` and accepted by the `subscribers_phone_format` check |
| `POST` that phone again as `+1 555 555 0123` | `alreadySubscribed:true` → phone normalization + unique index confirmed |
| `POST` invalid phone (`12`) | `400` with the inline phone message |
| anon `SELECT` on `subscribers` | `401`, Postgres `42501 permission denied for table subscribers` |
| anon `DELETE` / `PATCH` on `subscribers` | `401 42501` — writes beyond INSERT are impossible at the **grant** level, not merely RLS-filtered |
| duplicate POST after the delete attempt | still `alreadySubscribed:true`, so the 401s are real |
| Brevo channels | `"status":"skipped"` (no `BREVO_API_KEY` yet) — the designed fallback |

Two clearly-labelled test rows (`cline-test-updates@example.com` and
`+15555550123`) were created by this verification. Remove them with:

```sql
delete from public.subscribers
where email = 'cline-test-updates@example.com'
   or phone = '+15555550123';
```

## 9. Environment note (not a code change)

`node_modules` in this working copy came from a macOS archive, so two optional
native packages were missing and the CSS pipeline could not build on Windows.
Locally I ran `npm rebuild lightningcss @tailwindcss/oxide` plus
`npm install --no-save lightningcss-win32-x64-msvc @tailwindcss/oxide-win32-x64-msvc`
(package.json is unchanged). A clean `npm install` / `npm ci` on the machine
that deploys fixes this properly.

---

## 10. Redesign (Sep 2026) + ⚠️ "Text a keyword" flow is NOT wired up

The `/` landing page was restyled to the client's lime/black reference
(header, hero with stacked boxes, "Join Our Beta" panel, "Need Packaging
Now?" panel, trust row, footer). Files: `app/updates/LandingPage.tsx`,
`Icons.tsx`, hero image `public/Hero-section-image.png`; `SignupForm.tsx` keeps all of its logic and
now renders only the form. `HeroVisual.tsx` (old SaaS dashboard) was removed.

**The "Text JOIN / Text ORDER to (number)" pills are visual only.** They need,
before launch:

1. **A provisioned, SMS-capable number that receives inbound texts.** The
   current Brevo setup only *sends* (`/v3/transactionalSMS/send`) from an
   alphanumeric sender ID, which US carriers don't allow and which can't
   receive replies. US needs a registered 10DLC long code or toll-free number
   (A2P/10DLC or toll-free verification). Confirm whether the client's Brevo
   plan offers inbound numbers + keyword automation; if not, Twilio / Telnyx /
   Sinch etc. would handle inbound.
2. **Keyword automation:** `JOIN` → create/opt-in a subscriber (write to
   Supabase `subscribers` with `sms_opt_in`, `source = 'sms_keyword'`) and send
   the confirmation; `ORDER` → notify staff (email/Slack/CRM) and auto-reply.
   `STOP`/`HELP` must be handled by the provider or us. Likely an inbound
   webhook route (e.g. `app/api/sms/inbound/route.ts`) with signature
   verification — needs a service-role Supabase path, since the public key is
   INSERT-only.
3. **Compliance copy sign-off:** carriers typically require program name,
   message frequency, "Msg & data rates may apply", STOP/HELP, and links to
   Terms + Privacy near the CTA. Current copy is in `lib/smsKeywords.ts`.

**Current state:** the pills show the team's real number, (646) 991-6338
(`lib/contact.ts`), and are tappable `sms:` links (`SMS_NUMBER_ACCEPTS_TEXTS`).
Texts land on that phone and are handled **manually** — ORDER by replying,
JOIN by adding the contact to Brevo by hand. `SMS_KEYWORDS_LIVE = false`
keeps the web sign-up form open as the reliable way to join. Sending
recurring marketing texts to people who texted JOIN should wait for the US
toll-free registration in Brevo.

Other placeholders: Instagram/TikTok URLs (icons render unlinked), About/Contact
nav go to on-page anchors (no pages exist yet).

---

## 11. TEMPORARY "Start your project" page — `/start`

Stand-in for the DICI chat (`/app`) while it has active bugs. Every
"Start your project" link reads `START_PROJECT_HREF` in `lib/contact.ts`.
`/app` itself is untouched and still reachable directly.

- **Page:** `app/start/page.tsx` + `app/start/StartForm.tsx`. Reuses the
  landing page's header/menu, trust row and footer (`app/updates/SiteChrome.tsx`),
  icons/doodles (`Icons.tsx`), `PhoneField`, the Poppins font (`app/fonts.ts`)
  and the same form/button styles.
- **Data:** `POST /api/quote-requests` → validate (`lib/quoteRequests.ts`) →
  insert into **`quote_requests`** (separate from `subscribers`, INSERT-only
  RLS; migration `20260925010000_create_quote_requests.sql`) → staff alerts.
  Throttle 3 / 10 min per IP + hidden honeypot field.
- **Staff alert:** Brevo SMS to `STAFF_NOTIFY_PHONE` and Brevo email to
  `STAFF_NOTIFY_EMAIL` in parallel, defaulting to the client's contact
  details (+1 646 991 6338 / dyecutlab@gmail.com). If neither goes out the
  request is still saved and `QUOTE REQUEST STAFF NOT NOTIFIED` is logged.
  No automatic message goes to the customer.

**Before launch:** apply the migration (the table does not exist yet), set
`BREVO_API_KEY` + a verified `BREVO_SENDER_EMAIL`, and confirm the Brevo SMS
sender can deliver to a US number (alphanumeric sender IDs generally cannot).

**To remove:** set `START_PROJECT_HREF` back to `"/app"`, delete `app/start/`,
`app/api/quote-requests/` and `lib/quoteRequests.ts`, and the
`sendStaffQuote*` functions in `lib/brevo.ts`. Keep the table (real leads).
