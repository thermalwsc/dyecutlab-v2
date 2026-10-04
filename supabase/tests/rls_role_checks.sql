-- =========================================================
-- supabase/tests/rls_role_checks.sql
-- DYE CUT LAB — prove the per-role access rules (READ-ONLY IN EFFECT)
-- =========================================================
--
-- Paste into the Supabase SQL Editor and Run.
--
-- What it does, inside ONE transaction:
--   1. creates throwaway test accounts (customer A, customer B, staff, factory
--      user), a test factory and three test projects
--   2. switches to each role (as the website would) and records what it can
--      see and change
--   3. ENDS WITH A DELIBERATE ERROR whose message is the report. Raising an
--      error makes Postgres roll back everything above, so NOTHING is saved.
--
-- So: a red "ERROR: RLS ROLE CHECK REPORT ..." box is the expected result.
-- Read the lines in it: every line should end with PASS.
--
-- Requires: 20260928120000_accounts_and_roles.sql,
--           20260929000000_lock_project_tables.sql,
--           20261001000000_team_reads_requests.sql

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
  total   bigint;

  procedure_ok boolean;
begin
  -- ---------- setup (as the database owner) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (cust_a,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-customer-a@example.test', '{}', '{}', now(), now()),
    (cust_b,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-customer-b@example.test', '{}', '{}', now(), now()),
    (staff,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-staff@example.test',      '{}', '{}', now(), now()),
    (fac_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-factory@example.test',    '{}', '{}', now(), now());

  insert into public.factories (id, name, active) values (fac, 'RLS test factory', true);
  update public.profiles set role = 'dcl_staff' where id = staff;
  update public.profiles set role = 'factory', factory_id = fac where id = fac_usr;

  insert into public.projects (id, title, owner_id, status) values
    (p_a, 'RLS test: customer A', cust_a, 'lead'),
    (p_b, 'RLS test: customer B', cust_b, 'lead');
  insert into public.projects (id, title, owner_id, factory_id, status) values
    (p_f, 'RLS test: assigned to factory', cust_b, fac, 'production');
  insert into public.project_messages (project_id, role, message) values
    (p_a, 'user', 'test message A'), (p_f, 'user', 'test message F');

  select count(*) into total from public.projects;

  -- ---------- customer A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.projects where id = p_a;
  report := report || E'\ncustomer A sees own project: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.projects where id in (p_b, p_f);
  report := report || E'\ncustomer A sees other projects: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.projects;
  report := report || E'\ncustomer A total projects visible: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.project_messages where project_id = p_f;
  report := report || E'\ncustomer A sees others'' messages: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  with u as (update public.projects set title = 'hacked' where id = p_b returning 1)
  select count(*) into n from u;
  report := report || E'\ncustomer A can edit customer B project: ' || n || ' rows (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  procedure_ok := false;
  begin
    update public.projects set factory_id = fac where id = p_a;
  exception when insufficient_privilege then procedure_ok := true;
  end;
  report := report || E'\ncustomer A blocked from assigning a factory: ' || case when procedure_ok then 'PASS' else 'FAIL' end;

  select count(*) into n from public.quote_requests;
  report := report || E'\ncustomer A sees quote requests: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- staff ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.projects;
  report := report || E'\nstaff sees all projects: ' || n || ' of ' || total || ' ' || case when n = total then 'PASS' else 'FAIL' end;
  select count(*) into n from public.project_messages where project_id in (p_a, p_f);
  report := report || E'\nstaff sees all test messages: ' || n || ' (want 2) ' || case when n = 2 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- factory user ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fac_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.projects;
  report := report || E'\nfactory sees only assigned projects: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.projects where id = p_f;
  report := report || E'\nfactory sees the assigned project: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.project_messages where project_id = p_f;
  report := report || E'\nfactory sees assigned project messages: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.clients;
  report := report || E'\nfactory sees customer records: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- anonymous visitor ----------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  procedure_ok := false;
  begin
    select count(*) into n from public.projects;
  exception when insufficient_privilege then procedure_ok := true;
  end;
  report := report || E'\nanonymous blocked from projects: ' || case when procedure_ok then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- report + roll everything back ----------
  raise exception 'RLS ROLE CHECK REPORT (nothing was saved):%', report;
end
$$;
