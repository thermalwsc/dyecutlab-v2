-- =========================================================
-- supabase/tests/project_team_alert_checks.sql
-- DYE CUT LAB — prove the "team alerted once" claim works and is not the customer's to touch
-- =========================================================
--
-- Paste into the Supabase SQL Editor and Run (after applying
-- 20261015020000_project_team_alert.sql).
--
-- Same shape as the other checks here: ONE transaction, throwaway accounts and
-- projects, and a deliberate error at the end whose message is the report. The
-- error rolls everything back, so NOTHING is saved. A red "ERROR: PROJECT TEAM
-- ALERT REPORT ..." box is the expected result. Every line should end with PASS.
--
-- Requires: 20260928120000_accounts_and_roles.sql,
--           20260929000000_lock_project_tables.sql,
--           20261015020000_project_team_alert.sql

do $$
declare
  cust_a  uuid := '00000000-0000-4000-8000-0000000000a1';
  p_a     uuid := gen_random_uuid();
  report  text := '';
  n       bigint;
  blocked boolean;
begin
  -- ---------- setup (as the database owner) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (cust_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alert-test-customer@example.test', '{}', '{}', now(), now());

  insert into public.projects (id, title, owner_id, status) values (p_a, 'Alert test project', cust_a, 'development');

  select count(*) into n from public.projects where id = p_a and team_alerted_at is null;
  report := report || E'\na new project starts not alerted: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;

  -- ---------- the customer cannot mark their own project as alerted ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  blocked := false;
  begin
    update public.projects set team_alerted_at = now() where id = p_a;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\ncustomer cannot set team_alerted_at: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- the server's claim: only the first call wins ----------
  perform set_config('request.jwt.claims', '', true);
  with c as (update public.projects set team_alerted_at = now() where id = p_a and team_alerted_at is null returning 1)
  select count(*) into n from c;
  report := report || E'\nfirst claim gets the project: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;

  with c as (update public.projects set team_alerted_at = now() where id = p_a and team_alerted_at is null returning 1)
  select count(*) into n from c;
  report := report || E'\nsecond claim gets nothing, so no second alert: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- ---------- claiming does not disturb the stage history ----------
  select count(*) into n from public.project_activity where project_id = p_a and kind = 'status_change';
  report := report || E'\nclaiming writes no stage entry: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- ---------- report + roll everything back ----------
  raise exception 'PROJECT TEAM ALERT REPORT (nothing was saved):%', report;
end
$$;
