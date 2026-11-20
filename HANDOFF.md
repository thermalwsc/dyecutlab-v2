# Handoff: DYE CUT LAB (read this first)

Written Thu Nov 19, 2026, mid week 8. Everything below was true at that moment; check `git log` and the live
site before trusting any line. `AGENTS.md` still applies: this is NOT the Next.js you know, read
`node_modules/next/dist/docs/` before writing Next code.

## Who and what
- The user is the solo developer. The client is Gilbert (Dye Cut Lab LLC). The product is DYE CUT LAB with DICI:
  custom packaging, customer chat, quotes, factory portal, payments.
- Repo `G:\DYECUTLAB`: Next.js 16 (App Router, server actions, route handlers, `proxy.ts`), Supabase (Auth, Postgres, RLS),
  Tailwind v4. Live at https://www.dyecutlab.com (Vercel).
- 12-week plan ends Fri Dec 18, 2026. Weeks 1 to 7 are done. **Week 8 (payments, Nov 16 to 20) is in progress.**
- Work files outside the repo (all in `F:\DYECUTLAB-Work\`): plan page `12-Week-Plan\index.html`, task log
  `TaskLogHTML\index.html`, invoices `Invoice\invoice-00N.html` and PDFs, the blueprint `DYE_CUT_LAB_DICI_Pitch_Blueprint.pdf`.
  The user deploys the plan page and task log to Netlify themselves.

## Standing rules (from the user)
- Keep the Supabase service role key server-only. Never `NEXT_PUBLIC_`, never commit it, never paste it in chat.
- Never ask for or paste API keys, tokens or passwords in chat. The user puts them only in `.env.local` and Vercel.
  To check a setting, print its NAME and LENGTH only (an `awk` over `.env.local`), never the value.
- Do NOT run SQL against the live database. Give migration and check files; the user pastes them in the Supabase SQL editor.
  Every new table follows the pattern: RLS on, "team only" through `is_dcl_team()`, factory through `my_factory_id()`,
  owner policies, rolled-back SQL check in `supabase/tests/` that ends in a deliberate error whose message is the report.
- Stop and ask before deleting files, changing existing RLS policies, or anything irreversible.
- Commit ONLY when the user asks. The user runs `git push` themselves. Never `git stash`. Never commit
  `supabase/maintenance/` (untracked on purpose). Commit messages end with the Co-Authored-By line from the system reminder;
  avoid apostrophes in commit messages (Bash heredoc quirk).
- Never sign in or enter credentials for the user. The user signs in themselves in the Browser pane, one role at a time
  (admin, factory, customer). Say who to sign in as and wait.
- Do not click Brevo's "Activate for SMTP keys" (IP blocking would break Supabase sending).
- Client-facing messages: short, plain, polite. The user sends them themselves on WhatsApp.
- Task log rule: technical entries only (not plan updates, message drafting, design proposals). One invoice per week,
  never rolled together: week 8 = INV-2026-008 (dated Mon Nov 23). Hours so far are 5 per day.
- Memory notes live in `C:\Users\Administrator\.claude\projects\G--DYECUTLAB\memory\` (invoices-per-week,
  task-log-technical-only, payments-square-terms).

## What exists (do not rebuild)
Roles: customer, dcl_staff, dcl_admin, factory. Stages: lead, development, quote_ready, factory_review, approved,
payment, proof, production, qc, shipping, delivered.
- Quoting: pricing tables (team only), `lib/estimate.ts`, quote versions (`kind` estimate or verified), PDF.
  Four factory product prices are entered from Gilbert's documents. Margin rules table is EMPTY on purpose.
  Estimates stay hidden from customers (`ESTIMATES_IN_APP=false` in `lib/siteFlags.ts`).
- Factory flow: factory quotes, team approve (saves a verified quote hidden until the team shows it, moves factory_review
  to approved), change notes, team email on quote arrival.
- Week 7 bilingual layer (English and Chinese): `factory_messages` thread, AI translation with a number guard
  (`lib/translationGuard.ts`, `translationPrompt.ts`, `factoryThread*.ts`), Chinese factory portal (`lib/factoryI18n.ts`,
  switch via cookie), translation corrections table and UI. All tested live.
- Google sign-in always shows the account picker (`app/signin/SignInCard.tsx`).

## Week 8: payments with Square (the client chose Square, not Stripe)
Terms: **50% deposit** when the quote is approved (project moves to Proof once it clears), the other **50% before shipping**.
Base amount = verified quote `sell_total` (shipping excluded). Deposit = half rounded up, balance = the rest.
Build and test in the **Square sandbox of the developer's own account**. The client's live account and credentials come
later (he is still verifying his Square account); never ask him for a login.

### Done and proven
- Mon: `supabase/migrations/20261116000000_payments.sql` (tables `payments`, `payment_events`, function
  `record_payment_event`), check `supabase/tests/payments_checks.sql` (44 lines PASS, applied live).
  Pure rules in `lib/payments.ts` (split, `nextPayment`, `balancePaid`).
- Tue: deposit checkout. `lib/squarePayments.ts` (pure request/response), `lib/squareClient.ts` (server, token),
  `lib/paymentContext.ts`, `lib/paymentStartServer.ts`, `app/api/projects/[projectId]/payments/route.ts` (GET and POST),
  `app/project/[projectId]/PaymentCard.tsx` on the customer page. Hidden unless `PAYMENTS_ENABLED=true` and Square is
  configured. Proven against the sandbox: the $500.00 deposit link opened Square's sandbox panel and came back to the site.
  Square rejects reserved email domains for the prefill, so the client retries once without the email.
- Wed: `app/api/square/webhook/route.ts` + `lib/squareNotify.ts` (decision logic), `lib/squareWebhook.ts` (HMAC check:
  base64 HMAC-SHA256 of notification URL + raw body, header `x-square-hmacsha256-signature`), emails
  `lib/paymentEmail.ts`, `lib/paymentAlerts.ts`, senders in `lib/brevo.ts`. Live route proven: wrong signature 403; a signed
  $500.00 notification (sent by me with the real key) marked the deposit paid, moved the project to Proof, and both emails
  arrived (customer receipt, team alert). Replays, duplicate event ids and a wrong amount behave correctly.
- Env (names only): `SQUARE_ENVIRONMENT`, `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `PAYMENTS_ENABLED` (local only),
  `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_URL=https://www.dyecutlab.com/api/square/webhook` (local and Vercel).
  `PAYMENTS_ENABLED` is deliberately NOT set on Vercel, so live customers see no Pay button.
- Square sandbox webhook subscription exists (payment.created, payment.updated). API version 2026-09-16.

### Not yet proven
- A notification that **Square itself** sends (all webhook tests so far were signed by me). Prove it with a real sandbox
  payment through Square's "Checkout API Sandbox Testing Panel" (Next, then Test Payment).
- The customer card showing "Paid" (needs the customer signed in). The data is right: the team alert said Proof.

### To do (Thursday Nov 19 and Friday Nov 20)
1. Balance: customer "Pay the balance" once the project is in production or qc (`BALANCE_OPEN_STATUSES` in
   `lib/payments.ts`); the real Square-sent webhook test goes here. To set it up an admin moves the test project proof to production.
2. Shipping gate: the factory's "Mark as shipped" (`moveFactoryProject` in `app/factory/actions.ts`, steps in
   `lib/factoryWork.ts` FACTORY_MOVES) is refused until `balancePaid`. ASSUMPTION the user has not contradicted; mention it.
