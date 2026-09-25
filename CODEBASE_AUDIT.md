# CODEBASE AUDIT — DYE CUT LAB / DICI ("Digital Clarity")

**Audit date:** 2026-09-14
**Method:** Read every non-`node_modules` source file; verified behavior by reading code, not folder names.
**Repo:** `g:\DYECUTLAB` (single Next.js app, **not a git repository** — no history, no branches).

---

## 1. Project Overview

### 1.1 Tech stack detected

| Layer | Technology | Evidence |
|---|---|---|
| Frontend | Next.js **16.3.1** (App Router) + React 19 + Tailwind CSS v4 | `package.json`; `app/` structure |
| Language | TypeScript (strict) | `tsconfig.json` |
| Backend | Next.js Route Handlers (`app/api/**/route.ts`) — no separate backend service | `app/api/` |
| DB / BaaS | Supabase (Postgres + Storage) | `lib/supabase.ts`; `@supabase/supabase-js` |
| LLM provider | **OpenAI** (`openai` SDK v7.5.0) | `baba` route, project `baba` route, `analyze` route |
| PDF parsing | `pdf-lib` | `preflight/route.ts` |
| Hosting | Not configured (no Vercel/Dockerfile/deploy config) | |
| Package manager | `npm` (`package-lock.json`) | |
| Auth | **None implemented** | no auth code anywhere |
| Payments | **None implemented** | no Stripe/payment dependency or code |

### 1.2 Project structure

```
g:\DYECUTLAB\
├── app\
│   ├── layout.tsx            Root layout (fonts, lang="en") — default create-next-app metadata
│   ├── page.tsx (1867 ln)    Main app: marketing home + ClientCapture + Conversation (BABA intake) + ProjectDashboard
│   ├── globals.css           Tailwind v4 global styles
│   ├── api\
│   │   ├── baba\route.ts     Intake agent endpoint (stateless, chat + structured project extraction)
│   │   └── projects\[projectId]\
│   │       ├── route.ts            GET/PATCH a project by project_number
│   │       ├── baba\route.ts       Ongoing per-project BABA chat + field updates (1320 ln)
│   │       ├── messages\route.ts   GET saved conversation for a project
│   │       ├── files\route.ts      GET/list + POST/upload files to Supabase Storage
│   │       └── files\[fileId]\
│   │           ├── analyze\route.ts    "File Intelligence V1" — OpenAI vision analysis of JPG/PNG/WebP
│   │           └── preflight\route.ts  "Preflight V2.2" — structural PDF inspection (pdf-lib)
│   └── project\[projectId]\page.tsx  Client-facing workspace (chat + files + analysis/preflight UI) (3221 ln)
├── lib\
│   └── supabase.ts           Singleton Supabase client (publishable key, browser)
├── public\                   Default create-next-app SVGs only
├── __MACOSX\                 macOS zip junk (full copy of node_modules ._ files)
├── .DS_Store + backups       app\page.tsx.aug23 / .backup / .save, route.ts.backup (stray)
└── (config) next.config.ts, tsconfig.json, eslint.config.mjs, postcss.config.mjs
```

### 1.3 Monorepo / mobile

- **Single app, not a monorepo.** No workspaces, no `packages/` directory.
- **Responsive web only.** Tailwind, mobile-first; no React Native / Expo / native code. Phone-width UI but web-only.

---

## 2. Database / Supabase Schema

**No SQL migrations, schema files, or `supabase/` directory exist in the repo.** Every table's shape below is **inferred from `.select(...)` / `.insert(...)` / `.update(...)` calls in the code** — the actual Postgres DDL lives in the Supabase dashboard and is *not version-controlled*.

### 2.1 Tables referenced in code

**`clients`** (customer contact)
- `id` (PK), `phone` (unique — `onConflict: "phone"`), `email` (nullable), `marketing_sms_opt_in` (bool), `updated_at`
- Sources: `app/page.tsx:609-621`. No link to `auth.users` (no auth).

