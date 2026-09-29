-- =========================================================
-- 20260929000000_lock_project_tables.sql
-- DYE CUT LAB — link projects to accounts and close the data leak
-- =========================================================
--
-- WHY: the six legacy DICI tables (clients, projects, project_messages,
-- project_files, project_file_analyses, project_file_preflights) are readable
-- and writable by anyone holding the publishable key, which ships in every
-- browser. Live check on 2026-09-29 returned real customer phone numbers.
--
-- WHAT THIS DOES
--   1. clients.owner_id / projects.owner_id → auth.users (defaults to the
--      signed-in user, so new rows are owned automatically).
--   2. projects.factory_id → factories (which factory a project is assigned to).
--   3. Backfills owners: a client whose email matches an account's email is
--      linked to it; a project inherits its client's owner. Anything that
--      cannot be matched stays owner-less and is visible to the DCL team only.
--   4. Replaces EVERY existing policy on the six tables with account rules:
--        customer  → own rows only
--        DCL team  → everything (dcl_staff, dcl_admin)
--        factory   → projects assigned to its factory (+ their messages/files)
--        anon      → nothing
--   5. Same rules for files in the private `project-files` storage bucket.
--
-- CONSEQUENCE: the legacy DICI chat (/app) and project pages (/project/...)
-- now require sign-in — the app code in this commit sends the user's session.
--
-- BEFORE RUNNING
--   • Back up first (Dashboard → Database → Backups), or run on a test copy.
--   • Preview the policies that will be replaced (read-only):
--       select schemaname, tablename, policyname, cmd, qual
--         from pg_policies
--        where (schemaname = 'public' and tablename in ('clients','projects',
--               'project_messages','project_files','project_file_analyses',
--               'project_file_preflights'))
--           or (schemaname = 'storage' and tablename = 'objects'
--               and (coalesce(qual,'') || coalesce(with_check,'')) ilike '%project-files%');
--   • Requires 20260928120000_accounts_and_roles.sql (is_dcl_team,
--     my_factory_id, factories).
--
-- Re-running is safe: every step is "if not exists" / drop-then-create.

-- ---------------------------------------------------------
-- 1–2. Ownership + factory assignment columns
-- ---------------------------------------------------------

alter table public.clients
  add column if not exists owner_id uuid references auth.users (id) on delete set null;
alter table public.clients alter column owner_id set default auth.uid();

alter table public.projects
  add column if not exists owner_id uuid references auth.users (id) on delete set null;
alter table public.projects alter column owner_id set default auth.uid();

alter table public.projects
  add column if not exists factory_id uuid references public.factories (id) on delete set null;

create index if not exists clients_owner_id_idx on public.clients (owner_id);
create index if not exists projects_owner_id_idx on public.projects (owner_id);
create index if not exists projects_factory_id_idx on public.projects (factory_id);
create index if not exists projects_project_number_idx on public.projects (project_number);

comment on column public.clients.owner_id is 'Account (auth.users) this customer record belongs to. NULL = not linked yet; DCL team only.';
comment on column public.projects.owner_id is 'Account (auth.users) that owns the project. NULL = not linked yet; DCL team only.';
comment on column public.projects.factory_id is 'Factory the project is assigned to. Set by the DCL team (service role), never by customers.';

-- ---------------------------------------------------------
-- 3. Backfill owners for existing rows
-- ---------------------------------------------------------

update public.clients c
   set owner_id = p.id
  from public.profiles p
 where c.owner_id is null
   and c.email is not null
   and lower(c.email) = lower(p.email);

update public.projects pr
   set owner_id = c.owner_id
  from public.clients c
 where pr.owner_id is null
   and pr.client_id = c.id
   and c.owner_id is not null;

-- ---------------------------------------------------------
-- Access helpers (security definer: read projects without RLS recursion)
-- ---------------------------------------------------------

create or replace function public.can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.projects p
     where p.id = p_project_id
       and (
         public.is_dcl_team()
         or p.owner_id = auth.uid()
         or (p.factory_id is not null and p.factory_id = public.my_factory_id())
       )
  );
$$;

-- Storage paths start with the project number: DCL-00031/artwork/<file>.
create or replace function public.can_access_project_number(p_project_number text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.projects p
     where p.project_number = p_project_number
       and (
         public.is_dcl_team()
         or p.owner_id = auth.uid()
         or (p.factory_id is not null and p.factory_id = public.my_factory_id())
       )
  );
$$;

revoke all on function public.can_access_project(uuid) from public;
revoke all on function public.can_access_project_number(text) from public;
grant execute on function public.can_access_project(uuid) to authenticated;
grant execute on function public.can_access_project_number(text) to authenticated;

-- ---------------------------------------------------------
-- 4. Row Level Security on the six legacy tables
-- ---------------------------------------------------------

-- Drop every existing policy (dashboard-made ones included): policies are
-- OR-ed together, so a single leftover "using (true)" would keep data open.
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('clients', 'projects', 'project_messages', 'project_files',
                         'project_file_analyses', 'project_file_preflights')
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end
$$;

alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_messages enable row level security;
alter table public.project_files enable row level security;
alter table public.project_file_analyses enable row level security;
alter table public.project_file_preflights enable row level security;

