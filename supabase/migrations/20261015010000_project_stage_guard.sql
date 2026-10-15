-- =========================================================
-- 20261015010000_project_stage_guard.sql
-- DYE CUT LAB — only the team (and the server) may move a project's stage
-- =========================================================
--
-- Apply by pasting this file into the Supabase SQL editor (or `supabase db push`).
-- Requires: 20260929000000_lock_project_tables.sql,
--           20261015000000_project_activity.sql
--
-- Found by supabase/tests/project_activity_checks.sql: the column grants from
-- 20260929000000 let a signed-in customer update `status` on their OWN project,
-- so a customer could mark it "Delivered" by talking to the database directly.
-- The stage drives what the customer, the team and the factory see, so it must
-- not be the customer's to change.
--
-- What this adds (two small triggers on public.projects; no existing policy,
-- grant or column is changed):
--   • UPDATE: if the stage changes, the caller must be the DYE CUT LAB team.
--     A customer or factory account that tries gets "insufficient privilege".
--     Changing OTHER fields, or sending the same stage again (the start-your-
--     project page does this), still works for the owner.
--   • INSERT: a customer can only create a project at the starting stages
--     ('lead' or 'development'), not at "Delivered".
--
-- Who is NOT affected
--   • the DYE CUT LAB team, who edit projects as themselves
--   • server code using the service role (the factory's status buttons) and the
--     SQL editor: they run without a signed-in user (auth.uid() is null), and the
--     website only reaches them after checking the person's role itself
--
-- How to undo: drop trigger project_stage_guard_update / project_stage_guard_insert
-- on public.projects.

create or replace function public.guard_project_stage_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and auth.uid() is not null
     and not public.is_dcl_team() then
    raise exception 'Only the DYE CUT LAB team can change a project stage.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.guard_project_stage_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and not public.is_dcl_team()
     and new.status is not null
     and new.status not in ('lead', 'development') then
    raise exception 'A new project must start at the first stage.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_project_stage_update() from public;
revoke all on function public.guard_project_stage_insert() from public;

drop trigger if exists project_stage_guard_update on public.projects;
create trigger project_stage_guard_update
  before update on public.projects
  for each row execute function public.guard_project_stage_update();

drop trigger if exists project_stage_guard_insert on public.projects;
create trigger project_stage_guard_insert
  before insert on public.projects
  for each row execute function public.guard_project_stage_insert();