**`projects`** (central "source of truth")
- `id` (uuid PK), `project_number` (unique, `DCL-00031` format), `client_id` (FK → `clients.id`), `title`, `request`, `product_type`, `use_type`, `units` (int, 1 unit = 128 pcs), `quantity` (int, derived/rounded), `flavor_count` (int), `flavor_split` (int, derived), `artwork_status`, `size`, `closure`, `pouch_size`, `box_dimensions`, `material`, `finish`, `status` (string), `created_at`, `updated_at`
- Sources: type `ProjectData` `app/page.tsx:26-42`; insert payload `app/page.tsx:876-912`; project type `app/project/[projectId]/page.tsx:11-30`.

**`project_messages`** (persisted chat history)
- `id`, `project_id` (FK → `projects.id`), `role` (`"user"` | `"baba"`), `message`, `created_at`
- Sources: `app/api/projects/[projectId]/baba/route.ts:106-122`, `messages/route.ts:98-105`.

**`project_files`** (file registry; binaries in Storage)
- `id`, `project_id` (FK), `file_name`, `storage_path`, `file_type`, `file_size`, `category` (`"artwork" | "reference" | "production" | "sample" | "other"`), `uploaded_by` (always `"client"`), `created_at`
- Source: `app/api/projects/[projectId]/files/route.ts:518-543`.

**`project_file_analyses`** ("File Intelligence V1" raster-image analysis)
- `id`, `file_id` (unique — `onConflict: "file_id"`), `project_id` (FK), `status` (`"pending" | "processing" | "completed" | "failed"`), `width_px`, `height_px`, `format`, `mime_type`, `file_size`, `visual_summary`, `visible_text`, `artwork_type`, `production_notes`, `possible_concerns`, `recommended_next_step`, `analysis_model`, `analysis_version`, `analyzed_at`, `error_message`
- Sources: `analyze/route.ts:468-502`, `:930-962`.

**`project_file_preflights`** (structural PDF preflight "V2.2")
- `id`, `file_id` (unique — `onConflict: "file_id"`), `project_id` (FK), `version` (e.g. `"v2.2"`), `status`, `page_count`, `consistent_page_size`, `pages` (json), `metadata` (json), `observations`, `concerns`, `pdf_boxes` (json), `bleed_analysis` (json), `not_verified`, `recommended_next_step`, `error_message`, `preflighted_at`, `created_at`, `updated_at`
- Source: `preflight/route.ts:958-1047`.

**Storage bucket:** `project-files` (private). Path `{project_number}/{category}/{unique}` (`files/route.ts:464-465`), accessed via signed URLs.

### 2.2 Project lifecycle "status" field vs. target state machine

- **There IS a `status` column** on `projects` (`app/page.tsx:41,59`; `app/project/[projectId]/page.tsx:19`).
- **Actual value(s) in use:** only the literal string `"development"` — the default in `EMPTY_PROJECT` (`app/page.tsx:59`) and `ensureProject` fallback (`app/page.tsx:886`). **No code anywhere sets any other status value.**
- No enum/CHECK constraint is defined in code; no status-transition logic exists; no function mutates `status`.
- **Target `Lead → Development → Quote Ready → Factory Review → Approved → Payment → Proof → Production → QC → Shipping → Delivered` is NOT implemented.** Lifecycle only appears as **static UI copy**:
  - Intake dashboard hard-codes "PROJECT PROGRESS 1 OF 5" with DEVELOP (IN PROGRESS) / QUOTE / SAMPLE / PRODUCE / DELIVER (PENDING) — `app/page.tsx:1597-1613`.
  - Project page just uppercases `project.status` and defaults to "DEVELOPMENT" (`app/project/[projectId]/page.tsx:746-748`); it does not render the target stages.
- Conclusion: the lifecycle is **at most a hard-coded display, not a real state machine.**

### 2.3 Row Level Security (RLS)

- **No RLS policies are defined anywhere in the repo** (no SQL, no edge-function RPC). Actual RLS state lives only in the Supabase dashboard.
- The code **knows** RLS may block writes: the PATCH route comments that zero rows returned "usually means Supabase RLS/update permissions blocked the UPDATE" and returns 403 (`app/api/projects/[projectId]/route.ts:180-208`).
- Every route + the browser reuse the **same** client-exposed publishable key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), so there is no anon-vs-authenticated privilege split.
- **Risk flag:** since every query/write on `clients`, `projects`, `project_messages`, `project_files` uses a public key and no `user_id`/`auth.uid()` is ever referenced, any permissive policy (e.g. `USING (true)`) allows anyone who can guess the sequential `DCL-XXXXX` URL to read/modify all projects. If RLS were properly owner-scoped it would break the current calls (no token is ever sent).

