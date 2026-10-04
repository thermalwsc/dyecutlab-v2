-- =========================================================
-- 20261001000000_team_reads_requests.sql
-- DYE CUT LAB — let the DCL team read quote requests + sign-ups
-- =========================================================
--
-- quote_requests and subscribers were created INSERT-only: the public forms
-- can add rows but nobody could read them except through the dashboard. The
-- team workspace (/admin) needs to list them, so:
--   • dcl_staff / dcl_admin can SELECT both tables
--   • dcl_staff / dcl_admin can UPDATE quote_requests.status only
--   • the public stays insert-only (existing policies untouched)
--
-- Requires 20260928120000_accounts_and_roles.sql (public.is_dcl_team()).
-- Safe to re-run.

grant select on table public.quote_requests to authenticated;
grant update (status) on table public.quote_requests to authenticated;

drop policy if exists quote_requests_select_team on public.quote_requests;
create policy quote_requests_select_team on public.quote_requests
  for select to authenticated
  using (public.is_dcl_team());

drop policy if exists quote_requests_update_team on public.quote_requests;
create policy quote_requests_update_team on public.quote_requests
  for update to authenticated
  using (public.is_dcl_team())
  with check (public.is_dcl_team());

grant select on table public.subscribers to authenticated;

drop policy if exists subscribers_select_team on public.subscribers;
create policy subscribers_select_team on public.subscribers
  for select to authenticated
  using (public.is_dcl_team());

-- Check (read-only): anon must still get 401 on both tables.
