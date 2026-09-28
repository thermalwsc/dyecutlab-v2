# Landing page + sign-up flow — `/updates` (v1)

**Scope of this change:** a standalone lead-capture page for DYE CUT LAB / DICI
plus a subscribers table, an insert-only API route, and confirmations (Brevo
email + Sendblue SMS — see §12 for the SMS provider swap). Nothing in the
existing DICI flow (`app/page.tsx`, `app/project/[projectId]`, `app/api/baba`,
`app/api/projects/**`) was modified.

---

## 1. What was built

| File | Purpose |
|---|---|
| `app/updates/page.tsx` | New route `/updates`. Server component: page metadata + OG tags. |
| `app/updates/SignupForm.tsx` | Client component: branded form, inline validation, inline success state. Mobile-first, reuses the existing visual language (white/black, lime accent, `DYE CUT / LAB` wordmark, pill CTA). |
| `app/api/subscribers/route.ts` | `POST /api/subscribers`. Validates → saves to Supabase → sends the Brevo confirmation email + staff email. No SMS (email-only form). |
| `lib/subscribers.ts` | Shared email/phone validation + E.164 normalization + consent copy. Used by the form (client) and the route (server). |
| `lib/brevo.ts` | Server-only Brevo REST client for **email** (`/v3/smtp/email`, `/v3/contacts`) + on-brand HTML email template. |
| `lib/sendblue.ts` | Server-only Sendblue REST client for **SMS / iMessage** (`/api/send-message`). Replaced Brevo SMS — see §12. |
| `lib/channels.ts` | The `ChannelResult` / `ChannelStatus` contract both notification providers report through. |
| `supabase/migrations/20260925000000_create_subscribers.sql` | `subscribers` table, constraints, unique indexes, RLS (INSERT-only for `anon`/`authenticated`). |
| `.env.example` | Every environment variable, with where to get each value. |
| `.gitignore` | Added (the repo had none) so `.env*.local` can never be committed. |

Flow: form → `POST /api/subscribers` → validate → **insert into Supabase**
(source of truth, blocks the success state) → sync Brevo contact → send the
confirmation email (best effort; failures are logged, never block success) →
JSON response drives the inline success panel. **No SMS is sent from this
route**: the form collects an email only (the phone field was removed in
`fb0fb1c`), so an email is the only channel available.

Duplicate protection: unique indexes on `lower(email)` and `phone`; Postgres
`23505` is reported as "already subscribed" and **no confirmation is re-sent**
(so the form cannot be used to spam an existing contact). Plus a best-effort
in-memory throttle of 5 submissions / 10 minutes per IP (Vercel-set
`x-real-ip`, else the last `x-forwarded-for` hop) returning `429`.

---

## 2. Environment variables to set in Vercel

Set all of these for **Preview and Production** (Project → Settings →
Environment Variables). None of the Brevo or Sendblue values may carry a
`NEXT_PUBLIC_` prefix — they must stay server-only.

| Variable | Required | Notes |
|---|---|---|
| `BREVO_API_KEY` | **Yes** | Brevo → SMTP & API → API Keys (v3, `xkeysib-…`). Without it both confirmations are skipped (sign-up still saved). |
| `BREVO_SENDER_EMAIL` | **Yes for email** | Sender/domain verified in Brevo. Without it the email confirmation is skipped. |
| `BREVO_SENDER_NAME` | No | Defaults to `DYE CUT LAB`. |
| `BREVO_LIST_ID` | No | Numeric Brevo list id for new sign-ups. Optional: contacts still sync without it. |
| `SENDBLUE_API_KEY_ID` | **Yes for SMS** | Sendblue dashboard → Developer → API keys (or `sendblue show-keys`). Sent as the `sb-api-key-id` header. Without it, texts are skipped (nothing else breaks). |
| `SENDBLUE_API_KEY_SECRET` | **Yes for SMS** | Same place; sent as `sb-api-secret-key`. |
| `SENDBLUE_FROM_NUMBER` | **Yes for SMS** | A phone line **on the Sendblue account**, E.164 (`sendblue lines` / `GET /api/lines`). The API requires `from_number` on every send. Set to the Sendblue business line `+14055635396` — the same number stored publicly in `lib/contact.ts`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Already set | Unchanged. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Already set | Unchanged. |
| `OPENAI_API_KEY` | Already set | Unchanged — but see §6 (build fails without it). |

