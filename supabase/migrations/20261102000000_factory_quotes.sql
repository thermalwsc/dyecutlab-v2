-- =========================================================
-- 20261102000000_factory_quotes.sql
-- DYE CUT LAB — the factory's quote for a project, and the team's decision on it
-- =========================================================
--
-- Apply by pasting this file into the Supabase SQL editor (or `supabase db push`).
-- Requires: 20260928120000_accounts_and_roles.sql (is_dcl_team(), my_factory_id(), factories),
--           20260929000000_lock_project_tables.sql (projects, projects.factory_id).
--
-- What it adds
--   • public.factory_quotes: one row each time a factory (or the team, for a quote that
--     came by text or email) sends a price for a project. Sending a new one on the same
--     project makes the earlier undecided one 'superseded', so there is always at most
--     one live quote. The total is worked out by the database
--     (quantity x price per piece + tooling), so it can never disagree with its parts.
--
-- The life of a quote
--     submitted ──► approved   (the DYE CUT LAB team approves it: this becomes the basis
--          │                    of the verified quote the customer may see)
--          ├──────► rejected   (needs a reason, written by the team)
--          └──────► superseded (set automatically when a newer quote arrives)
--   An approved or rejected quote is final, and a project has at most one approved quote.
--
-- Who can do what
--   • a factory: reads and sends quotes ONLY for projects assigned to its own factory.
--     It cannot choose the version, the status, the factory or who decided, and it
--     cannot edit or delete a quote once sent (it sends a new version instead).
--   • the DYE CUT LAB team: reads everything, can record a quote for a factory, and
--     decides (approve or reject) with a note.
--   • customers and everyone else: nothing. Customers will only ever see the team's
--     verified quote, never what a factory sent.
--   • nobody can delete a quote.
--
-- All amounts are US dollars.
--
-- What does NOT change: no existing table, policy or function is touched.

-- ---------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------
create table if not exists public.factory_quotes (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  factory_id      uuid not null references public.factories (id),
  version         integer not null check (version > 0),
  status          text not null default 'submitted'
                  check (status in ('submitted', 'approved', 'rejected', 'superseded')),
  quantity        integer not null check (quantity > 0),
  price_per_piece numeric(12, 4) not null check (price_per_piece >= 0),
  tooling_cost    numeric(12, 2) not null default 0 check (tooling_cost >= 0),
  total           numeric(14, 2) generated always as (round(quantity * price_per_piece + tooling_cost, 2)) stored,
  lead_days       integer check (lead_days is null or lead_days >= 0),
  notes           text check (notes is null or char_length(notes) <= 2000),
  team_note       text check (team_note is null or char_length(team_note) <= 2000),
  submitted_by    uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  decided_by      uuid references auth.users (id) on delete set null,
  decided_at      timestamptz,
  unique (project_id, version),
  check (status <> 'rejected' or btrim(coalesce(team_note, '')) <> '')
);

-- At most one approved quote per project.
create unique index if not exists factory_quotes_one_approved
  on public.factory_quotes (project_id) where status = 'approved';

create index if not exists factory_quotes_project_idx on public.factory_quotes (project_id, version desc);
create index if not exists factory_quotes_factory_idx on public.factory_quotes (factory_id, created_at desc);

comment on table public.factory_quotes is
  'A factory''s quote for a project and the team''s decision on it. Factories and the DYE CUT LAB team only; customers never read it. Never deleted.';

-- ---------------------------------------------------------
-- 2. Sending a quote: the database fills in everything the sender must not choose
-- ---------------------------------------------------------
create or replace function public.factory_quotes_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_factory uuid;
begin
  select p.factory_id into v_factory from public.projects p where p.id = new.project_id;
  if v_factory is null then
    raise exception 'This project has no factory assigned, so it cannot have a factory quote.'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.project_id::text, 1));

  select coalesce(max(q.version), 0) + 1 into new.version
  from public.factory_quotes q where q.project_id = new.project_id;

  new.factory_id   := v_factory;
  new.status       := 'submitted';
  new.submitted_by := auth.uid();
  new.team_note    := null;
  new.decided_by   := null;
  new.decided_at   := null;
  return new;
end;
$$;

drop trigger if exists factory_quotes_prepare on public.factory_quotes;
create trigger factory_quotes_prepare
  before insert on public.factory_quotes
  for each row execute function public.factory_quotes_prepare();

-- A newer quote replaces the earlier ones that nobody has decided yet.
create or replace function public.factory_quotes_supersede()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.factory_quotes
     set status = 'superseded'
   where project_id = new.project_id
     and id <> new.id
     and status = 'submitted';
  return null;
end;
$$;

drop trigger if exists factory_quotes_supersede on public.factory_quotes;
create trigger factory_quotes_supersede
  after insert on public.factory_quotes
  for each row execute function public.factory_quotes_supersede();

-- ---------------------------------------------------------
-- 3. Deciding: only submitted -> approved or rejected, and the database records who and when.
--    'superseded' can only be set by the automatic step above (a nested trigger).
-- ---------------------------------------------------------
create or replace function public.factory_quotes_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'submitted' and new.status in ('approved', 'rejected') then
      new.decided_by := (select auth.uid());
      new.decided_at := now();
    elsif old.status = 'submitted' and new.status = 'superseded' and pg_trigger_depth() > 1 then
      null;
    else
      raise exception 'A % quote cannot be changed to %.', old.status, new.status
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists factory_quotes_guard_update on public.factory_quotes;
create trigger factory_quotes_guard_update
  before update on public.factory_quotes
  for each row execute function public.factory_quotes_guard_update();

-- ---------------------------------------------------------
-- 4. Access
-- ---------------------------------------------------------
alter table public.factory_quotes enable row level security;

revoke all on table public.factory_quotes from anon, authenticated;
grant select on table public.factory_quotes to authenticated;
-- Only what the sender may type. Version, factory, status and who sent it are set above.
grant insert (project_id, quantity, price_per_piece, tooling_cost, lead_days, notes) on table public.factory_quotes to authenticated;
-- Only what the team may change afterwards.
grant update (status, team_note) on table public.factory_quotes to authenticated;

drop policy if exists factory_quotes_team_select on public.factory_quotes;
create policy factory_quotes_team_select on public.factory_quotes for select to authenticated
  using (public.is_dcl_team());

drop policy if exists factory_quotes_factory_select on public.factory_quotes;
create policy factory_quotes_factory_select on public.factory_quotes for select to authenticated
  using (factory_id = (select public.my_factory_id()));

-- A factory may send a quote only for a project assigned to its own factory; the team may
-- record one for any project that has a factory.
drop policy if exists factory_quotes_insert on public.factory_quotes;
create policy factory_quotes_insert on public.factory_quotes for insert to authenticated
  with check (
    public.is_dcl_team()
    or exists (
      select 1 from public.projects p
      where p.id = factory_quotes.project_id and p.factory_id = (select public.my_factory_id())
    )
  );

drop policy if exists factory_quotes_team_update on public.factory_quotes;
create policy factory_quotes_team_update on public.factory_quotes for update to authenticated
  using (public.is_dcl_team()) with check (public.is_dcl_team());

-- Check afterwards (read-only). Expect: RLS on.
--   select relname, relrowsecurity from pg_class where oid = 'public.factory_quotes'::regclass;
-- Full proof (nothing is saved): paste supabase/tests/factory_quotes_checks.sql.
