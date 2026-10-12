-- =========================================================
-- 20261012000000_files_owner_team_only.sql
-- DYE CUT LAB — only the owner and the team may change or delete project files
-- =========================================================
--
-- Apply by pasting this file into the Supabase SQL editor (or `supabase db push`).
-- Requires: 20260929000000_lock_project_tables.sql
--
-- Found by supabase/tests/files_and_storage_checks.sql: the rules from
-- 20260929000000 let ANY account that can open a project rename and delete its
-- files, which includes a factory assigned to that project. A factory could
-- delete a customer's artwork (and the stored file itself) by talking to the
-- database directly.
--
-- What changes: UPDATE and DELETE on project files, file analyses, file checks
-- and the stored files now need "owner of the project, or DYE CUT LAB team".
--
-- What does NOT change:
--   • SELECT: owners, the team and an assigned factory still read and download
--   • INSERT: anyone who can open a project can still add files (factories will
--     upload quality-check photos in week 9)
--   • everything else from 20260929000000 stays as it is
--
-- The two helper functions mirror can_access_project / can_access_project_number
-- but without the factory branch.

create or replace function public.can_edit_project_files(p_project_id uuid)
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
       and (public.is_dcl_team() or p.owner_id = auth.uid())
  );
$$;

create or replace function public.can_edit_project_files_number(p_project_number text)
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
       and (public.is_dcl_team() or p.owner_id = auth.uid())
  );
$$;

revoke all on function public.can_edit_project_files(uuid) from public;
revoke all on function public.can_edit_project_files_number(text) from public;
grant execute on function public.can_edit_project_files(uuid) to authenticated;
grant execute on function public.can_edit_project_files_number(text) to authenticated;

-- ---------------------------------------------------------
-- File records, analyses and checks: update + delete
-- ---------------------------------------------------------
drop policy if exists project_files_update on public.project_files;
create policy project_files_update on public.project_files for update to authenticated
  using (public.can_edit_project_files(project_id))
  with check (public.can_edit_project_files(project_id));
drop policy if exists project_files_delete on public.project_files;
create policy project_files_delete on public.project_files for delete to authenticated
  using (public.can_edit_project_files(project_id));

drop policy if exists project_file_analyses_update on public.project_file_analyses;
create policy project_file_analyses_update on public.project_file_analyses for update to authenticated
  using (public.can_edit_project_files(project_id))
  with check (public.can_edit_project_files(project_id));
drop policy if exists project_file_analyses_delete on public.project_file_analyses;
create policy project_file_analyses_delete on public.project_file_analyses for delete to authenticated
  using (public.can_edit_project_files(project_id));

drop policy if exists project_file_preflights_update on public.project_file_preflights;
create policy project_file_preflights_update on public.project_file_preflights for update to authenticated
  using (public.can_edit_project_files(project_id))
  with check (public.can_edit_project_files(project_id));
drop policy if exists project_file_preflights_delete on public.project_file_preflights;
create policy project_file_preflights_delete on public.project_file_preflights for delete to authenticated
  using (public.can_edit_project_files(project_id));

-- ---------------------------------------------------------
-- The stored files themselves (private `project-files` bucket): update + delete
-- ---------------------------------------------------------
drop policy if exists project_files_bucket_update on storage.objects;
create policy project_files_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'project-files' and public.can_edit_project_files_number(split_part(name, '/', 1)))
  with check (bucket_id = 'project-files' and public.can_edit_project_files_number(split_part(name, '/', 1)));
drop policy if exists project_files_bucket_delete on storage.objects;
create policy project_files_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and public.can_edit_project_files_number(split_part(name, '/', 1)));

-- Check afterwards (read-only): the update/delete policies should now use the
-- can_edit_project_files functions, and select/insert should still use can_access_project.
--   select tablename, policyname, cmd, qual from pg_policies
--   where tablename in ('project_files','project_file_analyses','project_file_preflights')
--      or (schemaname = 'storage' and policyname like 'project_files_bucket%')
--   order by tablename, cmd, policyname;
