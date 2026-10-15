-- =========================================================
-- supabase/tests/project_activity_checks.sql
-- DYE CUT LAB — prove who can read and write the project activity history
-- =========================================================
--
-- Paste into the Supabase SQL Editor and Run (after applying
-- 20261015000000_project_activity.sql).
--
-- Same shape as the other checks in this folder: everything happens inside ONE
-- transaction with throwaway accounts and projects, and it ends with a deliberate
-- error whose message is the report. The error rolls everything back, so NOTHING
-- is saved. A red "ERROR: PROJECT ACTIVITY CHECK REPORT ..." box is the expected
-- result. Every line in it should end with PASS (NOTE lines are information).
--
-- Requires: 20260928120000_accounts_and_roles.sql,
--           20260929000000_lock_project_tables.sql,
--           20261015000000_project_activity.sql

do $$
declare
  cust_a  uuid := '00000000-0000-4000-8000-0000000000a1';
  cust_b  uuid := '00000000-0000-4000-8000-0000000000b1';
  staff   uuid := '00000000-0000-4000-8000-0000000000c1';
  fac_usr uuid := '00000000-0000-4000-8000-0000000000d1';
  fac     uuid := '00000000-0000-4000-8000-0000000000f1';
  p_a     uuid := gen_random_uuid();
  p_b     uuid := gen_random_uuid();
  p_f     uuid := gen_random_uuid();
  report  text := '';
  n       bigint;
  r       record;
  ok      boolean;
