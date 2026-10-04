-- =========================================================
-- 20261001010000_team_workspace_crud.sql
-- DYE CUT LAB — columns the team workspace (/admin) needs
-- =========================================================
--
-- Run AFTER 20261001000000_team_reads_requests.sql.
--
--   quote_requests.notes       internal team notes (never shown publicly)
--   quote_requests.project_id  the project created from this request
--   projects.archived_at       archive instead of delete (hidden by default)
--
-- Access:
--   • notes: the team may edit it through the existing team update policy
--     (column grant below). The public stays insert-only.
--   • project_id and archived_at are written by server actions with the
--     service role after a role check, so no browser grant is added.
-- Safe to re-run.

alter table public.quote_requests add column if not exists notes text;
alter table public.quote_requests drop constraint if exists quote_requests_notes_length;
alter table public.quote_requests
  add constraint quote_requests_notes_length check (notes is null or char_length(notes) <= 2000);

alter table public.quote_requests
  add column if not exists project_id uuid references public.projects (id) on delete set null;

grant update (status, notes) on table public.quote_requests to authenticated;

alter table public.projects add column if not exists archived_at timestamptz;
create index if not exists projects_archived_at_idx on public.projects (archived_at);

comment on column public.quote_requests.notes is 'Internal DCL team notes. Not visible to the public.';
comment on column public.quote_requests.project_id is 'Project created from this request (set by the team workspace).';
comment on column public.projects.archived_at is 'Set when the team archives a project; archived projects are hidden from lists by default.';