### 2.4 Roles / permissions

- **No roles exist.** No Supabase Auth, no `auth.users` reference, no JWT claims, no role table. Customer is identified purely by phone via `localStorage` (`REMEMBERED_CLIENT_KEY`).
- Customer, staff/admin, and factory are **not distinguished** at the data-model level.

### 2.5 Supabase Edge Functions

- **None.** There is no `supabase/functions/` directory. All backend logic is in **Next.js Route Handlers** instead (not Supabase Edge Functions).

---

## 3. DICI / AI Conversation Layer ("BABA")

### 3.1 Provider, model, key handling

- **Provider:** OpenAI via the `openai` SDK (`app/api/baba/route.ts:1`; `openai` in `package.json`).
- **Models used (hard-coded in code):**
  - Intake: `gpt-5.6-luna` — `app/api/baba/route.ts:266`
  - Project assistant: `gpt-5-mini` — `app/api/projects/[projectId]/baba/route.ts:436`
  - File Intelligence vision: `gpt-5.6-luna` — `analyze/route.ts:618`
  - ⚠️ **Both model strings (`gpt-5.6-luna`, `gpt-5-mini`) are non-standard and not current public OpenAI model identifiers** — they look like AI-generated placeholders. If the account/model catalog does not expose these exact names, every call fails at runtime.
- **Key handling:** `process.env.OPENAI_API_KEY` — server-side only (`baba/route.ts:5`; project `baba/route.ts:24-36`; `analyze/route.ts:30-42`). Not exposed to the browser. No hard-coded key in source. **No committed `.env` file** (env vars are runtime).
- **Security note (Supabase):** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is exposed to the browser **and** reused for all server-side writes — no server/client privilege separation (every identity is the same).

### 3.2 Structured output vs. free-text

Two integration styles:

1. **Intake (`/api/baba`) — structured JSON extraction, no DB writes in the route.** Sends current project state + newest message; the model returns a **strict JSON Schema** `{ extracted, nextQuestion, complete }` (`baba/route.ts:284-343`). The route itself writes nothing — the *frontend* applies the result via `ensureProject()`.
2. **Project assistant (`/api/projects/[projectId]/baba`) — structured field updates with real DB writes.** Model returns `{ changed_fields[], values{} }` under a strict schema with a whitelisted enum (`baba/route.ts:45-58, 824-851`); the server validates units/flavor_count, recomputes `quantity`/`flavor_split` (`:1029-1143`), **writes to `projects`** (`:1183-1191`) and **saves the user message + BABA reply to `project_messages`** (`:420-422, 1156-1161, 1257-1262`).

So it is "structured JSON extraction + server-side persistence" on the OpenAI Responses API — an approximation of function-calling, not native OpenAI tool-calls, with persistence done in the route.

### 3.3 Full trace: does a chat description get persisted to a "Project"?

**Yes — via two different paths.**

**Intake (home page, `app/page.tsx`):**
1. User describes product → `callBaba()` POSTs to `/api/baba` with the current project state (`app/page.tsx:960-987`).
2. Response `extracted.*` is merged into a `ProjectData` (`:998-1033`).
3. `ensureProject(next)` **inserts/updates `projects`** with `title`, `client_id`, `request`, `units`, `quantity`, `flavor_count`, `flavor_split`, `status`, etc. (`:872-935`; insert at `:908-912`).
4. The returned `project_number` ("DCL-XXXXX") drives the dashboard and the `/project/[id]` page.

**⚠️ Caveat — intake messages are NOT persisted as history.** During intake the chat text lives only in React state (`:946-954, 1082-1089`). No `project_messages` row is written during intake (and `project_messages` needs the project to already exist). The intake transcript is lost on navigation — only the structured `projects` row survives.

**Ongoing project chat (`app/project/[projectId]/page.tsx`):**
- `sendMessage()` POSTs to `/api/projects/[projectId]/baba` (`:648-660`) → route applies field updates to `projects` and saves user + BABA messages to `project_messages` (persisted). This is the path where **conversation history IS stored and linked to the Project record.**