begin
  -- ---------- setup (as the database owner) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (cust_a,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'act-test-customer-a@example.test', '{}', '{}', now(), now()),
    (cust_b,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'act-test-customer-b@example.test', '{}', '{}', now(), now()),
    (staff,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'act-test-staff@example.test',      '{}', '{}', now(), now()),
    (fac_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'act-test-factory@example.test',    '{}', '{}', now(), now());

  insert into public.factories (id, name, active) values (fac, 'Activity test factory', true);
  update public.profiles set role = 'dcl_staff' where id = staff;
  update public.profiles set role = 'factory', factory_id = fac where id = fac_usr;

  insert into public.projects (id, title, owner_id, status) values
    (p_a, 'Activity test: customer A', cust_a, 'lead'),
    (p_b, 'Activity test: customer B', cust_b, 'lead');
  insert into public.projects (id, title, owner_id, factory_id, status) values
    (p_f, 'Activity test: assigned to factory', cust_b, fac, 'production');

  -- ---------- the triggers wrote the starting entries ----------
  select count(*) into n from public.project_activity where project_id in (p_a, p_b, p_f) and kind = 'created';
  report := report || E'\nevery new project gets a created entry: ' || n || ' (want 3) ' || case when n = 3 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.project_activity where project_id = p_a and kind = 'created' and to_status = 'lead';
  report := report || E'\ncreated entry records the starting stage: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;

  -- ---------- a change that is not a stage change writes nothing ----------
  update public.projects set title = 'Activity test: renamed' where id = p_a;
  select count(*) into n from public.project_activity where project_id = p_a and kind = 'status_change';
  report := report || E'\nrenaming a project writes no stage entry: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  update public.projects set status = 'lead' where id = p_a;
  select count(*) into n from public.project_activity where project_id = p_a and kind = 'status_change';
  report := report || E'\nsetting the same stage again writes nothing: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- ---------- staff changes a stage (signed in) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.projects set status = 'development' where id = p_a;
  execute 'reset role';

  select * into r from public.project_activity where project_id = p_a and kind = 'status_change';
  report := report || E'\nstaff change is recorded with from and to: ' || coalesce(r.from_status, '?') || ' to ' || coalesce(r.to_status, '?') || ' ' || case when r.from_status = 'lead' and r.to_status = 'development' then 'PASS' else 'FAIL' end;
  report := report || E'\nstaff change names the staff account and role: ' || coalesce(r.actor_role, '?') || ' ' || case when r.actor_id = staff and r.actor_role = 'dcl_staff' then 'PASS' else 'FAIL' end;

  -- ---------- the factory's status button (service role, actor passed in) ----------
  perform set_config('request.jwt.claims', '', true);
  update public.projects set status = 'qc', acting_user_id = fac_usr where id = p_f;

  select * into r from public.project_activity where project_id = p_f and kind = 'status_change';
  report := report || E'\nfactory move is recorded: ' || coalesce(r.from_status, '?') || ' to ' || coalesce(r.to_status, '?') || ' ' || case when r.from_status = 'production' and r.to_status = 'qc' then 'PASS' else 'FAIL' end;
  report := report || E'\nfactory move names the factory user: ' || coalesce(r.actor_role, '?') || ' ' || case when r.actor_id = fac_usr and r.actor_role = 'factory' then 'PASS' else 'FAIL' end;

  select count(*) into n from public.projects where id = p_f and acting_user_id is null;
  report := report || E'\nthe acting user is cleared after the update: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;

  -- a later update with no actor must not inherit the old one
  update public.projects set status = 'shipping' where id = p_f;
  select * into r from public.project_activity where project_id = p_f and to_status = 'shipping';
  report := report || E'\na later change without an actor is not blamed on the old one: ' || case when r.actor_id is null then 'PASS' else 'FAIL' end;

  -- ---------- customer reads ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.project_activity where project_id = p_a;
  report := report || E'\ncustomer A reads own history: ' || n || ' (want 2) ' || case when n = 2 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.project_activity where project_id in (p_b, p_f);
  report := report || E'\ncustomer A reads other customers'' history: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.project_activity;
  report := report || E'\ncustomer A total rows visible: ' || n || ' (want 2) ' || case when n = 2 then 'PASS' else 'FAIL' end;

  -- nobody writes through the website
  ok := false;
  begin
    insert into public.project_activity (project_id, kind, to_status) values (p_a, 'status_change', 'delivered');
  exception when insufficient_privilege then ok := true;
  end;
  report := report || E'\ncustomer A cannot add an entry: ' || case when ok then 'PASS' else 'FAIL' end;

  ok := false;
  begin
    update public.project_activity set to_status = 'delivered' where project_id = p_a;
  exception when insufficient_privilege then ok := true;
  end;
  report := report || E'\ncustomer A cannot edit an entry: ' || case when ok then 'PASS' else 'FAIL' end;

  ok := false;
  begin
    delete from public.project_activity where project_id = p_a;
  exception when insufficient_privilege then ok := true;
  end;
  report := report || E'\ncustomer A cannot delete an entry: ' || case when ok then 'PASS' else 'FAIL' end;

  -- the transient column is not writable from the browser
  ok := false;
  begin
    update public.projects set acting_user_id = staff where id = p_a;
  exception when insufficient_privilege then ok := true;
  end;
  report := report || E'\ncustomer A cannot set acting_user_id: ' || case when ok then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- information, not a pass/fail ----------
  -- Before 20261015010000_project_stage_guard.sql a customer could change the stage
  -- of their own project (status is in the column grants) and the history recorded
  -- it as "customer". With the guard applied this must say "no"; the pass/fail
  -- proof of the guard is in project_stage_guard_checks.sql.
  perform set_config('request.jwt.claims', json_build_object('sub', cust_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  ok := true;
  begin
    update public.projects set status = 'delivered' where id = p_a;
  exception when others then ok := false;
  end;
  execute 'reset role';
  select * into r from public.project_activity where project_id = p_a and to_status = 'delivered';
  report := report || E'\nNOTE customer A can change own stage: ' || case when ok then 'yes' else 'no' end
    || case when ok and r.actor_role = 'customer' then ', and it is recorded as customer' else '' end;

  -- ---------- team reads ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.project_activity where project_id in (p_a, p_b, p_f);
  -- 7 entries if the customer's stage change above went through (before
  -- 20261015010000_project_stage_guard.sql), 6 once the guard blocks it
  report := report || E'\nstaff reads every history: ' || n || ' (want ' || case when ok then 7 else 6 end || ') '
    || case when n = case when ok then 7 else 6 end then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- factory reads ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fac_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.project_activity where project_id = p_f;
  report := report || E'\nfactory reads assigned project history: ' || n || ' (want 3) ' || case when n = 3 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.project_activity where project_id in (p_a, p_b);
  report := report || E'\nfactory reads other projects'' history: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  ok := false;
  begin
    delete from public.project_activity where project_id = p_f;
  exception when insufficient_privilege then ok := true;
  end;
  report := report || E'\nfactory cannot delete entries: ' || case when ok then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- anonymous visitor ----------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  ok := false;
  begin
    select count(*) into n from public.project_activity;
  exception when insufficient_privilege then ok := true;
  end;
  report := report || E'\nanonymous blocked from the history: ' || case when ok then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- report + roll everything back ----------
  raise exception 'PROJECT ACTIVITY CHECK REPORT (nothing was saved):%', report;
end
$$;
