-- =========================================================
-- 20260925010000_create_quote_requests.sql
-- DYE CUT LAB — "Start your project" quote requests (/start)
-- =========================================================
--
-- Apply with either:
--   supabase db push            (after `supabase link --project-ref ...`)
--   or paste this file into the Supabase dashboard SQL editor
--
-- Distinct from public.subscribers: a quote request is a sales lead a
-- staff member follows up by text, not a newsletter sign-up.
--
-- Writes happen only through POST /api/quote-requests, which uses the
-- public (anon) key, so this table is INSERT-only for clients — same
-- model as subscribers. Staff read/update it in the Supabase dashboard
-- (service role bypasses RLS).
--
-- Kept when the temporary /start page is removed: it holds real leads.

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  phone text not null,
  sms_consent boolean not null default true,
  source text not null default 'start_page',
  status text not null default 'new',
  created_at timestamptz not null default now(),

  constraint quote_requests_description_length
    check (char_length(description) between 10 and 1000),
  constraint quote_requests_phone_format
    check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint quote_requests_source_length
    check (char_length(source) between 1 and 64),
  -- Staff move a request along by hand in the dashboard.
  constraint quote_requests_status_values
    check (status in ('new', 'contacted', 'quoted', 'won', 'lost'))
);

comment on table public.quote_requests is
  'Project/quote requests from the /start page. Staff are notified by Brevo SMS + email and follow up by text.';
comment on column public.quote_requests.status is
  'Updated by staff in the dashboard: new → contacted → quoted → won/lost.';

create index if not exists quote_requests_created_at_idx
  on public.quote_requests (created_at desc);

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------

alter table public.quote_requests enable row level security;

revoke all on table public.quote_requests from anon, authenticated;
grant insert on table public.quote_requests to anon, authenticated;

drop policy if exists "quote_requests_public_insert" on public.quote_requests;

-- The public can only create a fresh, consented request; they can never
-- set a status or read anything back.
create policy "quote_requests_public_insert"
  on public.quote_requests
  for insert
  to anon, authenticated
  with check (
    status = 'new'
    and sms_consent is true
    and char_length(description) between 10 and 1000
    and char_length(phone) <= 20
    and char_length(source) between 1 and 64
  );
