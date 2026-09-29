# DYE CUT LAB — auth setup & runbook

Everything the new sign-in needs, in the order you should do it. Read §1–§5 once
per environment; the rest is reference.

What shipped:

| Area | Where |
| --- | --- |
| Roles + `factories` + `profiles` schema, RLS, trigger | `supabase/migrations/20260928120000_accounts_and_roles.sql` |
| Role model shared by server + UI | `lib/auth/roles.ts` |
| "Who is this request?" (session + profile + disabled/banned) | `lib/auth/viewer.ts` |
| Server-side role gate (`requireRole`) | `lib/auth/guard.ts` |
| Service-role client (admin only) | `lib/supabase/admin.ts` |
| Sign in / create account / reset | `app/signin/`, `app/set-password/` |
| Role landing pages + guards | `app/account/`, `app/admin/`, `app/factory/` |
| Invite & manage accounts (dcl_admin) | `app/admin/accounts/` |
| Optimistic signed-in fast path | `proxy.ts` |

---

## 1. Environment variables

| Variable | Where it runs | Needed for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | everywhere | already set |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | everywhere (safe to expose) | already set |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | inviting users, changing roles, switching accounts off, adding factories, reading `auth.users` for the "invitation pending" status |

* Local: add it to `.env.local` (`SUPABASE_SERVICE_ROLE_KEY=…`).
* Vercel: Project → Settings → Environment Variables → add for **Preview and
  Production**, then redeploy. The new `secret` key (`sb_secret_…`) is accepted
  as `SUPABASE_SECRET_KEY` if you prefer that name.
* Never prefix it with `NEXT_PUBLIC_`, never commit it, and never paste it into
  a client file. `lib/supabase/admin.ts` starts with `import "server-only"`, so
  importing it from a client component is a build error; the key also has no
  `NEXT_PUBLIC_` name so Next never inlines it.

Without the key, `/admin/accounts` still renders and explains what is missing —
only the actions fail.

## 2. Apply the database migration

There is no Supabase CLI wiring in this repo (no `supabase/config.toml`), so
migrations are applied by hand, in filename order:

1. Supabase dashboard → **SQL Editor** → New query
2. Paste the whole of `supabase/migrations/20260928120000_accounts_and_roles.sql`
3. **Run**

What it does, in order: creates the `app_role` enum, creates `factories`,
creates `profiles`, converts an older text `role` column if one exists (mapping
`staff`/`admin` to `dcl_staff`/`dcl_admin` and anything unknown to `customer`),
drops the superseded `avatar_url`/`updated_at` columns and the old
"you may edit your own profile row" grant/policy, installs the sign-up trigger
and the three RLS helper functions, enables RLS with four select-only policies,
and backfills a `profiles` row for every existing `auth.users` row.

The file is idempotent — running it twice is a no-op.

An earlier draft of the same table (`20260928000000_create_profiles.sql`) was
never applied and has been deleted; this migration is the only one needed.

## 3. Promote the first DCL admin

The admin page needs someone to already be an admin, so bootstrap once. Two ways:

**(a) The person already signed up** (email + password, or Google):

```sql
-- 1. they sign up at /signin first
-- 2. then in the SQL editor:
update public.profiles
   set role = 'dcl_admin'
 where lower(email) = 'you@dyecutlab.com';
```

**(b) Create a confirmed admin with a password in one go, no email round-trip** —
paste `supabase/create-admin.sql` (edit the email/password at the top, run it,
sign in, change the password, then **delete the file**).

Check it worked:

```sql
select id, email, role, disabled_at from public.profiles order by created_at;
```

Afterwards, add more admins from `/admin/accounts` (Invite someone → DCL admin).
The same SQL as (a) is kept at `supabase/promote-admin.sql` for convenience.

## 4. Supabase Auth settings (dashboard)

**Authentication → Providers**

* `Email` — on. Turn **Confirm email** on or off, either works:
  * on → sign-up emails a confirmation link that lands on `/auth/callback`;
  * off → sign-up returns a session immediately.
* `Google` — on, with the client id/secret from Google Cloud. While the consent
  screen is in **Testing**, only accounts listed as **Test users** can sign in.
* `Apple` — on, if you want it. It needs a paid Apple Developer membership
  ($99/yr): Identifiers → **Services ID** (web), Keys → a key with "Sign in with
  Apple" enabled, and the Team ID + Key ID + the private `.p8` key contents.
  Supabase wants the Service ID and the `.p8` under "Secret Key". The Apple
  redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`. Apple may
  hand Supabase a `@privaterelay.appleid.com` address instead of the real email
  unless the user opts to share it — that address is what the accounts list will
  show for them.
* Both buttons are always rendered. The card checks `/auth/v1/settings` on load:
  a provider that is off shows as a **disabled** button with a one-line note
  ("Google and Apple sign-in aren't switched on yet…"), and a real failure is
  reported on click. That is better than hiding the option or letting it break.

**Authentication → URL Configuration → Redirect URLs** (add all of these):

```
https://<your-domain>/auth/callback
https://<your-domain>/set-password
http://localhost:3000/auth/callback
http://localhost:3000/set-password
```

`<your-domain>` = the production domain; add the Vercel preview domain too if you
want preview builds to work. `Site URL` should be the production origin.

**Authentication → Email Templates** — Confirm signup / Reset password / Invite:
replace the default `{{ .SiteURL }}` links with the absolute app URL
(`https://<your-domain>`) so the "back to our site" button lands somewhere real.
The links the app generates itself already point at `/auth/callback` (PKCE) and
`/set-password` (invite + recovery).