### 3.4 Conversation history storage

- **Yes, in `project_messages`**, but only written by the *project-scoped* BABA endpoint (post-creation), keyed by `project_id` (`project baba/route.ts:116`; `messages/route.ts:100`).
- **Not linked for the intake phase** — intake chat has no persistence (see 3.3).

---

## 4. Bilingual / Translation Layer

- **No English↔Chinese translation is implemented anywhere.** No i18n library, no translation API (Google Translate/DeepL), no locale switching, no `lang="zh"`, no Chinese dictionary in code.
- Every "translate/中文" match is a false positive:
  - `baba/route.ts:38` — prompt "CUSTOMER LANGUAGE… Understand their intent" (about casual English, not bilingual).
  - project `baba/route.ts:783` — "Translate technical information into useful production guidance" (jargon → plain language, **not** English→Chinese).
  - `messages/route.ts:48` — "translate the DCL project number into its actual Supabase project ID" (data mapping).
- The UI is English-only, hard-coded strings throughout (`app/page.tsx`, `app/project/[projectId]/page.tsx`).
- **Conclusion: the bilingual layer is not built, and structured-field translation (dimensions/material/qty preserving the original) is absent.**

---

## 5. Quoting System

- **No pricing/estimate logic exists** — no pricing rules, cost tables, unit-price model, quote generation, or Estimates table.
- The only "quote/estimate" matches are **hard-coded UI labels**:
  - "before we can prepare your quote" / "ready for quote preparation" — `app/page.tsx:1584-1585`
  - "QUOTE · PENDING" step + `ProjectLink title="QUOTE" value="PENDING"` — `app/page.tsx:1609, 1620`.
- **No distinction between an AI "Estimate" and a factory-"Verified Quote"** — no quote status flag, no separate quote table, no verified-quote workflow.

---

## 6. Factory Portal

- **Does not exist.** No factory-facing route, dashboard, or component. Only routes: marketing home (`/`) and per-project workspace (`/project/[projectId]`).
- The only "factory" traces are **static marketing copy**: "FACTORY FEED / GUANGDONG / CN / CAM_03 / REC" decorative panels (`app/page.tsx:1636-1651`) and the "LAB CAM_03 / GUANGDONG, CN" tile (`:1627-1628`). **Non-functional CSS placeholders.**
- A factory user has **no view, no login**, and **no ability** to submit quotes or update production status.

---

## 7. Payments

- **No payment provider integrated** (no Stripe import, no checkout session, no `payment` table/column, no amount anywhere).
- **Nothing to answer for test vs. live mode** — no payment code exists.
- A successful payment would **not** trigger any status change, because payments and status transitions do not exist.

---

## 8. Production Tracking / Proofs / Shipping

- **Production tracking: No.** No production-status updates (`status` never leaves `"development"`; see §2.2). The "PROGRESS 1 OF 5" bars are static UI.
- **Proofs: No.** No proof upload/review/approve flow. Files can be uploaded with category `"sample"`, but there is no customer-facing proof-approval step.
- **Shipping / delivery: No.** No carrier integration, no tracking numbers.
- **What DOES exist (real, not a placeholder):** **File Intelligence** (raster-image analysis) and **PDF Production Preflight** (structural trim/bleed/box analysis) with a functional front-end panel showing per-check status (TRIM BOX / BLEED verified/insufficient) plus a "NOT FINAL PRODUCTION APPROVAL" disclaimer (`app/project/[projectId]/page.tsx:1577-1655`). These are the most substantively built back-end features in the project.

---

## 9. Admin Panel

- **Does not exist.** No `/admin` route, no staff dashboard, no project list for staff, no role-gated controls. The only "PROJECT DASHBOARD" is the **customer-facing** intake result card in `app/page.tsx:1508+`.
- An internal admin can currently do **nothing** — there is no staff login or admin surface.

---

## 10. Auth

- **Auth method:** **None.** `@supabase/ssr` is installed but never used (`lib/supabase.ts` uses plain `createClient` from `@supabase/supabase-js`). No magic link, no OAuth, no password, no `signInWith*`, no `auth` call anywhere.
- Customer identity = phone-number upsert into `clients`, id cached in `localStorage` (`app/page.tsx:8-13, 243, 609-641`). This is **not authentication** — anyone with the project URL can view/modify the project.
- Customer vs. staff vs. factory roles are **not handled at all** (same as §2.4).