Locally: copy `.env.example` → `.env.local` and fill in the Brevo (email) and
Sendblue (SMS) values. `BREVO_SMS_SENDER` and `BREVO_SMS_TYPE` were **removed**
with the Sendblue swap — no code reads them any more (§12).

---

## 3. Opt-out handling — what we rely on (and what we don't)

Verified against each provider's own API docs, not assumed (the Sendblue facts
were re-checked when SMS moved off Brevo — see §12):

- **SMS STOP → rely on Sendblue.** Sendblue detects the standard opt-out
  keywords on its side (`stop`, `unsubscribe`, `cancel`, `opt out`, `revoke`,
  `end`, `quit`; `start` opts back in — Sendblue Security & Compliance docs)
  and **blocks outbound messages to an opted-out number**, so we still build
  **no custom STOP-reply webhook**. Consequences to confirm with the client:
  1. an opt-out is stored **in Sendblue**, so `subscribers.unsubscribed_at` is
     not updated automatically. Mirroring STOP into Supabase needs a webhook on
     Sendblue's `receive` event (its payload carries `opted_out`) plus a
     service-role Supabase path — deferred to v2, see §12;
  2. opt-out can also be set/cleared by us directly with
     `POST /api/v2/contacts/opt-out` (`opted_out: false` opts a contact back in);
  3. the only text our own code sends today is the internal staff alert (§11)
     and staff are not a marketing audience, so no customer-facing STOP flow is
     exercised yet — the customer-facing program is still the manual
     "Text JOIN" flow (§10).
- **Email unsubscribe → Brevo's built-in flow is NOT sufficient.** Brevo's
  unsubscribe machinery applies to campaign emails; transactional email sent
  through `POST /v3/smtp/email` gets no automatic unsubscribe link or
  `List-Unsubscribe` header. So v1 uses an explicit "reply to this email to
  unsubscribe" line in the template plus staff-side opt-out handling in Brevo.
  A tokenized unsubscribe link (`unsubscribed_at` + a signed route) is deferred.
- **Opt-outs are never reversed by us:** contact sync does not send
  `emailBlacklisted` / `smsBlacklisted`, so an unsubscribe recorded in Brevo
  (email) or a STOP recorded in Sendblue (SMS) is never silently cleared by a
  new form submission.

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
5. **Sendblue plan + verified contacts.** Sendblue only messages a contact that
   has texted its line first: free shared-line accounts require the recipient to
   be a *verified contact*, and on every plan outbound sends to a contact who
   has never replied are limited ("before the first reply"). The staff alert
   (§11) therefore needs staff to open the thread from the Sendblue line once,
   and any future customer-facing SMS needs a dedicated / Blue Ocean line that
   allows outbound-initiated sending. Confirm the plan with the client before
   texts are relied on for delivery — see §12.
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

1. **A provisioned number that receives inbound texts.** Sendblue (the SMS
   provider since §12) assigns its own line that can both send and receive, and
   its inbound `receive` webhook would carry `JOIN` / `ORDER`. Two caveats:
   `from_number` must be a Sendblue number (the public (405) 563-5396 line is a
   Sendblue line, so the pills address it directly), and on the free shared-line plan a
   recipient has to text that line once before it can be messaged at all.
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

**Current state:** the pills show the Sendblue business line, (405) 563-5396
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
- **Staff alert:** Sendblue SMS (`lib/sendblue.ts` → `POST /api/send-message`,
  from `SENDBLUE_FROM_NUMBER`) to   `STAFF_NOTIFY_PHONE` + Brevo email to
  `STAFF_NOTIFY_EMAIL` in parallel. The email defaults to
  dyecutlab@gmail.com; the SMS has no default and is skipped when
  `STAFF_NOTIFY_PHONE` is unset. If neither goes out the
  request is still saved and `QUOTE REQUEST STAFF NOT NOTIFIED` is logged.
  No automatic message goes to the customer.