## 5. Order of operations for the new email flows

* **Sign up** (password) → `signUp` → confirmation link → `/auth/callback?code=…`
  → session → role landing page.
* **Google** → `/auth/callback?code=…` → session → role landing page.
* **Forgot password** → `resetPasswordForEmail` → link → `/set-password` (PKCE
  code via the callback first) → password form → role landing page.
* **Invite from /admin/accounts** → Supabase sends the invite with
  `redirectTo = <origin>/set-password`. Supabase does not support PKCE for
  invites, so the tokens arrive in the URL **hash**: the browser client reads
  them, the cookies are set, the page reloads once, and the server then renders
  the password form (`app/set-password/InviteLanding.tsx`). If no session
  appears within ~6 seconds the link is treated as expired/used.

---

## 6. How access is decided (and why)

* `public.profiles` has **no INSERT/UPDATE/DELETE policy and no write grant for
  `anon`/`authenticated`** — only `select`. A profile holder therefore *cannot*
  change their own role, factory or status from the browser, even by forging a
  REST call with the publishable key. Only the service role (from the admin
  actions) writes.
* The sign-up trigger hard-codes `'customer'`. `raw_user_meta_data` is never
  read for a role, so a crafted sign-up cannot create a team account.
* `public.current_app_role()` returns **null when the account is switched off**,
  so a disabled account has no role anywhere — in the SQL policies and in
  `lib/auth/viewer.ts` (both use the same rule). `lib/auth/guard.ts` signs the
  session out and sends them to `/signin?error=account_disabled`.
* Read policies: you read your own profile; `dcl_staff`/`dcl_admin` read every
  profile; the DCL team reads every factory; a `factory` account reads only its
  own factory. The helper functions are `security definer` with
  `search_path = ''` so policies do not recurse and cannot be hijacked.
* Page guards fail closed (`requireRole`): no session → `/signin` (with the
  return path), disabled/banned → signed out with an explanation, wrong role →
  your own area. `proxy.ts` only does the cheap signed-in check; it is never
  the decision.
* Lockout protections on `/admin/accounts`: you cannot change your own role or
  switch your own account off, and the last active `dcl_admin` cannot be
  demoted or deactivated. Invitations are throttled (20 / 10 min per admin) and
  account changes (30 / min per admin) with the existing in-process limiter;
  `factory` role requires a factory.
* `next=` redirects are restricted to the caller's own role area
  (`resolveLandingPath` in `lib/auth/roles.ts`) and must be a single-slash
  same-site path.

## 7. Database state found while building this (2026-09-28)

Checked against the live project with the publishable key (no service key was
used and no data was written — the write probes filtered on ids that cannot
exist, so they matched zero rows).

| Table | `anon`/publishable key can | Owner column |
| --- | --- | --- |
| `clients` | select + update + delete | none — identity is `phone` |
| `projects` | select + update + delete | `client_id` → `clients.id` (nullable, `null` on the existing rows) |
| `project_files` | select + update + delete | none — `project_id`, plus a text `uploaded_by` label |
| `project_messages` | select + update + delete | none — `project_id` + text `role` |
| `project_file_analyses` | select + update + delete | none — `file_id`/`project_id` |
| `project_file_preflights` | select + update + delete | none — `file_id`/`project_id` |
| `subscribers`, `quote_requests` | insert only (select → 401) | n/a (RLS working as designed) |
| `profiles` | table did not exist | — |

**Read this before scoping the project tables to accounts:** the six legacy
project tables are wide open to anyone holding the publishable key (which is in
every browser), and none of them has a column that can point at `auth.users`.
`projects.client_id` → `clients.id` is the only link, and `clients` is
identified by phone number. Owner-scoping them is separate work (add
`auth_user_id` to `clients`, backfill from phone, then RLS) and should happen
before anything project-related is made public.

Confirm the RLS state yourself in the SQL editor:

```sql
select c.relname                                       as table_name,
       c.relrowsecurity                                as rls_enabled,
       c.relforcerowsecurity                           as rls_forced,
       coalesce((select string_agg(pol.polcmd || ':' || pol.polname, ', ')
                   from pg_policy pol
                  where pol.polrelid = c.oid), '—')   as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by c.relname;
```

After the new migration runs, `profiles` and `factories` should show
`rls_enabled = t` with SELECT-only policies.

## 8. Manual test checklist

After §1–§5 are done, walk this once — two accounts plus one browser each, and a
phone for the last column.

