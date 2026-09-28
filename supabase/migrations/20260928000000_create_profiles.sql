-- =========================================================
-- 20260928000000_create_profiles.sql
-- DYE CUT LAB — accounts: one profile + role per signed-in user
-- =========================================================
--
-- Apply with either:
--   supabase db push            (after `supabase link --project-ref ...`)
--   or paste this file into the Supabase dashboard SQL editor
--
-- Sign-in itself (Google, Apple, email link) is handled by Supabase Auth
-- (auth.users). This table adds what the app needs on top: a display name
-- and a ROLE — customer, staff (DYE CUT LAB team) or factory.
--
-- Security model:
--   • Every new auth user gets a profile automatically, role 'customer'.
--   • A user can read and edit their own name/avatar — never their role.
--   • Staff can read every profile.
--   • Roles are changed only by staff via the dashboard / service role:
--       update public.profiles set role = 'staff' where email = '...';

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role text not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_role_values check (role in ('customer', 'staff', 'factory')),
  constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 120)
);

comment on table public.profiles is
  'One row per signed-in user (auth.users). Holds display name and role: customer, staff or factory.';

create index if not exists profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------
-- Create a profile automatically on first sign-in
-- ---------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    -- Google sends full_name/name; Apple sends a name only on the very
    -- first sign-in (and may hide the email behind a relay address).
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_profiles_updated_at();

-- ---------------------------------------------------------
-- Role helper for RLS (security definer avoids policy recursion)
-- ---------------------------------------------------------

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
-- Column-level: users may change only these two columns, never role/email.
grant update (full_name, avatar_url) on table public.profiles to authenticated;

drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.current_user_role() = 'staff');

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Backfill: anyone who signed in before this migration ran.
insert into public.profiles (id, email, full_name, avatar_url)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
from auth.users u
on conflict (id) do nothing;