3. Receipts and payment history on the customer page (card has history) and a **Payments panel for the team** on
   `app/admin/projects/[id]/page.tsx` (read-only, from `payments`).
4. Failed or cancelled payment UX (customer sees "Did not go through" and can retry; already partly there).
5. Fri: full sandbox run as customer, team and factory; edge cases (cancel, pay twice, repeated notification); then plan page,
   task log (Days 39 to 43, technical only, 5 h each), invoice INV-2026-008, a go-live checklist (client's verified Square
   account and live credentials, `PAYMENTS_ENABLED` on Vercel, production webhook subscription, switch `SQUARE_ENVIRONMENT`).
6. `PLAN.md` and the plan page already say Square; update statuses at the end of the week.

## State of the database and repo
- Test data still in the live database: project **DCL-00113** (owner `ghianladislao1@gmail.com`, Test Factory, verified quote
  $1,000.00, deposit PAID via simulated notification, project at Proof). Delete it when week 8 testing is over (admin only:
  project page, Delete). Margin rules are empty (the temporary one was deleted; never leave one in the live DB).
- Git: everything is committed and pushed through `a283619`. Untracked: `supabase/maintenance/` (leave) and this file.
- Checks: `npm test` (389 passing), `npx tsc --noEmit`, `npx eslint` (only 5 old warnings in `app/app/page.tsx` and
  `app/project/[projectId]/page.tsx`).

## Open items waiting on other people
- Gilbert: his Square account verification; answers to phase 2 questions (which products, dielines format, who fills the spec,
  does the factory confirm each point); a US cell number for `STAFF_NOTIFY_PHONE`; a partner factory (week 6 real test).
- Phase 2 (an MRCH-style visual spec pack with numbered callouts, factory confirmation, sign-off, link with no login) is NEW
  scope, not in the blueprint; the user will send a scope and hours estimate after Dec 18 (rough guess 3 to 4 weeks).
- Risk to raise with Gilbert: payment providers can restrict cannabis-adjacent businesses; his Square account may need
  approval for online payments.

## Tooling quirks that cost time
- Windows. Bash heredocs with apostrophes fail: use the Write and Edit tools (or Python from a file). Python reading files with
  CJK needs UTF-8 output; use `python -I` and write to a file then Read it.
- Browser pane: clicks on forms sometimes do not submit; use `form.requestSubmit()` through `javascript_tool`. The tool blocks
  returning anything containing `location.search` or query strings. Screenshots are max 800 px wide. The pane often loses
  its session after a server restart, so ask the user to sign in again.
- Claude in Chrome tools drive the user's Brave (`isBrave` true); the built-in pane is the default.
- Supabase numeric columns come back as JS numbers; use `toCents` for money.
- Tests use the Node built-in runner with type stripping; imports between lib files use the `.ts` extension in pure files
  and plain names in server-only files.
