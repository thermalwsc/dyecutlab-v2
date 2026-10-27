-- =========================================================
-- 20261028000000_quote_versions.sql
-- DYE CUT LAB — every estimate saved as a numbered version on its project
-- =========================================================
--
-- Apply by pasting this file into the Supabase SQL editor (or `supabase db push`).
-- Requires: 20260928120000_accounts_and_roles.sql (is_dcl_team()),
--           20260929000000_lock_project_tables.sql (projects, owner_id),
--           20261026000000_pricing_tables.sql (the numbers an estimate uses).
--
-- What it adds
--   • public.quote_versions: one row per saved estimate (version 1, 2, 3 ...) holding
--     only what a CUSTOMER may see: quantity, total, price per piece, lead time,
--     what is and is not included, and the estimate notice.
--   • public.quote_version_details: the PRIVATE side of the same version, team only:
--     the full inputs (including the price rows that were used, so a later price
--     change never alters an old quote), the cost lines, the cost, the margin and
--     the name of the margin rule.
--   • public.save_quote_version(...): the one way a version is saved. It gives the
--     next number for the project and writes both rows together.
--
-- Who can do what
--   • the DYE CUT LAB team: reads everything, saves versions, and chooses when a
--     version is shown to the customer (shown_to_customer).
--   • the customer who owns the project: reads ONLY versions the team has shown to
--     them, and only the customer-safe table. Never the details.
--   • factories and everyone else: nothing. Factories do not see prices.
--   • nobody can edit or delete a saved version through the website or API. The only
--     column that can change is shown_to_customer; a versions history stays honest.
--
-- All amounts are US dollars.
--
-- What does NOT change: no existing table, policy or function is touched, and no
-- customer sees anything until the team shows a version.

-- ---------------------------------------------------------
-- 1. The customer-safe side
-- ---------------------------------------------------------
create table if not exists public.quote_versions (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects (id) on delete cascade,
  version             integer not null check (version > 0),
  created_at          timestamptz not null default now(),
  quantity            integer not null check (quantity > 0),
  sell_total          numeric(12, 2) not null check (sell_total >= 0),
  sell_per_piece      numeric(12, 4) not null check (sell_per_piece >= 0),
  lead_days           integer check (lead_days is null or lead_days >= 0),
  includes            text[] not null default '{}',
  excludes            text[] not null default '{}',
  notice              text not null check (btrim(notice) <> ''),
  shown_to_customer   boolean not null default false,
  shown_at            timestamptz,
  unique (project_id, version)
);

create index if not exists quote_versions_project_idx on public.quote_versions (project_id, version desc);

comment on table public.quote_versions is
  'Quoting engine: one row per saved estimate of a project. Customer-safe fields only; a customer reads a row only after the team sets shown_to_customer. Rows are never edited or deleted.';

-- ---------------------------------------------------------
-- 2. The private side (team only)
-- ---------------------------------------------------------
create table if not exists public.quote_version_details (
  version_id   uuid primary key references public.quote_versions (id) on delete cascade,
  created_by   uuid references auth.users (id) on delete set null,
  inputs       jsonb not null,
  lines        jsonb not null,
  cost         numeric(12, 2) not null check (cost >= 0),
  margin       numeric(5, 4) not null check (margin >= 0 and margin < 0.95),
  margin_rule  text not null
);

comment on table public.quote_version_details is
  'Quoting engine: the private half of a quote version. The inputs include the price rows that were used, so later price changes never alter an old quote. Team only.';

-- ---------------------------------------------------------
-- 3. When a version is shown, remember when
-- ---------------------------------------------------------
create or replace function public.quote_versions_stamp_shown()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.shown_to_customer and not old.shown_to_customer then
    new.shown_at := now();
  elsif not new.shown_to_customer then
    new.shown_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists quote_versions_stamp_shown on public.quote_versions;
create trigger quote_versions_stamp_shown
  before update on public.quote_versions
  for each row execute function public.quote_versions_stamp_shown();