**Before launch:** apply the migration (the table does not exist yet), set
`BREVO_API_KEY` + a verified `BREVO_SENDER_EMAIL` for the email alert, set
`SENDBLUE_API_KEY_ID` / `SENDBLUE_API_KEY_SECRET` / `SENDBLUE_FROM_NUMBER` for
the text alert, and **send a real test text from the Sendblue line** — the
staff number must have texted that line once, or the send is refused (§12).

**To remove:** set `START_PROJECT_HREF` back to `"/app"`, delete `app/start/`,
`app/api/quote-requests/` and `lib/quoteRequests.ts`, and the
`sendStaffQuoteEmail` function in `lib/brevo.ts` plus `sendStaffQuoteSms` in
`lib/sendblue.ts`. Keep the table (real leads).

---

## 12. SMS provider swap — Brevo → Sendblue

**Why:** most DYE CUT LAB customers are on iPhone, and Sendblue delivers as a
native iMessage (blue bubble) instead of a generic SMS, which reads as more
trustworthy to recipients.

### 12.1 What actually sent SMS before

There was exactly **one** Brevo SMS call path in the codebase:

| Where | Trigger | Old call | Now |
|---|---|---|---|
| `app/api/quote-requests/route.ts` | a `/start` quote request is saved | `sendStaffQuoteSms()` → `POST https://api.brevo.com/v3/transactionalSMS/send` (alphanumeric sender `BREVO_SMS_SENDER`) | `sendStaffQuoteSms()` in `lib/sendblue.ts` → `POST https://api.sendblue.com/api/send-message` |

**There is no sign-up confirmation SMS** — and there cannot be one: the landing
page form collects an email only (`SignupForm.tsx`; the mobile field was removed
in `fb0fb1c`), `validateSignup()` rejects a phone, and `/api/subscribers` writes
`sms_opt_in: false`. Both the subscriber confirmation and the staff sign-up
alert are **email only**. If the client wants a text confirmation on sign-up,
that is new feature work (phone field + consent copy + `sms_opt_in`), not part
of this swap.

Nothing else in the repo sends a text: the "Text JOIN / Text ORDER" pills open
the visitor's own SMS app (`lib/smsKeywords.ts`), and every other message is
email (Brevo `/v3/smtp/email`) — untouched.

### 12.2 The split

| Provider | Owns | File |
|---|---|---|
| Brevo | **Email only** — subscriber confirmation, staff sign-up alert, staff quote alert, contact mirror (`/v3/contacts`) | `lib/brevo.ts` |
| Sendblue | **SMS / iMessage only** — staff quote alert | `lib/sendblue.ts` |
| — | shared `ChannelResult` / `ChannelStatus` contract | `lib/channels.ts` |

Both providers keep the original contract: a failure is **logged and returned as
a status, never thrown**, so `QUOTE REQUEST STAFF NOT NOTIFIED` is the worst
case and the quote request is still saved (the route already logs that when
neither alert goes out). Message copy is unchanged.


### 12.3 Sendblue API facts (read from docs.sendblue.com, not guessed)

- **Send:** `POST https://api.sendblue.com/api/send-message`
  headers `sb-api-key-id` + `sb-api-secret-key`, body
  `{ number, from_number, content }`. `number` and `from_number` are E.164;
  `from_number` is **required** and must be a line on the account. Calls must
  come from a backend (browser-originated calls are blocked).
- **Response:** the message object — `status` (`QUEUED` / `ACCEPTED` / `SENT` /
  `DELIVERED` / `ERROR`), `error_code`, `error_message`, `message_handle`,
  `service` (`iMessage` | `sms`), `was_downgraded`. Per the docs *"any code
  besides 0 or null is a failure"*, and `status: "ERROR"` is terminal.
- **Status lookup:** `GET https://api.sendblue.com/api/status?handle=<handle>`
  (the code logs the handle on success so a send can be traced later).
- **Errors:** 429 = rate/burst limit (10 messages/sec/line); 400 = validation.
  Documented codes include `4000` validation, `4001` rate limit, `4002`
  blacklisted number, `5509` window exceeded, `10001` failed to send,
  `SMS_LIMIT_REACHED`.
- **Docs inconsistency to be aware of:** newer pages and the agent-facing
  `llms.txt` use `api.sendblue.com`; some older curl samples in the reference
  still show `api.sendblue.co`. The code uses **`api.sendblue.com`**.

