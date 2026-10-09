-- =========================================================
-- 20261008000000_usage_limits.sql
-- DYE CUT LAB — daily usage counters for AI and upload limits
-- =========================================================
--
-- Apply by pasting this file into the Supabase SQL editor (or `supabase db push`).
--
-- The server counts how many times each account uses the AI chat, AI file
-- analysis, file checks and uploads each day, and stops at the limits set in
-- lib/usageLimits.ts. The count has to live in the database (not in memory)
-- because the site runs on several short-lived servers that do not share memory.
--
-- Safety: the table and the function are for the SERVER ONLY (service role).
-- Browsers (anon / authenticated) cannot read, write or call either, so
-- nobody can reset or inflate their own counters.
--
-- A fixed all-zero user id is used for the site-wide daily total.

create table if not exists public.usage_daily (
  user_id uuid not null,
  day     date not null,
  kind    text not null,
  calls   integer not null default 0,
  primary key (user_id, day, kind)
);

comment on table public.usage_daily is
  'Per-account daily counters for AI and upload limits. Server (service role) only. user_id 00000000-0000-0000-0000-000000000000 = site-wide total.';

alter table public.usage_daily enable row level security;
-- No policies on purpose: with RLS on and no policy, only the service role can touch it.
revoke all on table public.usage_daily from anon, authenticated;

-- Adds one use and says whether the caller is still within the limit.
create or replace function public.bump_usage(p_user uuid, p_kind text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calls integer;
begin
  insert into public.usage_daily (user_id, day, kind, calls)
  values (p_user, (now() at time zone 'utc')::date, p_kind, 1)
  on conflict (user_id, day, kind)
  do update set calls = public.usage_daily.calls + 1
  returning calls into v_calls;

  -- Housekeeping: now and then drop counters older than two weeks.
  if random() < 0.01 then
    delete from public.usage_daily where day < (now() at time zone 'utc')::date - 14;
  end if;

  return v_calls <= p_limit;
end;
$$;

revoke all on function public.bump_usage(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.bump_usage(uuid, text, integer) to service_role;

-- Check afterwards (read-only). Expect: usage_daily has RLS on, and only
-- service_role may execute bump_usage.
--   select relrowsecurity from pg_class where oid = 'public.usage_daily'::regclass;
--   select grantee from information_schema.routine_privileges
--   where routine_schema = 'public' and routine_name = 'bump_usage' order by grantee;
