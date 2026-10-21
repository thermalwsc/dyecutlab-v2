# DYE CUT LAB (DCL) — System plan and progress

Custom packaging made simple. A customer describes an idea, DCL turns it into a factory-ready specification, a verified quote, payment, proof, production and delivery. This file is the engineering view of the 12-week plan the client sees (`F:\DYECUTLAB-Work\12-Week-Plan\index.html`). The task log is `F:\DYECUTLAB-Work\TaskLogHTML\index.html`.

Last updated: Wed, Oct 21, 2026 (week 4).

---

## 1. The system in one page

**Stack.** Next.js 16 (App Router, `proxy.ts`, server actions, route handlers), Supabase (Auth, Postgres with row-level security, Storage), Tailwind v4, OpenAI Responses API, Sendblue (texting), Netlify/Vercel hosting.

> This is not the Next.js you know: read `node_modules/next/dist/docs/` before changing framework-level code (see `AGENTS.md`).

**Who uses it (roles in `profiles.role`).**

| Role | Sees | Pages |
|---|---|---|
| `customer` | Only their own requests and projects | `/account`, `/project/[id]`, `/app` (start a project) |
| `dcl_staff`, `dcl_admin` | Everything | `/admin`, `/admin/projects/[id]`, any project page |
| `factory` | Only projects assigned to their factory | `/factory`, `/factory/projects/[number]` |

**Main data (Postgres, all with RLS).** `profiles`, `factories`, `clients`, `projects` (UUID ids, `project_number` such as DCL-00060), `project_messages`, `project_files`, `project_file_analyses` (File Intelligence for images), `project_file_preflights` (PDF checks), `quote_requests`, `usage_daily` (AI and upload counters).

**Access rules.** Helper functions `is_dcl_team()`, `my_factory_id()`, `can_access_project()`, `can_access_project_number()`, `can_edit_project_files()`. Factories can read but never change or delete customers' files. The service-role key is used only on the server after the session and role are checked.

**Chat.** Two chats share one AI persona, DICI:
1. **Intake chat** (`/app`, `/api/baba`): the customer says what they want, DICI asks follow-ups, a project is created after the first reply, the conversation and an optional reference image are saved to it.
2. **Project chat** (`/project/[id]`, `/api/projects/[id]/baba`): DICI answers from the project brief and stored file results, remembers the last 10 messages, and may change a short list of brief fields. Every AI value is checked before it is saved (`lib/chatUpdates.ts`).

**Production rule.** 1 unit = 128 finished pieces; bulk orders are multiples of 100, so the whole order rounds up to the next 100 (5 units = 700, 10 units = 1,300), and with flavors each flavor is also a multiple of 100. Confirmed by the client; one shared calculation in `lib/production.ts`.

**Safety rules built in.** No raw database, AI or server error reaches the browser (`tests/apiErrors.test.ts` scans every route). Per-minute and per-day limits on AI and upload requests. Upload type, size and per-project count limits (`lib/uploadRules.ts`).

---

## 2. Finished so far

### Foundation (weeks 1–2, 50 h, complete)
- Sign-up and sign-in: email and password, Google; branded sign-in pages; disabled profiles are treated as signed out.
- Three account types and route protection; project pages open only for the owner and staff.
- Database rules so data is locked to the right account and role; secure file storage; SQL test suites (`supabase/tests/`, 20 file and storage checks pass).
- Dashboards: customer "My projects", team workspace (requests, projects, factories), factory portal (assigned projects, brief, files, status moves production, QC, shipping).
- Landing page rebuilt for mobile (parallax, world map, real DCL logo, icons, link preview image), Privacy and Terms pages, texting number switched to Sendblue.
- Limits on AI and upload requests.