### 12.4 Fallback for non-iMessage recipients — automatic

Sendblue docs (FAQ + Sending messages): *"If the recipient of one of your
messages doesn't have iMessage enabled we will automatically fall back to
sending the message through SMS at no extra cost."* Downgrades are visible in
the response as `service: "sms"` and `was_downgraded: true`; there is **no way
to disable** the downgrade. So Android / SMS-only recipients are covered without
extra code — only the iMessage-only features (App Cards, inline replies) would
not fall back, and neither is used here.



### 12.5 Compliance — opt-in copy stays, STOP is Sendblue's job

- Consent copy is unchanged and still applies: `lib/smsKeywords.ts` (JOIN
  disclosure), `lib/quoteRequests.ts` (`QUOTE_SMS_CONSENT_COPY` on `/start`),
  and the footer links to `/privacy` + `/terms#sms` (STOP / HELP wording).
- Sendblue has **built-in opt-out detection** (`stop`, `unsubscribe`, `cancel`,
  `opt out`, `revoke`, `end`, `quit`; `start` opts back in) and **blocks
  outbound sends to an opted-out number**, so the STOP promise in our copy is
  enforced by the provider — the same posture as with Brevo. No manual opt-out
  engine had to be rebuilt. `POST /api/v2/contacts/opt-out` can also set/clear
  it programmatically.
- **Not built:** mirroring STOP into `subscribers.unsubscribed_at`. That needs
  a `receive` webhook route (the payload carries `opted_out`) plus a
  service-role Supabase path, and it stays deferred exactly as it was under
  Brevo. The column exists and remains `NULL` until then.
- The only text our own code sends is the **internal staff alert**, so no
  customer-facing STOP flow is exercised by this swap yet. Customer texts to
  the (405) 563-5396 number land in Sendblue and are replied to from there.

### 12.6 Environment variables

