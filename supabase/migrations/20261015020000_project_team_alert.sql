-- =========================================================
-- 20261015020000_project_team_alert.sql
-- DYE CUT LAB — remember that the team was alerted about a new project
-- =========================================================
--
-- Apply by pasting this file into the Supabase SQL editor (or `supabase db push`).
-- Requires: 20260929000000_lock_project_tables.sql
--
-- The start-your-project chat creates a project from the customer's browser. The
-- server then texts and emails the team once. To make "once" hold even if the page
-- calls twice, the server first claims the project with
--   update projects set team_alerted_at = now() where id = ... and team_alerted_at is null
-- and only the call that gets a row back sends the alert.
--
-- The column is only ever written by server code using the service role. It is
-- not in the column grants for signed-in users, so a customer cannot edit it on an
-- existing project. Nothing else about projects changes.
--
-- If this migration has not been run yet, the website still works: the alert route
-- sees the missing column, logs it, and sends nothing.

alter table public.projects add column if not exists team_alerted_at timestamptz;

comment on column public.projects.team_alerted_at is
  'When the team was texted and emailed about this project being created in the chat. Set by server code only; null means not alerted yet.';