revoke all on table public.clients, public.projects, public.project_messages,
  public.project_files, public.project_file_analyses, public.project_file_preflights
  from anon, authenticated;

-- clients ---------------------------------------------------
grant select, insert, delete on table public.clients to authenticated;
-- Column-level: owner_id is never editable from the browser.
grant update (phone, email, marketing_sms_opt_in, updated_at) on table public.clients to authenticated;

create policy clients_select on public.clients for select to authenticated
  using (owner_id = auth.uid() or public.is_dcl_team());
create policy clients_insert on public.clients for insert to authenticated
  with check (owner_id = auth.uid());
create policy clients_update on public.clients for update to authenticated
  using (owner_id = auth.uid() or public.is_dcl_team())
  with check (owner_id = auth.uid() or public.is_dcl_team());
create policy clients_delete on public.clients for delete to authenticated
  using (public.is_dcl_team());

-- projects --------------------------------------------------
grant select, insert, delete on table public.projects to authenticated;
-- Column-level: owner_id, factory_id and project_number are server/team-only.
grant update (title, request, quantity, product_type, use_type, status, artwork_status,
              size, closure, updated_at, client_id, units, flavor_count, flavor_split,
              pouch_size, box_dimensions, material, finish)
  on table public.projects to authenticated;

-- New projects get their DCL-00001 number from this sequence (column default),
-- so the inserting role needs it once table grants are tightened.
grant usage, select on sequence public.project_number_seq to authenticated;
revoke all on sequence public.project_number_seq from anon;

create policy projects_select on public.projects for select to authenticated
  using (
    public.is_dcl_team()
    or owner_id = auth.uid()
    or (factory_id is not null and factory_id = public.my_factory_id())
  );
create policy projects_insert on public.projects for insert to authenticated
  with check (
    owner_id = auth.uid()
    and factory_id is null
    and (client_id is null
         or client_id in (select c.id from public.clients c where c.owner_id = auth.uid()))
  );
create policy projects_update on public.projects for update to authenticated
  using (owner_id = auth.uid() or public.is_dcl_team())
  with check (owner_id = auth.uid() or public.is_dcl_team());
create policy projects_delete on public.projects for delete to authenticated
  using (public.is_dcl_team());

-- project child tables: access follows the parent project -----
grant select, insert, update, delete on table public.project_messages,
  public.project_files, public.project_file_analyses, public.project_file_preflights
  to authenticated;

create policy project_messages_select on public.project_messages for select to authenticated
  using (public.can_access_project(project_id));
create policy project_messages_insert on public.project_messages for insert to authenticated
  with check (public.can_access_project(project_id));
create policy project_messages_update on public.project_messages for update to authenticated
  using (public.is_dcl_team()) with check (public.is_dcl_team());
create policy project_messages_delete on public.project_messages for delete to authenticated
  using (public.is_dcl_team());

create policy project_files_select on public.project_files for select to authenticated
  using (public.can_access_project(project_id));
create policy project_files_insert on public.project_files for insert to authenticated
  with check (public.can_access_project(project_id));
create policy project_files_update on public.project_files for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
create policy project_files_delete on public.project_files for delete to authenticated
  using (public.can_access_project(project_id));

create policy project_file_analyses_select on public.project_file_analyses for select to authenticated
  using (public.can_access_project(project_id));
create policy project_file_analyses_insert on public.project_file_analyses for insert to authenticated
  with check (public.can_access_project(project_id));
create policy project_file_analyses_update on public.project_file_analyses for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
create policy project_file_analyses_delete on public.project_file_analyses for delete to authenticated
  using (public.is_dcl_team());

create policy project_file_preflights_select on public.project_file_preflights for select to authenticated
  using (public.can_access_project(project_id));
create policy project_file_preflights_insert on public.project_file_preflights for insert to authenticated
  with check (public.can_access_project(project_id));
create policy project_file_preflights_update on public.project_file_preflights for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
create policy project_file_preflights_delete on public.project_file_preflights for delete to authenticated
  using (public.is_dcl_team());

-- ---------------------------------------------------------
-- 5. Storage: private `project-files` bucket
-- ---------------------------------------------------------

update storage.buckets set public = false where id = 'project-files';

do $$
declare
  pol record;
begin
  for pol in
    select policyname
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%project-files%'
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end
$$;

create policy project_files_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.can_access_project_number(split_part(name, '/', 1)));
create policy project_files_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and public.can_access_project_number(split_part(name, '/', 1)));
create policy project_files_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'project-files' and public.can_access_project_number(split_part(name, '/', 1)))
  with check (bucket_id = 'project-files' and public.can_access_project_number(split_part(name, '/', 1)));
create policy project_files_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and public.can_access_project_number(split_part(name, '/', 1)));

-- ---------------------------------------------------------
-- Check afterwards (read-only)
-- ---------------------------------------------------------
--   select c.relname, c.relrowsecurity,
--          (select string_agg(pol.polname, ', ') from pg_policy pol where pol.polrelid = c.oid)
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r' order by 1;
--   select count(*) filter (where owner_id is not null) as linked,
--          count(*) as total from public.projects;