---

## 11. Code Quality & Risk Flags

### 11.1 Secrets / keys
- **No hard-coded secrets in source.** `OPENAI_API_KEY` is read from env server-side; `NEXT_PUBLIC_SUPABASE_*` are expected public values. **No committed `.env` file.**
- **Risk:** the publishable Supabase key is exposed to the browser yet authorizes all reads/writes (no per-role key separation). Combined with un-version-controlled RLS, this is the biggest data-safety risk.

### 11.2 Error handling / loading / validation
- **Good:** most routes use try/catch with typed JSON errors; the file-upload route cleans up orphaned Storage objects on DB failure (`files/route.ts:555-573`); units/flavor_count are server-validated (`project baba/route.ts:1029-1093`); PATCH whitelists fields (`route.ts:90-98`); front-end has `saving`/`thinking`/`messagesLoading` states.
- **Gaps:**
  - **No auth** — any project is reachable by guessing the sequential `DCL-XXXXX` number.
  - **No rate limiting / abuse protection** on any `POST` (chat, upload, analyze, preflight); each hits OpenAI/Supabase with a public key.
  - **Intake input validation is light** — regex heuristics run in parallel with the AI and get merged; edge cases possible.
  - **Intake conversation is not persisted** (see §3.4).
  - **Uploads have no hard size/type limit in the route** beyond MIME checks; Storage policy is dashboard-managed and unknown.
  - **Status is never transitioned; quotes/payments absent** — the critical flows noted in the blueprint are missing or unguarded.
- **Model-naming risk:** the two hard-coded model strings are non-standard; verify resolution before demoing.