-- ---------------------------------------------------------
-- 4. Access
-- ---------------------------------------------------------
alter table public.quote_versions enable row level security;
alter table public.quote_version_details enable row level security;

revoke all on table public.quote_versions from anon, authenticated;
revoke all on table public.quote_version_details from anon, authenticated;

grant select, insert on table public.quote_versions to authenticated;
grant select, insert on table public.quote_version_details to authenticated;
-- The only column anyone can change afterwards.
grant update (shown_to_customer) on table public.quote_versions to authenticated;

drop policy if exists quote_versions_team_select on public.quote_versions;
create policy quote_versions_team_select on public.quote_versions for select to authenticated
  using (public.is_dcl_team());

drop policy if exists quote_versions_team_insert on public.quote_versions;
create policy quote_versions_team_insert on public.quote_versions for insert to authenticated
  with check (public.is_dcl_team());

drop policy if exists quote_versions_team_update on public.quote_versions;
create policy quote_versions_team_update on public.quote_versions for update to authenticated
  using (public.is_dcl_team()) with check (public.is_dcl_team());

-- The customer who owns the project, and only for versions the team has shown.
drop policy if exists quote_versions_owner_select on public.quote_versions;
create policy quote_versions_owner_select on public.quote_versions for select to authenticated
  using (
    shown_to_customer
    and exists (
      select 1 from public.projects p
      where p.id = quote_versions.project_id and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists quote_version_details_team_select on public.quote_version_details;
create policy quote_version_details_team_select on public.quote_version_details for select to authenticated
  using (public.is_dcl_team());

drop policy if exists quote_version_details_team_insert on public.quote_version_details;
create policy quote_version_details_team_insert on public.quote_version_details for insert to authenticated
  with check (public.is_dcl_team());

-- ---------------------------------------------------------
-- 5. The one way to save a version
--    Runs as the caller, so the rules above decide who may use it: a customer,
--    a factory or a signed-out visitor is refused when it tries to insert.
--    The advisory lock stops two saves at the same moment from taking the same
--    number.
-- ---------------------------------------------------------
create or replace function public.save_quote_version(
  p_project        uuid,
  p_quantity       integer,
  p_sell_total     numeric,
  p_sell_per_piece numeric,
  p_lead_days      integer,
  p_includes       text[],
  p_excludes       text[],
  p_notice         text,
  p_inputs         jsonb,
  p_lines          jsonb,
  p_cost           numeric,
  p_margin         numeric,
  p_margin_rule    text
)
returns public.quote_versions
language plpgsql
set search_path = ''
as $$
declare
  v_version integer;
  v_row     public.quote_versions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_project::text, 0));

  select coalesce(max(version), 0) + 1 into v_version
  from public.quote_versions where project_id = p_project;

  insert into public.quote_versions
    (project_id, version, quantity, sell_total, sell_per_piece, lead_days, includes, excludes, notice)
  values
    (p_project, v_version, p_quantity, p_sell_total, p_sell_per_piece, p_lead_days,
     coalesce(p_includes, '{}'), coalesce(p_excludes, '{}'), p_notice)
  returning * into v_row;

  insert into public.quote_version_details
    (version_id, created_by, inputs, lines, cost, margin, margin_rule)
  values
    (v_row.id, (select auth.uid()), p_inputs, p_lines, p_cost, p_margin, p_margin_rule);

  return v_row;
end;
$$;

revoke all on function public.save_quote_version(uuid, integer, numeric, numeric, integer, text[], text[], text, jsonb, jsonb, numeric, numeric, text)
  from public, anon;
grant execute on function public.save_quote_version(uuid, integer, numeric, numeric, integer, text[], text[], text, jsonb, jsonb, numeric, numeric, text)
  to authenticated, service_role;

-- Check afterwards (read-only). Expect: both tables have RLS on.
--   select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relname like 'quote\_version%' and relkind = 'r' order by relname;
-- Full proof (nothing is saved): paste supabase/tests/quote_versions_checks.sql.
