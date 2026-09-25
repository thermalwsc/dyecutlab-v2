-- =========================================================
-- 20260925000000_create_subscribers.sql
-- DYE CUT LAB — landing page lead capture (/updates)
-- =========================================================
--
-- Apply with either:
--   supabase db push            (after `supabase link --project-ref ...`)
--   or paste this file into the Supabase dashboard SQL editor
--
-- Writes happen only through POST /api/subscribers. That route uses the
-- public (anon) key, so this table is INSERT-only for clients. Reads are
-- intentionally impossible for anon/authenticated: admin reads happen in
-- the dashboard / with the service role, which bypasses RLS.

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  phone text,
  email_opt_in boolean not null default true,
  sms_opt_in boolean not null default true,
  source text not null default 'landing_page',
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz,

  -- At least one contact channel is required.
  constraint subscribers_contact_required
    check (email is not null or phone is not null),

  -- Store normalized values (lowercase email, E.164 phone) from day one.
  constraint subscribers_email_format
    check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint subscribers_email_length
    check (email is null or char_length(email) <= 254),
  constraint subscribers_phone_format
    check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint subscribers_name_length
    check (name is null or char_length(name) <= 120),
  constraint subscribers_source_length
    check (char_length(source) between 1 and 64),

  -- An opt-in flag can only be true for a channel we actually have.
  constraint subscribers_email_opt_in_requires_email
    check (email_opt_in is false or email is not null),
  constraint subscribers_sms_opt_in_requires_phone
    check (sms_opt_in is false or phone is not null)
);

comment on table public.subscribers is
  'Landing page sign-ups for DYE CUT LAB product updates (email and/or SMS). Source of truth for our app; Brevo contacts are only a mirror.';
comment on column public.subscribers.unsubscribed_at is
  'Set by unsubscribe / SMS STOP handling. NULL means active. Not written by the public form.';

-- Case-insensitive email uniqueness + phone uniqueness let the insert-only
-- API route detect duplicates through a unique violation (Postgres 23505)
-- instead of needing a read.
create unique index if not exists subscribers_email_unique_idx
  on public.subscribers (lower(email))
  where email is not null;

create unique index if not exists subscribers_phone_unique_idx
  on public.subscribers (phone)
  where phone is not null;

create index if not exists subscribers_created_at_idx
  on public.subscribers (created_at desc);

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------

alter table public.subscribers enable row level security;

-- No SELECT / UPDATE / DELETE grants for the public roles.
revoke all on table public.subscribers from anon, authenticated;
grant insert on table public.subscribers to anon, authenticated;

drop policy if exists "subscribers_public_insert" on public.subscribers;

create policy "subscribers_public_insert"
  on public.subscribers
  for insert
  to anon, authenticated
  with check (
    unsubscribed_at is null
    and char_length(source) between 1 and 64
    and (name is null or char_length(name) <= 120)
    and (email is null or char_length(email) <= 254)
    and (phone is null or char_length(phone) <= 20)
  );

-- No SELECT policy is created on purpose: the public form can add rows but
-- can never read the list back. Admin/service-role reads bypass RLS.