### 11.3 TODO / FIXME / stubs
- **No `TODO`/`FIXME` comments found.** The "unfinished" signals are structural:
  - **Placeholder UI:** "PROJECT IMAGE", "LAB CAM"/"FACTORY FEED"/"FACTORY FEED GUANGDONG", progress "1 OF 5" (`app/page.tsx:468-470, 561-569, 1600-1613, 1636-1651`).
  - **Stray clutter:** `app\page.tsx.aug23`, `.backup`, `.save`, `app\api\baba\route.ts.backup`, full `__MACOSX\` tree, `.DS_Store` files. Not git-ignored (and no repo).
  - **Explicit capability disclaimers** in the BABA prompt: "You cannot currently: perform a new file analysis… perform a full production preflight… approve artwork… send artwork to a factory" (`project baba/route.ts:614-630`) — an honest list of intentionally unsupported features.

### 11.4 Test coverage
- **Zero tests.** No `*.test.*`/`*.spec.*`, no Jest/Vitest/config, no `test` script (`package.json` scripts: dev/build/start/lint only). The `regex.test()` hits in searches are source code, not test suites.

---

## 12. Gap Summary Table

| Feature (per blueprint) | Status | Evidence |
|---|---|---|
| DICI intake (conversational AI) | **Built (mostly)** | `app/page.tsx:738-1101` + `app/api/baba/route.ts`. Structured JSON extraction. **Missing:** intake chat history persistence. |
| Structured projects (source of truth) | **Built (core)** | `projects` written at `app/page.tsx:872-935`; CRUD + project page; `DCL-XXXXX` numbering. **Missing:** migrations in repo, RLS, ownership scoping. |
| Bilingual messaging | **Not built** | No i18n/translation code; English-only UI (§4; only false-positive matches). |
| Factory portal | **Not built (mockups only)** | No factory route; static "FACTORY FEED / GUANGDONG" CSS panels `app/page.tsx:1636-1651`. |
| Quotes + approvals (estimate vs. verified) | **Not built** | No pricing logic; "QUOTE PENDING" is hard-coded UI `app/page.tsx:1609,1620`; no estimate/verified separation. |
| Payments | **Not built** | No provider, no amount data, no status trigger. |
| Proofs | **Not built** | No proof-approval workflow; only a generic `"sample"` file category. |
| Production tracking | **Not built** | `status` never transitions beyond `"development"`; progress bars static. (File Intelligence + PDF preflight ARE real/functional.) |
| Admin | **Not built** | No `/admin`, no staff view/login. |

---

## 13. Honest Effort Estimate

**Assumptions:** one developer, **25 hrs/week**, with an AI coding assistant (fast scaffolding/CRUD/boilerplate, but modeling, integrations, security and commissioning still cost human hours). Starting from **this codebase** (~60-70% of the customer-facing MVP is already present). Excludes third-party vendor lead times (payment processors, factory onboarding, real factory cost data). "Week" = 25 human hours.

> Why potentially faster than a 12-week target: intake agent, structured project record, file intelligence, PDF preflight, and the customer workspace already exist and are reasonably structured. The remaining work centers on the money/inventory/roles features — which are the slow, high-integrity parts — not greenfield UI.

### Stage 1 — Foundation hardening (Weeks 1–2)
- Added: committed SQL migrations (all tables + RLS) + env docs (~2 days).
- Real auth + roles (customer/staff/factory) via Supabase Auth + `profiles` role table; scope every query by owner (~5 days — highest-risk architectural change; must precede anything public).
- Fix the non-standard model strings and wire real OpenAI config (~1 day).
- **Why:** everything depends on these. AI helps with migration boilerplate, but retrofitting ownership across every route is judgment work.

### Stage 2 — Real project lifecycle (Weeks 2–3)
- Enforce the target status enum + transitions via a controlled API (never raw status writes).
- Persist intake `project_messages` so transcripts are durable.
- Per-project activity/audit log.
- **Why:** this is the backbone both customer workspace and factory portal will read; doing it before fonts quoting avoids rework (~6 days).

### Stage 3 — Quoting engine + Bilingual layer (Weeks 4–5)
- Quote domain: `Estimates` table (unverified/AI-generated) with a "Verified/Factory quote" state; price/material tables; PDF export (pdf-lib present).
- Bilingual EN↔ZH: LLM translation behind Structured Output preserving structured fields, plus a locale toggle.
- **Why:** quoting is the first money-touching feature and needs factory input to become "verified"; bilingual is mechanical with an LLM but needs careful prompt/structure design (~8-10 days).

### Stage 4 — Factory portal (Weeks 6–8)
- Factory login + filtered project list; submit quotes; update production status; upload production images/proofs. A real second surface (new routes + UI).
- **Why:** a separate dashboard with its own permission model and real write paths — AI speeds prototyping but permissions/data-flow must be validated (~12-15 days across 3 weeks, shared with other work).

### Stage 5 — Payments (Weeks 8–9)
- Stripe checkout (test → live) and on success **transition project status** (blue-required). Idempotency + webhook verification are careful work. Watch for platform restrictions on cannabis-adjacent payment approval (~4-6 days).

### Stage 6 — Proofs, QC gate, customer approval (Weeks 9–10)
- Digital-proof upload + customer approve/reject tied to the status machine; QC pass/fail gate before shipping. Mostly UI + status consumption over Stages 2 & 4, so it compresses well (~5-7 days).

### Stage 7 — Admin + hardening/QA/release (Weeks 11–12)
- Staff dashboard (project list, quote approvals, status overrides, audit view).
- Auth guards, rate limiting on OpenAI endpoints, upload size/type enforcement, and the **first real test suite** (unit: quantity/bleed/flavor logic; integration: auth-gated routes + payment webhook).
- Staging deploy + QA pass on the customer↔factory loop.
- **Why:** admin is quick to build, but production readiness (tests, security review, RLS audit) is a hard, unbendable human cost that typically consumes the last 2 weeks.

### Rough total
- **≈ 10-12 weeks at 25 hrs/week** to genuinely ship full "Build for Beta" (broadly on target vs the client's 12-week figure if scoping matches).
- **Trim to ~6-8 weeks:** ship quotes as estimates-only (defer factory *verified quoting*), English-only, defer QC/automated proofs, and gate behind manual staff approval.

---

### Appendix — Verifiability notes
- All claims cite actual line numbers in the files in §1.2.
- Schema details are **inferred from queries**, not DDL (no migrations exist in the repo).
- OpenAI model strings (`gpt-5.6-luna`, `gpt-5-mini`) are flagged as unverified/non-standard; confirm against the deployed account's model catalog before a live demo.