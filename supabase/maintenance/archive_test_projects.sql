-- =========================================================
-- supabase/maintenance/archive_test_projects.sql
-- DYE CUT LAB — archive the test projects before real customers are invited
-- =========================================================
--
-- Paste ONE STEP AT A TIME into the Supabase SQL editor and run it.
--
-- What it does: marks projects as archived (projects.archived_at). Archived
-- projects disappear from the team's default list and from every customer's
-- dashboard, but NOTHING is deleted: the project, its files, its conversation
-- and its history all stay, and step 4 puts them back.
--
-- Pick the cutoff in step 1: every project created BEFORE that moment is treated
-- as a test project. Use the moment just before the first real customer
-- project could exist, for example the day you open the beta.

-- ---------------------------------------------------------
-- STEP 1 — look first (changes nothing)
-- Edit the date, then run. It lists what WOULD be archived.
-- ---------------------------------------------------------
select project_number, title, status, created_at,
       (select email from public.profiles p where p.id = pr.owner_id) as owner_email
  from public.projects pr
 where pr.archived_at is null
   and pr.created_at < '2026-10-26 00:00:00+00'   -- <- the cutoff
 order by pr.created_at;

-- ---------------------------------------------------------
-- STEP 2 — how many would be archived (changes nothing)
-- ---------------------------------------------------------
select count(*) as will_be_archived
  from public.projects
 where archived_at is null
   and created_at < '2026-10-26 00:00:00+00';     -- <- the same cutoff

-- ---------------------------------------------------------
-- STEP 3 — archive them (the only step that changes data)
-- Run it only when steps 1 and 2 look right.
-- ---------------------------------------------------------
update public.projects
   set archived_at = now()
 where archived_at is null
   and created_at < '2026-10-26 00:00:00+00'      -- <- the same cutoff
returning project_number, title;

-- ---------------------------------------------------------
-- STEP 4 — undo (only if you need to)
-- Brings back everything that step 3 archived in the last hour.
-- ---------------------------------------------------------
-- update public.projects
--    set archived_at = null
--  where archived_at > now() - interval '1 hour'
-- returning project_number, title;
