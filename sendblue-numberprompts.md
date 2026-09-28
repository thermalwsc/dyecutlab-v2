# DYE CUT LAB: Sendblue Number + /start Page Prompts

Two prompts to run in order in your AI coding assistant (Claude Code, Cursor, etc.) with the repo open. Each prompt is self-contained, so paste one at a time and review the result before starting the next.

**The workflow being built:**
1. A customer types what they want made and their phone number on the website.
2. They tap the button and their own messages app opens, with a text already written and addressed to the Sendblue business number.
3. They tap send.
4. The team sees the text in Sendblue and replies from that same number, so customers never see the personal number.
5. Every request is also saved on the site, and staff get an email alert, so nothing is missed if the customer doesn't hit send.

**Order:**
1. Prompt 1: site-wide number swap
2. Prompt 2: `/start` page flow
3. Pre-deploy checklist (at the bottom)

---

# PROMPT 1: Site-Wide Number Swap (Personal Number to Sendblue Business Number)

## PROMPT

The client's personal phone number, (646) 991-6338, is currently public on the DYE CUT LAB site. He wants it removed and replaced everywhere with the Sendblue business line: **+14055635396** in E.164 form, **(405) 563-5396** for display.

Customers will now text this number, and staff will reply from Sendblue, so customers never see the personal number.

