-- =========================================================
-- 20261105000000_factory_change_notes.sql
-- DYE CUT LAB — what a factory changed on a project, and why
-- =========================================================
--
-- Apply by pasting this file into the Supabase SQL editor (or `supabase db push`).
-- Requires: 20260928120000_accounts_and_roles.sql (is_dcl_team(), my_factory_id(), factories),
--           20260929000000_lock_project_tables.sql (projects, projects.factory_id).
--
-- The blueprint's rule: "whenever the factory changes artwork, pricing, material, process
-- or timing, capture what changed and why. Those interventions become the knowledge base for
-- future DICI automation." This is that record: one short, permanent note each time.
--
-- What it adds
--   • public.factory_change_notes: the kind of change (artwork, price, material, finish,
--     timing or other), what changed, and why. The database fills in the factory (taken
--     from the project), who wrote it and when, so none of those can be forged.
--
-- Who can do what
--   • a factory: writes and reads notes ONLY for projects assigned to its own factory. It
--     cannot edit or delete a note afterwards, so the history stays honest.
--   • the DYE CUT LAB team: reads everything and can add a note for any project that has a
--     factory (for a change the factory told them about by text or email).
--   • customers and everyone else: nothing.
--   • nobody can edit or delete a note.
--
-- What does NOT change: no existing table, policy or function is touched.

create table if not exists public.factory_change_notes (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  factory_id   uuid not null references public.factories (id),
  kind         text not null check (kind in ('artwork', 'price', 'material', 'finish', 'timing', 'other')),
  what_changed text not null check (btrim(what_changed) <> '' and char_length(what_changed) <= 1000),
  reason       text not null check (btrim(reason) <> '' and char_length(reason) <= 1000),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists factory_change_notes_project_idx on public.factory_change_notes (project_id, created_at desc);
create index if not exists factory_change_notes_factory_idx on public.factory_change_notes (factory_id, created_at desc);

comment on table public.factory_change_notes is
  'What a factory changed on a project, and why. Factories and the DYE CUT LAB team only; never edited or deleted. Feeds future automation.';

-- The database fills in everything the writer must not choose.
create or replace function public.factory_change_notes_prepare()
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
    raise exception 'This project has no factory assigned, so it cannot have a factory change note.'
      using errcode = '23514';
  end if;

  new.factory_id := v_factory;
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists factory_change_notes_prepare on public.factory_change_notes;
create trigger factory_change_notes_prepare
  before insert on public.factory_change_notes
  for each row execute function public.factory_change_notes_prepare();

-- ---------------------------------------------------------
-- Access
-- ---------------------------------------------------------
alter table public.factory_change_notes enable row level security;

revoke all on table public.factory_change_notes from anon, authenticated;
grant select on table public.factory_change_notes to authenticated;
-- Only what the writer may type. No update, no delete, for anyone.
grant insert (project_id, kind, what_changed, reason) on table public.factory_change_notes to authenticated;

drop policy if exists factory_change_notes_team_select on public.factory_change_notes;
create policy factory_change_notes_team_select on public.factory_change_notes for select to authenticated
  using (public.is_dcl_team());

drop policy if exists factory_change_notes_factory_select on public.factory_change_notes;
create policy factory_change_notes_factory_select on public.factory_change_notes for select to authenticated
  using (factory_id = (select public.my_factory_id()));

drop policy if exists factory_change_notes_insert on public.factory_change_notes;
create policy factory_change_notes_insert on public.factory_change_notes for insert to authenticated
  with check (
    public.is_dcl_team()
    or exists (
      select 1 from public.projects p
      where p.id = factory_change_notes.project_id and p.factory_id = (select public.my_factory_id())
    )
  );

-- Check afterwards (read-only). Expect: RLS on.
--   select relname, relrowsecurity from pg_class where oid = 'public.factory_change_notes'::regclass;
-- Full proof (nothing is saved): paste supabase/tests/factory_change_notes_checks.sql.