| Variable | Required | Where to add | Notes |
|---|---|---|---|
| `SENDBLUE_API_KEY_ID` | Yes for SMS | `.env.local` + Vercel (Preview **and** Production) | Sendblue dashboard → Developer → API keys, or `sendblue show-keys`. Server-only. |
| `SENDBLUE_API_KEY_SECRET` | Yes for SMS | same | Sent as the `sb-api-secret-key` header. |
| `SENDBLUE_FROM_NUMBER` | Yes for SMS | same | A Sendblue-owned line in E.164 (`sendblue lines` / `GET /api/lines`). Set to `+14055635396` — the public business line in `lib/contact.ts`. |
| `STAFF_NOTIFY_PHONE` | No | same | Explicit env var only — no default (when unset the staff SMS returns `skipped` and only email goes out). Must not be the Sendblue line itself; must be a number that has texted the Sendblue line. |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_LIST_ID` | **Keep** | unchanged | Email + contact mirror. Do not delete. |
| `BREVO_SMS_SENDER`, `BREVO_SMS_TYPE` | **Removed / unused** | — | Safe to delete from `.env.local` and Vercel: no code reads them any more (they were never read for `type` — it was hardcoded `transactional`). |

Blank Sendblue values behave the way blank Brevo values always did:
`status: "skipped"`, one log line, and the quote request is still saved.

### 12.7 Open items / flagged uncertainty

1. **Sendblue plan prerequisites — the biggest risk.** `from_number` must be a
   Sendblue line, and Sendblue only messages a contact who has texted that line
   first (free shared-line plans require a verified contact; on every plan,
   outbound to a contact who has never replied is limited — see "before the
   first reply" in `docs.sendblue.com/limits`, with `pre_reply_override` as the
   documented one-off escape hatch). **The staff alert will not deliver until
   staff texts the Sendblue line once.** Outbound-initiated customer messaging
   needs a dedicated / Blue Ocean line (50 new contacts/day/line, 15/hour).
   The exact error returned for a blocked, pre-reply send is not documented on
   the pages we read — it will surface as a `status: "ERROR"` response and land
   in the `Sendblue error …` log line.
2. **Not yet tested against a real phone.** Implemented from the docs and
   type-checked/linted, with no live Sendblue credentials available. Set the
   three variables and submit a real `/start` request (or call `sendSms`
   directly) before calling this done; verify a blue-bubble iMessage to an
   iPhone **and** a fallback message to an Android / iMessage-disabled number.
3. **No delivery webhook.** `QUEUED` only means Sendblue accepted the message.
   Delivery is not tracked in our system (same as with Brevo SMS); the Sendblue
   dashboard and `GET /api/status?handle=…` are the only views.
4. **`syncBrevoContact()` still writes `attributes.SMS`** when a phone is
   passed. It is always `null` today (no phone is collected) and it is contact
   data rather than an SMS send, so it was left untouched.
5. **Staff phone resolution lives only in `lib/sendblue.ts`** (`getStaffPhone()`,
   explicit `STAFF_NOTIFY_PHONE` with no default). `lib/brevo.ts` resolves only
   the staff email.


### 12.8 Verified locally at the time of the swap

- `npx tsc --noEmit` → exit 0; `npx eslint` on every changed file → clean.
- `next dev` (port 3123) → `GET /start` 200; `POST /api/quote-requests` with an
  invalid phone → 400 with the per-field error, i.e. the route graph loads with
  the new `lib/sendblue.ts` import and no server-side error. No row was written
  and no message was sent (that request is rejected before the insert).
- The Sendblue client was exercised directly (throwaway harness, then deleted):
  missing key pair → `skipped`; missing `SENDBLUE_FROM_NUMBER` → `skipped`; live
  endpoint with intentionally wrong keys → `failed: "Sendblue /api/send-message
  responded 401: {\"status\":\"ERROR\",\"message\":\"Invalid Credentials\"}"`.
  That last case confirmed the real base URL, the auth header names and the
  non-throwing error path — with no message deliverable.
- **Still to do (needs real credentials + a real phone):** one genuine send to
  an iPhone (expect a blue-bubble iMessage) and one to a non-iMessage number
  (expect SMS fallback with `was_downgraded: true` in the response/log).


---

## 13. Sign-in (Supabase Auth) — Google, Apple, email link

Week 1 of the 12-week plan. Customers sign in at `/signin`; the header shows
**Sign in** (or the user's initial → `/account` when signed in).

| File | Purpose |
|---|---|
| `app/signin/page.tsx` + `SignInCard.tsx` | Branded sign-in: Continue with Google / Apple, or an email sign-in link. Providers that are off in Supabase show "Coming soon" instead of an error page. |
| `app/auth/callback/route.ts` | Where Google/Apple/email links land; exchanges the code for a session cookie, then redirects to `next` (own paths only). |
| `app/auth/signout/route.ts` | POST-only sign-out. |
| `app/account/page.tsx` | Signed-in landing page (server-checked with `getUser()`). |
| `proxy.ts` | Next 16 Proxy: refreshes the session cookie; sends signed-out visitors from `/account` to `/signin`. |
| `lib/supabase/browser.ts`, `lib/supabase/server.ts` | `@supabase/ssr` clients (cookie-based sessions). |
| `supabase/migrations/20260928000000_create_profiles.sql` | `profiles` table: name + role (`customer` / `staff` / `factory`), auto-created on first sign-in; users can't change their own role. |

**Supabase dashboard setup (required):**
1. Run the profiles migration in the SQL editor.
2. Authentication → URL Configuration: Site URL `https://www.dyecutlab.com`;
   Redirect URLs `http://localhost:3000/auth/callback`,
   `https://www.dyecutlab.com/auth/callback`, `https://dyecutlab.com/auth/callback`
   (+ the Vercel preview domain pattern if testing previews).
3. Google: Google Cloud Console → OAuth client (Web). Authorized redirect URI =
   `https://<project-ref>.supabase.co/auth/v1/callback`. Paste client ID/secret into
   Authentication → Providers → Google.
4. Apple: needs an Apple Developer Program membership. Create a Services ID +
   Sign in with Apple key; paste into Authentication → Providers → Apple. The
   generated client secret expires every 6 months — calendar a renewal.
5. Email links use Supabase's built-in mailer, which is heavily rate-limited;
   set a custom SMTP (e.g. Brevo SMTP) under Authentication → SMTP before launch.

**Not done yet (plan week 1–2):** linking existing `clients`/`projects` rows to
accounts, owner-scoped RLS on project tables, staff/factory pages.
