-- =========================================================
-- 20261015000000_project_activity.sql
-- DYE CUT LAB — a history of every project stage change
-- =========================================================
--
-- Apply by pasting this file into the Supabase SQL editor (or `supabase db push`).
-- Requires: 20260928120000_accounts_and_roles.sql,
--           20260929000000_lock_project_tables.sql
--
-- What it adds
--   • public.project_activity: one row for the moment a project was created and
--     one row for every stage change (from, to, who, when)
--   • two triggers on public.projects that write those rows, so every path is
--     recorded, whichever part of the site (or the database editor) made the change
--   • projects.acting_user_id: a short-lived column used ONLY by server code that
--     writes with the service role (the factory's status buttons), where the
--     database cannot tell who the signed-in user is. The trigger reads it, records
--     it as the actor and clears it again.
--
-- Who can do what with the history
--   • read: whoever can open the project (owner, DYE CUT LAB team, and the factory
--     assigned to it), using the same can_access_project() rule as messages and files
--   • write, edit, delete: nobody through the website or the API. Only the triggers
--     below write, and there is no policy that lets anyone change or remove rows.
--
-- What does NOT change: existing rules and policies on projects stay exactly as
-- they are.

-- ---------------------------------------------------------
-- 1. The transient "who is acting" column
-- ---------------------------------------------------------
alter table public.projects add column if not exists acting_user_id uuid;

comment on column public.projects.acting_user_id is
  'Set by service-role server code in the same UPDATE that changes status, so the activity history can name the user. Read and cleared by log_project_status_change(); never stored. Not writable from the browser (not in the column grants).';

-- ---------------------------------------------------------
-- 2. The history table
-- ---------------------------------------------------------
create table if not exists public.project_activity (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  kind        text not null check (kind in ('created', 'status_change')),
  from_status text,
  to_status   text,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_role  text check (actor_role in ('customer', 'dcl_staff', 'dcl_admin', 'factory')),
  created_at  timestamptz not null default now()
);

create index if not exists project_activity_project_created_idx
  on public.project_activity (project_id, created_at desc);

alter table public.project_activity enable row level security;

-- Read only. No insert/update/delete grant and no such policy exists.
revoke all on table public.project_activity from anon, authenticated;
grant select on table public.project_activity to authenticated;

drop policy if exists project_activity_select on public.project_activity;
create policy project_activity_select on public.project_activity for select to authenticated
  using (public.can_access_project(project_id));

-- ---------------------------------------------------------
-- 3. Record a stage change (runs for every update of a project)
-- ---------------------------------------------------------
create or replace function public.log_project_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role  text;
begin
  if new.status is distinct from old.status then
    -- A signed-in caller is recorded as themselves. Service-role code has no
    -- signed-in user, so it passes one in acting_user_id.
    v_actor := coalesce(auth.uid(), new.acting_user_id);
    select p.role::text into v_role from public.profiles p where p.id = v_actor;

    insert into public.project_activity (project_id, kind, from_status, to_status, actor_id, actor_role)
    values (new.id, 'status_change', old.status, new.status, v_actor, v_role);
  end if;

  -- Never keep it: the next update must not inherit an old actor.
  new.acting_user_id := null;
  return new;
end;
$$;

drop trigger if exists project_status_change on public.projects;
create trigger project_status_change
  before update on public.projects
  for each row execute function public.log_project_status_change();

-- ---------------------------------------------------------
-- 4. Record the moment a project is created
-- ---------------------------------------------------------
create or replace function public.log_project_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role  text;
begin
  select p.role::text into v_role from public.profiles p where p.id = v_actor;

  insert into public.project_activity (project_id, kind, to_status, actor_id, actor_role)
  values (new.id, 'created', new.status, v_actor, v_role);
  return new;
end;
$$;

drop trigger if exists project_created on public.projects;
create trigger project_created
  after insert on public.projects
  for each row execute function public.log_project_created();

revoke all on function public.log_project_status_change() from public;
revoke all on function public.log_project_created() from public;

-- ---------------------------------------------------------
-- 5. Projects that already exist get one "created" entry at their creation time
--    (the stage they started in is not known, so it is left empty)
-- ---------------------------------------------------------
insert into public.project_activity (project_id, kind, created_at)
select p.id, 'created', coalesce(p.created_at, now())
  from public.projects p
 where not exists (select 1 from public.project_activity a where a.project_id = p.id);