### Week 3 so far (project lifecycle and chat fixes)
- Cross-account checks with two customers and a factory, through the pages and directly through the API.
- Database fix found by the tests: factories could rename or delete customer files; now only the owner or team can (migration `20261012000000`).
- Project chat hardening: safe errors, safe fields, AI values checked, customer message saved only after the reply succeeds.
- Conversation memory (last 10 messages, 500 characters each, 3,000 in total).
- PDFs: DICI now reads the stored preflight instead of claiming a PDF was not analyzed; replies are short, plain, never offer actions DICI cannot do.
- Failed chat messages show a plain reason (limit, signed out, offline) and give the typed text back.
- Message history loads in pages (newest 50, earlier on request).
- Intake chat saves its conversation to the project and uploads the reference image for real, with clear upload errors.
- Project page redesigned: header with picture, tabs, chat beside the project on wide screens, phone and tablet layouts, "Ask DICI" button on small screens.
- The start-your-project chat now sees the recent conversation and asks short plain questions; reopening it from the project view reloads the saved conversation instead of re-sending the opening message.
- One shared quantity rule (`lib/production.ts`), confirmed by the client, used by both chats and both AI prompts.
- Project activity history: a `project_activity` table written by database triggers (created and every stage change, with who and when), read by the owner, the team and the assigned factory, never writable through the app. Activity tab on the project page, backed by a read-only route. 22 SQL checks pass.
- Stage guard: only the team and the server can change a project's stage, and a customer can only create a project at the first stages. 11 SQL checks pass.
- Customers see plain stage names (Request received, Being made, and so on); the team keeps the exact names.
- "Start your project" now opens the DICI chat at `/app` everywhere (`START_PROJECT_HREF`); the old `/start` form redirects to it and its files are kept. A visitor who is not signed in is sent to sign-in first, with a message written for people starting a project.
- Team alert: when a customer's chat creates a project, the team gets one email and one text (once per project, claimed in the database). Confirmed working by email.
- The AI is called DICI on every customer-facing screen (the stored message role and route names keep the old internal name).
- Wording and rules: "designs or flavors" for what the code calls flavors (chosen by the client); a bare count such as "100 boxes" makes DICI ask whether it means pieces or units; pieces convert to units with a tested rule.
- The `/app` start screen, contact step and chat are redesigned in the site's lime and black style; "View project" opens the real project page.
- Customers see plain stage names; the customer wording for estimate and proof stages says "sent by text" until those views exist (two switches in `lib/siteFlags.ts`).
- AI and upload limits re-tuned from real usage (about $0.001 per request): chat 80 per account and 300 per site per day, image analysis 20 and 100, uploads 50 and 400. A test keeps a full day at the ceiling near a tenth of the $25 monthly cap.
- Automated tests: 121 passing (`npm test`).

### Verified vs still to confirm
Confirmed with a signed-in session: message paging, PNG upload and `.exe` refusal, the AI's quantity answers, saved conversation on the team side, the offline send message, the project page at phone, tablet and desktop sizes, and the team alert email. Moved to week 4 testing (needs a team and a factory sign-in): a team stage change appears in the Activity tab, and the factory's status button still works and is named "by the factory" after the guard.

---

## 3. Week-by-week plan and status

Weeks are 25 h each, 300 h in total. Percentages are the share of a task that is built.

| Week | Focus | Status |
|---|---|---|
| 1 | Authentication and accounts | Done |
| 2 | Security and data foundation (including the three dashboards, moved up) | Done |
| 3 | Project lifecycle and DICI chat fixes | In progress (about 96%) |
| 4 | Customer workspace | In progress (about 72%) |
| 5 | Quoting engine | Not started |
| 6 | Factory portal and admin | Not started |
| 7 | Bilingual layer (English and Chinese) | Not started |
| 8 | Payments | Not started |
| 9 | Proofs, production and shipping | Not started |
| 10 | Testing and launch readiness | Not started |
| 11 | Private beta launch | Not started |
| 12 | Observe, improve and plan next | Not started |

Overall about 32% of the plan.

### Week 3 detail

| Task | Status | When |
|---|---|---|
| Final cross-account checks and factory file permissions | Done | Mon |
| Fix the chat bugs (audit, safe errors, value checks, memory, PDF results, error handling, paging) | Done and tested | Mon–Tue |
| Save every conversation to its project (intake chat, reference image) | Done and tested | Wed |
| Every stage change recorded in an activity history (with a guard so only the team and server can move a stage) | Done and SQL-tested | Thu |
| Real project stages: Lead, Development, Quote Ready, Factory Review, Approved, Payment, Proof, Production, QC, Shipping, Delivered | Done (plain customer names, one consistency test across the team, factory and customer lists) | Thu–Fri, 3 h |
| Switch "Start your project" from the temporary `/start` form to the AI chat (`START_PROJECT_HREF` in `lib/contact.ts`) and retire the form | Done (`/start` redirects; its files are kept) | Fri, 2 h |
| Limits on AI and upload requests: tune the numbers (the monthly cap is set) | Done, tuned from real usage | Fri, 0.5 h |

### Week 4 detail
Project page with a live progress tracker, files and messages (about 40%); DICI app restyled to the lime and black brand (the project page and chat are done, the intake page is not); email updates when a project changes stage; version-controlled database setup (done: every change is a migration file with a rolled-back check); hand-test the stage history and the factory's status button with real team and factory accounts (moved from week 3, about 0.5 h; done: confirmed with a team and a factory account); archive the test projects before real customers are invited (later in the week, about 0.5 h, archive only).

