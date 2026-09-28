-- =========================================================
-- 20260928120000_accounts_and_roles.sql
-- DYE CUT LAB — role-based accounts + partner factories
-- =========================================================
--
-- Apply by pasting this whole file into
--   Supabase dashboard → SQL Editor → New query → Run
-- (this repo has no `supabase/config.toml` / CLI wiring, so migrations are
-- applied by hand; keep the timestamp order in this folder.)
--
-- WHAT THIS ADDS
--   1. `public.app_role` enum: customer | dcl_staff | dcl_admin | factory
--   2. `public.factories` — a partner factory; factory accounts belong to one
--   3. `public.profiles` — one row per auth.users row (display name, role …)
--   4. a trigger that gives every new auth user role 'customer'. The role is
--      NEVER taken from sign-up metadata, so a crafted sign-up (or a stale
--      client) cannot self-promote.
--   5. helper functions for RLS (security definer, `search_path = ''`)
--   6. RLS: you read your own row, DCL staff/admin read every row, a factory
--      account reads its own factory. NOTHING is writable through the API —
--      role/status changes only happen with the service role
--      (lib/supabase/admin.ts, used by app/admin/accounts).
--
-- ORDER / RE-RUN SAFETY
--   Written to run AFTER 20260928000000_create_profiles.sql, but also works
--   on a database where that file never ran: the table is created when it is
--   missing and upgraded in place when it already exists (text `role` →
--   enum, `avatar_url`/`updated_at` and the old self-update policy dropped).
--   Re-running this file is a no-op.

begin;

-- ---------------------------------------------------------
-- 1. Roles
-- ---------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'app_role' and n.nspname = 'public'
  ) then
    create type public.app_role as enum ('customer', 'dcl_staff', 'dcl_admin', 'factory');
  end if;
end
$$;

comment on type public.app_role is
  'Account role. customer = buyer, dcl_staff/dcl_admin = DYE CUT LAB team, factory = partner factory user.';

-- ---------------------------------------------------------
-- 2. Partner factories
-- ---------------------------------------------------------

create table if not exists public.factories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_email text,
  phone text,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint factories_name_length check (char_length(btrim(name)) between 1 and 120)
);

comment on table public.factories is
  'Partner factories. A profile with role ''factory'' points at one row here.';

-- Two factories with the same name would be indistinguishable in the picker.
create unique index if not exists factories_name_unique on public.factories (lower(btrim(name)));

-- ---------------------------------------------------------
-- 3. Profiles
-- ---------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role public.app_role not null default 'customer',
  factory_id uuid references public.factories (id) on delete set null,
  language text not null default 'en',
  invited_by uuid references public.profiles (id) on delete set null,
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth user: display name, role, factory and account status. Written by the sign-up trigger and by the service role only (see app/admin/accounts).';
-- The column comments live just after 3a, where the columns are guaranteed to
-- exist on a database that came from the first draft of this table.

-- 3a. Columns are re-checked individually so a database part-way through the
--     earlier draft converges here as well.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role public.app_role default 'customer';
alter table public.profiles add column if not exists factory_id uuid;
alter table public.profiles add column if not exists language text default 'en';
alter table public.profiles add column if not exists invited_by uuid;
alter table public.profiles add column if not exists disabled_at timestamptz;
alter table public.profiles add column if not exists created_at timestamptz default now();

comment on column public.profiles.role is
  'Never settable by the account holder: the API has no UPDATE grant on this table.';
comment on column public.profiles.email is
  'Copy of auth.users.email, kept in sync by handle_new_user() so the admin list is one query.';
comment on column public.profiles.factory_id is
  'Set for role = factory: the partner factory this account belongs to.';
comment on column public.profiles.invited_by is
  'Profile id of the DCL admin who invited this account (null for self sign-ups and Google).';
comment on column public.profiles.disabled_at is
  'Set when an admin deactivates the account. The app signs the user out and treats them as having no role.';

-- 3b. The first draft stored `role` as free text and let the account holder
--     write it (`grant update (full_name, avatar_url)` + an update policy).
--     Convert the column to the enum and remove that write path. Unknown
--     values become 'customer' — never a team role.
do $$
declare
  role_kind text;
  legacy_check text;
begin
  select c.data_type into role_kind
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'profiles'
    and c.column_name = 'role';

  if role_kind is not null and role_kind <> 'USER-DEFINED' then
    -- Every CHECK that mentions `role` goes first: Postgres revalidates
    -- constraints when a column type changes, and a text literal like
    -- ('customer','staff','factory') has no meaning in the new enum.
    for legacy_check in
      select conname
        from pg_constraint
       where conrelid = 'public.profiles'::regclass
         and contype = 'c'
         and pg_get_constraintdef(oid) ilike '%role%'
    loop
      execute format('alter table public.profiles drop constraint %I', legacy_check);
    end loop;

    alter table public.profiles alter column role drop default;

    alter table public.profiles
      alter column role type public.app_role
      using (
        case lower(btrim(coalesce(role::text, 'customer')))
          when 'dcl_admin' then 'dcl_admin'::public.app_role
          when 'admin'     then 'dcl_admin'::public.app_role
          when 'dcl_staff' then 'dcl_staff'::public.app_role
          when 'staff'     then 'dcl_staff'::public.app_role
          when 'factory'   then 'factory'::public.app_role
          else 'customer'::public.app_role
        end
      );
  end if;