| # | As | Do | Expect |
| --- | --- | --- | --- |
| 1 | signed out | open `/account`, `/admin`, `/factory` | redirected to `/signin?next=…` |
| 2 | signed out | open `/set-password` | "One moment…", then the expired-link message |
| 3 | signed out | `/signin?next=https://evil.example.com` | no off-site redirect; card still shows Sign in |
| 4 | new customer | Create account with a 5-character password | inline "Use at least 8 characters", nothing sent |
| 5 | new customer | Create account with a real password | confirmation-email notice (or straight into `/account` if confirmation is off) |
| 6 | new customer | confirm, then sign in with the password | lands on `/account`; header shows their email |
| 7 | new customer | Forgot your password → request a reset | neutral notice, identical for real and unknown emails |
| 8 | new customer | use the reset link | `/set-password` form → set password → lands on `/account` |
| 9 | new customer | Continue with Google | returns to `/account`, name from Google, role still Customer |
| 9b | new customer | Continue with Apple (once the provider is on) | same landing; the accounts list may show a `@privaterelay.appleid.com` address |
| 10 | new customer | sign in in a second browser, sign out in the first | the next page load in the second browser is signed out |
| 11 | dcl_staff | open `/account`, then `/admin/accounts` | redirected to `/admin` both times |
| 12 | dcl_admin | open `/admin/accounts` | your own row is locked ("This is you") |
| 13 | dcl_admin | invite a Factory account with no factory chosen | inline "A factory account needs a factory" |
| 14 | dcl_admin | add a factory, invite the Factory account with it | invite email arrives; row shows `invited` / "Invitation not accepted yet" |
| 15 | invited user | open the invite link on a laptop **and** a phone | the password form appears without a second click; password saves |
| 16 | invited user | sign in with the new password | lands on `/factory` with the factory name and contact on file |
| 17 | factory user | open `/admin` or `/admin/accounts` | redirected to `/factory` |
| 18 | dcl_admin | change that user to DCL staff | next load lands on `/admin`; factory cleared |
| 19 | dcl_admin | "Switch access off" for a staff account; that user refreshes | signed out, "switched off" message; password sign-in refused too |
| 20 | dcl_admin | switch it back on | that user can sign in again |
| 21 | dcl_admin (only one) | change your own role / switch yourself off | refused — "You can't change your own access" |
| 22 | dcl_admin (only one) | demote or deactivate the last admin | refused — "last active DCL admin" |
| 23 | dcl_admin ×2 | invite a second admin, then demote the first | allowed, no lockout |
| 24 | anyone | `curl -X PATCH <SUPABASE_URL>/rest/v1/profiles?id=eq.<your id> -d '{"role":"dcl_admin"}'` with the publishable key | 401/403 — a browser cannot write roles |
| 25 | mobile | account popover, forgot-password mode, confirm field, show/hide | tap targets reachable, no overflow, correct keyboard hints |
| 26 | dcl_admin | "Email a sign-in link" twice in a row | second attempt is rate-limited with a friendly message |

## 9. Known gaps / deliberate limits

* **Legacy project tables are not owner-scoped yet** (§7). Accounts are the
  foundation; the `clients`/`projects` tables still identify customers by phone
  and are readable/writable with the publishable key.
* `/app` (the DICI chat) and `/project/[projectId]` are still public and
  unauthenticated. Pointing a project at an account is the next piece of work.
* "Invitation not accepted yet" is derived from Supabase Auth's
  `invited_at`/`email_confirmed_at`/`last_sign_in_at`, because Auth exposes no
  pending-invite flag. It is conservative: without the service key the list
  shows every admin-invited account as invited until they sign in.
* No audit table for role changes — the service-role actions log to the server
  console, and `profiles.invited_by` records who invited each account.
* Password policy is length-only (8 characters) plus Supabase's own defaults;
  there is no breach-password check (that would call HIBP from the server).
* Deleting an account (as opposed to switching it off) is not in the UI — use
  Supabase → Authentication → Users if it is ever needed.


## 10. Project data locked to accounts (2026-09-29)

Migration `supabase/migrations/20260929000000_lock_project_tables.sql` closes the
§7 leak. Apply it in the SQL editor **after a backup**, and run the preview query
at the top of the file first to see which old policies it replaces.

* `clients.owner_id` / `projects.owner_id` (default `auth.uid()`) and
  `projects.factory_id`. Existing rows are linked when a client's email matches an
  account's email; unmatched rows stay owner-less = DCL team only.
* RLS on all six legacy tables + the `project-files` bucket: customer → own rows,
  `dcl_staff`/`dcl_admin` → everything, `factory` → projects assigned to its
  factory, `anon` → nothing. `owner_id`, `factory_id` and `project_number` are not
  writable from the browser (column grants); assign factories via the service role.
* App side (already deployed with this commit): every `/api/projects/**` route and
  `/api/baba` use the caller's session (`lib/supabase/route.ts`) and return 401
  when signed out; `/app` and `/project/*` require sign-in (proxy + layout guard).

Verify after applying (read-only, publishable key): every one of the six tables
should answer 401 instead of returning rows.