### 1. Find every occurrence first
Before editing, search the entire repo (source, comments, docs, notes files, `.env.example`, migrations, README) for: `646`, `991-6338`, `9916338`, `+16469916338`, and any other formatting of that number. List every hit in a short table (file, line, what it's used for) so it's clear what will change.

### 2. One source of truth
- Keep a single business-number constant, most likely in `lib/contact.ts`, holding the E.164 value and the display format. Everything else should read from it instead of hardcoding the number.
- Update the JOIN and ORDER `sms:` links (`lib/smsKeywords.ts` and the landing page) to use that constant. Keep the existing `sms:+14055635396?&body=JOIN` / `&body=ORDER` pattern.
- Update the visible number in the landing page pills ("Text JOIN to ..." and "Text ORDER to ...") and anywhere else the number is shown, including the footer and contact areas.

### 3. Consent and legal text
- Update any place in the SMS consent copy, `/privacy`, and `/terms` that shows or refers to the number so it matches the new one.
- Do not change the STOP/HELP wording or the meaning of the consent language. This is a number swap only.
- Update comments and notes files (for example `LANDING_PAGE_NOTES.md`) that mention the old number, so the personal number no longer appears anywhere in the repo.

### 4. Staff alert number must stay separate
- `STAFF_NOTIFY_PHONE` must be an explicit environment variable and must **never default to the public business number**. Sendblue would be texting itself and the alert would never arrive.
- If any code currently falls back to the public contact number for this, remove that fallback. When `STAFF_NOTIFY_PHONE` is unset, the staff text alert should return `skipped` with one log line (the same behavior as blank Sendblue credentials), and the Brevo email alert must still go out.
- Confirm the personal number is not hardcoded anywhere in source after this change. It should live only in environment variables.

### 5. Do not change
- Brevo email sending, sign-up form logic, the `subscribers` and quote request tables, or Sendblue send logic.
- The `/start` page flow. It is handled in Prompt 2.

### 6. Output
Summarize: the table of every place the old number was found, what each was changed to, confirmation that a final repo-wide search finds no remaining instances, and how `STAFF_NOTIFY_PHONE` now behaves when unset. Flag anything you were unsure about.

---

# PROMPT 2: /start Page, Customer Sends Their Request by Text to the Sendblue Number

## PROMPT

You are changing the temporary `/start` page ("Tell us what you're making") on the DYE CUT LAB site. Read the current `/start` page, the quote request API route, `lib/contact.ts`, `lib/smsKeywords.ts`, and `lib/sendblue.ts` before changing anything.

### The change
Today the form collects "What do you want made?" and "Your mobile number", then the button ("Text me back") saves the request and the team texts the customer first. That will not work reliably with Sendblue, which only lets a line message people who have texted it first. The client's decision: **the customer sends their request by text to the Sendblue business number instead.**

New flow:
1. The customer fills in "What do you want made?" and "Your mobile number" (keep both fields and their validation).
2. They tap the button. The site first saves the quote request exactly as it does now (Supabase insert, staff notification), so no lead is lost even if the customer never sends the text.
3. The customer's own messaging app then opens, addressed to the Sendblue business number, with a prefilled message containing what they typed and their mobile number.
4. The customer taps send. Because they texted first, staff can reply freely from Sendblue.

### Requirements
- **Number source:** read the public business number from the single constant set up in Prompt 1 (the Sendblue line, `+14055635396`). Do not use the personal (646) number anywhere on this page.
- **Prefilled message:** something like `New project: {description} | My number: {phone}`. Build the link with `encodeURIComponent` and use the `sms:+14055635396?&body=...` form already used elsewhere on the site, since it works on both iPhone and Android. The description field allows up to 1000 characters and long `sms:` bodies can fail on some devices, so truncate the prefilled text to a safe length (around 300 characters) and note in the message that the full request was saved on the site.
- **Reliability on iPhone:** browsers can block navigation to `sms:` after an async request. After the save succeeds, show a confirmation state with a real anchor button (`<a href="sms:...">`) labeled clearly, for example "Open Messages to send it", and only optionally try to open it automatically. The anchor is the main path.
- **Desktop fallback:** `sms:` links do nothing on most desktop browsers. Detect this reasonably (or just always include it) and show the business number plus a "Copy message" button so desktop visitors can send it from their phone.
- **Button and copy:** replace "Text me back" with wording that matches the new flow, for example "Send it by text". Update the sub-copy that currently says "Gilbert from our team texts you back" since the customer now texts in. Keep the "real human, no bots" tone. Use "our team" instead of a personal name. Update the confirmation copy too, and keep the STOP/HELP consent text and links to Terms and Privacy. Put all changed copy in one place and list it in your summary so the client can approve it.
- **Confirmation state:** show the number they will be texting, so it's recognizable. Match the existing brand styling (black, white, lime, rounded pill buttons); do not introduce new components.

### Do not change
- The quote request table, validation rules, or rate limiting
- Brevo email alerts to staff
- `STAFF_NOTIFY_PHONE`: it must stay an explicit env var and must never default to the public business number, or the staff alert would send from Sendblue to itself
- Sendblue staff-alert logic, unless something breaks because of the changes above

### Output
Summarize: what changed on the page, the final prefilled message format and truncation limit, how iPhone and desktop are handled, every line of copy that changed, and anything you were unsure about. Then list what to test on real devices: iPhone, Android, and desktop.

---

# PRE-DEPLOY CHECKLIST

## Environment variables
Add these in `.env.local` **and** in Vercel (Preview and Production), then redeploy. All are server-only, never `NEXT_PUBLIC_`.

- [ ] `SENDBLUE_API_KEY_ID`
- [ ] `SENDBLUE_API_KEY_SECRET`
- [ ] `SENDBLUE_FROM_NUMBER=+14055635396`
- [ ] `STAFF_NOTIFY_PHONE` set explicitly (a phone that is a verified contact in Sendblue). It cannot be the Sendblue number itself.
- [ ] Restart the dev server after editing `.env.local`

## Verify Sendblue works
- [ ] Text the Sendblue number from a personal phone and confirm the message appears in the Sendblue dashboard
- [ ] Confirm you can reply from the dashboard and it arrives on the phone
- [ ] Send a test message from the Sendblue Playground and confirm it is received
- [ ] If a real send fails, check the base URL in `lib/sendblue.ts` (`api.sendblue.com` vs. the `api.sendblue.co` shown in the dashboard)

## Test the site on real devices
- [ ] iPhone: `/start` form saves, the confirmation appears, "Open Messages" opens Messages with the text prefilled, and it sends as iMessage
- [ ] Android: same flow, sends as SMS
- [ ] Desktop: the number and "Copy message" button appear
- [ ] A long description (over 300 characters) is trimmed in the text but fully saved in the database
- [ ] The JOIN and ORDER buttons on the landing page open a text to the new number
- [ ] A staff email alert arrives for each test request

## Clean-up checks
- [ ] Repo-wide search finds no remaining `646` / `991-6338` number
- [ ] Privacy, Terms, and SMS consent text show the correct number
- [ ] Carrier registration form matches the Sendblue number

## Still waiting on the client
- [ ] Approval of the changed `/start` copy
- [ ] Who on his team checks Sendblue for new texts, or whether he wants each new text forwarded to email
- [ ] Whether he plans to text customers first later (needs a dedicated Sendblue line)

## Later (not part of this phase)
- Admin inbox that shows Sendblue conversations and lets staff reply from your own admin panel. This needs authentication first and fits with the admin panel in the 12-week plan.