end
$$;

update public.profiles set role = 'customer' where role is null;
alter table public.profiles alter column role set default 'customer'::public.app_role;
alter table public.profiles alter column role set not null;

update public.profiles set language = 'en' where language is null or btrim(language) = '';
alter table public.profiles alter column language set default 'en';
alter table public.profiles alter column language set not null;

-- Superseded by the pieces above: `avatar_url` (writable by its owner, read by
-- nothing) and `updated_at` (only fed the touch trigger).
drop trigger if exists profiles_touch_updated_at on public.profiles;
drop function if exists public.touch_profiles_updated_at();
drop function if exists public.current_user_role();
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
revoke update on table public.profiles from authenticated;
alter table public.profiles drop column if exists avatar_url;
alter table public.profiles drop column if exists updated_at;

-- 3c. Constraints + indexes (re-run safe: named lookups instead of `if not exists`).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_full_name_length' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_full_name_length
      check (full_name is null or char_length(full_name) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_language_values' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_language_values check (language in ('en', 'es'));
  end if;

  /* A factory pointer only makes sense on a factory account. Deliberately NOT
     "role = 'factory' requires factory_id": with `on delete set null` that
     would make deleting a factory fail while it still has members. The admin
     form enforces the pairing instead. */
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_factory_role_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_factory_role_check
      check (factory_id is null or role = 'factory');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_factory_id_fkey' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_factory_id_fkey foreign key (factory_id)
      references public.factories (id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_invited_by_fkey' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_invited_by_fkey foreign key (invited_by)
      references public.profiles (id) on delete set null;
  end if;
end
$$;

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_factory_id_idx on public.profiles (factory_id);

-- ---------------------------------------------------------
-- 4. Profile for every new auth user
-- ---------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    /* Google sends full_name/name; Apple sends a name only on the very first
       sign-in (and may hide the email behind a relay address). */
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''),
    /* Hard-coded: role is NEVER taken from raw_user_meta_data, so a crafted
       sign-up cannot create itself a team account. Admins set roles with the
       service role (app/admin/accounts) or in the SQL editor. */
    'customer'::public.app_role
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the public.profiles row for a new auth user with role customer. Closes the sign-up metadata role-injection hole.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------
-- 5. Helpers for RLS (security definer → no policy recursion, and the
--    caller's own row is read without RLS getting in the way)
-- ---------------------------------------------------------

/* The caller's role, or null when they are signed out, disabled, or have no
   profile yet. "Disabled counts as no role" is implemented here so every
   policy and the app agree. NOT named current_user_role (that was the previous
   text-returning helper) or current_role (a reserved word). */
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.disabled_at is null
$$;

create or replace function public.is_dcl_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.disabled_at is null
      and p.role in ('dcl_staff'::public.app_role, 'dcl_admin'::public.app_role)
  )
$$;

/* Factory id of the caller — only for an active factory account. Used by the
   factories policy so that policy doesn't have to query profiles itself. */
create or replace function public.my_factory_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.factory_id
  from public.profiles p
  where p.id = auth.uid()
    and p.disabled_at is null
    and p.role = 'factory'::public.app_role
$$;

revoke all on function public.current_app_role() from public;
revoke all on function public.is_dcl_team() from public;
revoke all on function public.my_factory_id() from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_dcl_team() to authenticated;
grant execute on function public.my_factory_id() to authenticated;

-- ---------------------------------------------------------
-- 6. Row Level Security
--    Read-only for the API: there is deliberately no INSERT/UPDATE/DELETE
--    policy and no write grant, so "update public.profiles set role=..." from
--    a browser (publishable key) fails. Role and status changes go through the
--    service role from app/admin/accounts only.
-- ---------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.factories enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.factories from anon, authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.factories to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_select_dcl_team on public.profiles;
create policy profiles_select_dcl_team
  on public.profiles
  for select
  to authenticated
  using (public.is_dcl_team());

drop policy if exists factories_select_dcl_team on public.factories;
create policy factories_select_dcl_team
  on public.factories
  for select
  to authenticated
  using (public.is_dcl_team());

drop policy if exists factories_select_own_factory on public.factories;
create policy factories_select_own_factory
  on public.factories
  for select
  to authenticated
  using (id = public.my_factory_id());

-- ---------------------------------------------------------
-- 7. Backfill: everyone who signed up before the trigger existed.
--    Role stays 'customer'; an admin promotes them afterwards.
-- ---------------------------------------------------------

insert into public.profiles (id, email, full_name)
select
  u.id,
  u.email,
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), '')
from auth.users u
on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name);

commit;