### Weeks 5–12 (summary)
- **5 Quoting engine:** estimate from style, size, quantity, finish, tooling, freight and margin; always labeled as an estimate; quote versions per project; editable pricing tables; quote PDF.
- **6 Factory portal and admin:** factory submits its quote, DCL approves before the customer sees it; record what the factory changed and why; test with the partner factory.
- **7 Bilingual layer:** messages translated both ways keeping specifications exact, original always viewable, factory portal in Chinese, corrections logged.
- **8 Payments:** secure checkout on an approved quote, automatic move to Proof once paid, receipts, test mode first.
- **9 Proofs, production and shipping:** factory uploads proofs, customer approves, production milestones and QC photos, tracking, notifications.
- **10 Testing and launch readiness:** a separate test database (moved from week 4: all current data is test data, so it waits until real customers are in); automated tests for sign-in, data security, stages and payments; security review and error monitoring; full test order; release.
- **11 Private beta:** first real customers and the partner factory, beta dashboard, daily fixes.
- **12 Observe and plan next:** fix first-order issues, beta report, prioritized plan for after beta.

### Planned for after beta
Multiple factories with RFQs, bids and comparison; white label for factories, brokers and distributors; automated artwork correction and factory scoring; other product categories.

---

## 4. Open items

**Developer**
- Week 4 testing: with a team account change a project's stage and check the Activity tab; with a factory account press the status button and check it works and is named "by the factory".
- Log Friday in the task log and plan (hours to confirm).
- Before the live site uses the team alert: set the real `STAFF_NOTIFY_EMAIL` and `STAFF_NOTIFY_PHONE` in Vercel, remove the temporary test values from `.env.local`, and ask Gilbert to text the business line once so the text alert can be tried from a US number. Run migrations 20261015000000, 20261015010000 and 20261015020000 on the live Supabase project if it is a different one.
- Optional, to be confirmed with the client: a "Chat with DICI" button on dashboard project cards (about 30 min); keep or remove the "Text us" option now that the chat works.
- Revoke the old OpenAI key ending DGcA; add the Google Search Console TXT record; Apple Developer enrollment; redeploy the plan and task log to Netlify; `git push` so Vercel gets the latest commits.

**Client (Gilbert)**
- Done: how units become pieces, confirmed by Gilbert on Oct 15. One unit is 128 pieces and bulk orders are multiples of 100, so the whole order rounds up to the next 100 (5 units = 700, 10 units = 1,300), and each flavor is also a multiple of 100. It lives in `lib/production.ts`, used by both chats and both AI prompts, with tests.
- Done: the OpenAI monthly cap ($25, alert at $15) and a payment method are set.
- By week 5: factory pricing data and margin rules. By week 6: a partner factory contact. By week 7: a Chinese speaker and a payment account (for example Stripe). By week 10: the first beta customers.

---

## 5. Working rules

- Keep the service-role key server-only: never prefix it `NEXT_PUBLIC_`, never commit it, never paste it in chat or `.env.example`. API keys go only in `.env.local` and Vercel environment variables.
- Do not run SQL against the live database from tooling: write a migration or test file in `supabase/` and run it in the Supabase SQL editor.
- Ask before deleting files, changing existing RLS policies or doing anything irreversible.
- Commit only when asked; the developer runs `git push`.
- Rate-limiter semantics: the function from `createRateLimiter(...)` returns **true when the caller is over the limit**.
- Task log entries are technical only (database, workflow debugging, code changes). Plan updates, design proposals and drafting messages do not go in the log.
- One invoice per week (week 3 is INV-2026-003); never roll hours across weeks.
- Run `npm test` and `npx tsc --noEmit -p .` before committing.

## 6. Where things live

| Area | Location |
|---|---|
| Customer dashboard, project cards | `app/account/` |
| Project page and chat | `app/project/[projectId]/page.tsx` |
| Intake chat (start a project) | `app/app/page.tsx`, `app/api/baba/route.ts` |
| Project chat API | `app/api/projects/[projectId]/baba/route.ts` |
| Messages, files, preflight, analyze APIs | `app/api/projects/[projectId]/...` |
| Team workspace | `app/admin/` |
| Factory portal | `app/factory/`, `lib/factoryWork.ts` |
| Landing page | `app/updates/` |
| Chat rules (memory, value checks, errors, paging, intake saving) | `lib/chatHistory.ts`, `lib/chatUpdates.ts`, `lib/chatErrors.ts`, `lib/chatPaging.ts`, `lib/intakeMessages.ts`, `lib/chatProject.ts` |
| Limits and upload rules | `lib/usageLimits.ts`, `lib/uploadRules.ts` |
| Supabase clients and route helpers | `lib/supabase/` |
| Migrations and SQL tests | `supabase/migrations/`, `supabase/tests/` |
| Automated tests | `tests/` |
