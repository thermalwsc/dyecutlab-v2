-- =========================================================
-- 20261006000000_quote_requests_customer.sql
-- DYE CUT LAB — who sent a /start request (signed-in customers)
-- =========================================================
--
-- Apply by pasting this file into the Supabase SQL editor (or `supabase db push`).
-- Requires: 20260925010000_create_quote_requests.sql,
--           20261001000000_team_reads_requests.sql
--
-- When a signed-in customer sends a request, the server records which account
-- it came from plus their name and email, so the team sees who it is without
-- asking. Guests still send requests exactly as before (all three stay null).
--
--   user_id         the customer's auth account (set null if the account is deleted)
--   customer_name   profile name at the time of the request
--   customer_email  account email at the time of the request
--
-- Trust: these three columns are written ONLY by the server (service role)
-- after it verifies the session. Browsers (anon / authenticated) keep exactly
-- the insert they had before, now spelled out per column, so nobody can fake
-- another person's name or email by calling the API directly.
--
-- No policy is changed. The existing team policies already let the team read
-- these columns (table-level select + is_dcl_team()); customers and guests
-- still cannot read any request.

alter table public.quote_requests
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists customer_name text,
  add column if not exists customer_email text;

comment on column public.quote_requests.user_id is
  'Customer account that sent the request (null for guests). Server-written only.';
comment on column public.quote_requests.customer_name is
  'Customer name from their profile when the request was sent. Server-written only.';
comment on column public.quote_requests.customer_email is
  'Customer email from their account when the request was sent. Server-written only.';

create index if not exists quote_requests_user_id_idx
  on public.quote_requests (user_id);

-- Keep browser inserts to the original columns only.
revoke insert on table public.quote_requests from anon, authenticated;
grant insert (id, description, phone, sms_consent, source, status, created_at)
  on table public.quote_requests to anon, authenticated;

-- Check afterwards (expect only the seven original columns for anon and authenticated):
--   select grantee, column_name from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'quote_requests'
--     and privilege_type = 'INSERT' and grantee in ('anon', 'authenticated')
--   order by grantee, column_name;
