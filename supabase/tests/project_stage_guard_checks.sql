-- =========================================================
-- supabase/tests/project_stage_guard_checks.sql
-- DYE CUT LAB — prove only the team (and the server) can move a project's stage
-- =========================================================
--
-- Paste into the Supabase SQL Editor and Run (after applying
-- 20261015010000_project_stage_guard.sql).
--
-- Same shape as the other checks here: ONE transaction, throwaway accounts and
-- projects, and a deliberate error at the end whose message is the report. The
-- error rolls everything back, so NOTHING is saved. A red "ERROR: PROJECT STAGE
-- GUARD REPORT ..." box is the expected result. Every line should end with PASS.
--
-- Requires: 20260928120000_accounts_and_roles.sql,
--           20260929000000_lock_project_tables.sql,
--           20261015000000_project_activity.sql,
--           20261015010000_project_stage_guard.sql

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
  blocked boolean;
  st      text;
begin
  -- ---------- setup (as the database owner) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (cust_a,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guard-test-customer-a@example.test', '{}', '{}', now(), now()),
    (cust_b,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guard-test-customer-b@example.test', '{}', '{}', now(), now()),
    (staff,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guard-test-staff@example.test',      '{}', '{}', now(), now()),
    (fac_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guard-test-factory@example.test',    '{}', '{}', now(), now());

  insert into public.factories (id, name, active) values (fac, 'Guard test factory', true);
  update public.profiles set role = 'dcl_staff' where id = staff;
  update public.profiles set role = 'factory', factory_id = fac where id = fac_usr;

  insert into public.projects (id, title, owner_id, status) values
    (p_a, 'Guard test: customer A', cust_a, 'development'),
    (p_b, 'Guard test: customer B', cust_b, 'lead');
  insert into public.projects (id, title, owner_id, factory_id, status) values
    (p_f, 'Guard test: assigned to factory', cust_b, fac, 'production');

  -- ---------- customer A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  blocked := false;
  begin
    update public.projects set status = 'delivered' where id = p_a;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\ncustomer cannot move own project to delivered: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.projects set status = 'lead' where id = p_a;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\ncustomer cannot move own project to any other stage: ' || case when blocked then 'PASS' else 'FAIL' end;

  update public.projects set title = 'Guard test: renamed by customer' where id = p_a;
  select count(*) into n from public.projects where id = p_a and title = 'Guard test: renamed by customer';
  report := report || E'\ncustomer can still edit other fields: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;

  update public.projects set status = 'development', units = 5 where id = p_a;
  select count(*) into n from public.projects where id = p_a and units = 5;
  report := report || E'\ncustomer sending the same stage again still works: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;

  -- another customer's project is not reachable at all
  with u as (update public.projects set status = 'delivered' where id = p_b returning 1)
  select count(*) into n from u;
  report := report || E'\ncustomer cannot touch another customer''s project: ' || n || ' rows (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- creating projects
  insert into public.projects (title, owner_id, status) values ('Guard test: new at development', cust_a, 'development');
  insert into public.projects (title, owner_id, status) values ('Guard test: new at lead', cust_a, 'lead');
  select count(*) into n from public.projects where title like 'Guard test: new at%';
  report := report || E'\ncustomer can create a project at the first stages: ' || n || ' (want 2) ' || case when n = 2 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.projects (title, owner_id, status) values ('Guard test: new at delivered', cust_a, 'delivered');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\ncustomer cannot create a project already delivered: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- factory user acting as themselves (the website never does this) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fac_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- A factory account has no update rule on projects, so this either errors or
  -- matches zero rows. Either way the proof is that the stage did not move.
  begin
    update public.projects set status = 'shipping' where id = p_f;
  exception when others then null;
  end;
  execute 'reset role';
  select status into st from public.projects where id = p_f;
  report := report || E'\nfactory account cannot change a stage directly (still ' || coalesce(st, '?') || '): ' || case when st = 'production' then 'PASS' else 'FAIL' end;

  -- ---------- staff ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.projects set status = 'quote_ready' where id = p_b;
  execute 'reset role';
  select status into st from public.projects where id = p_b;
  report := report || E'\nstaff can change a stage: ' || coalesce(st, '?') || ' ' || case when st = 'quote_ready' then 'PASS' else 'FAIL' end;

  -- ---------- the server (service role: no signed-in user) ----------
  perform set_config('request.jwt.claims', '', true);
  update public.projects set status = 'qc', acting_user_id = fac_usr where id = p_f;
  select status into st from public.projects where id = p_f;
  report := report || E'\nthe server (factory buttons) can change a stage: ' || coalesce(st, '?') || ' ' || case when st = 'qc' then 'PASS' else 'FAIL' end;

  select count(*) into n from public.project_activity where project_id = p_a and kind = 'status_change';
  report := report || E'\nblocked attempts left no stage entry: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- ---------- report + roll everything back ----------
  raise exception 'PROJECT STAGE GUARD REPORT (nothing was saved):%', report;
end
$$;
