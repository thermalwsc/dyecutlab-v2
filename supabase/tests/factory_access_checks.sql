-- =========================================================
-- supabase/tests/factory_access_checks.sql
-- DYE CUT LAB — prove factory and customer limits (READ-ONLY IN EFFECT)
-- =========================================================
--
-- Paste into the Supabase SQL Editor and Run, like rls_role_checks.sql.
--
-- Inside ONE transaction it creates throwaway accounts (a customer, two
-- factory users, a staff user), two factories and a few projects and a quote
-- request, switches to each role as the website would, records what each can
-- see and change, then ENDS WITH A DELIBERATE ERROR whose message is the report.
-- Raising an error rolls everything back, so NOTHING is saved.
--
-- A red "ERROR: FACTORY ACCESS REPORT ..." box is the expected result. Every
-- line should end with PASS.
--
-- Requires: 20260928120000_accounts_and_roles.sql,
--           20260929000000_lock_project_tables.sql,
--           20261001000000_team_reads_requests.sql,
--           20261006000000_quote_requests_customer.sql

do $$
declare
  cust    uuid := '00000000-0000-4000-8000-0000000000a2';
  fac_a_u uuid := '00000000-0000-4000-8000-0000000000d2';
  fac_b_u uuid := '00000000-0000-4000-8000-0000000000d3';
  staff   uuid := '00000000-0000-4000-8000-0000000000c2';
  fac_a   uuid := '00000000-0000-4000-8000-0000000000f2';
  fac_b   uuid := '00000000-0000-4000-8000-0000000000f3';
  p_a     uuid := gen_random_uuid();
  p_b     uuid := gen_random_uuid();
  p_none  uuid := gen_random_uuid();
  report  text := '';
  n       bigint;
  blocked boolean;
begin
  -- ---------- setup (as the database owner) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (cust,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fac-test-customer@example.test',  '{}', '{}', now(), now()),
    (fac_a_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fac-test-factory-a@example.test', '{}', '{}', now(), now()),
    (fac_b_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fac-test-factory-b@example.test', '{}', '{}', now(), now()),
    (staff,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fac-test-staff@example.test',     '{}', '{}', now(), now());

  insert into public.factories (id, name, active) values (fac_a, 'Test factory A', true), (fac_b, 'Test factory B', true);
  update public.profiles set role = 'factory', factory_id = fac_a where id = fac_a_u;
  update public.profiles set role = 'factory', factory_id = fac_b where id = fac_b_u;
  update public.profiles set role = 'dcl_staff' where id = staff;

  insert into public.projects (id, title, owner_id, factory_id, status) values
    (p_a,    'Factory test: assigned to A', cust, fac_a, 'production'),
    (p_b,    'Factory test: assigned to B', cust, fac_b, 'production'),
    (p_none, 'Factory test: unassigned',    cust, null,  'lead');
  insert into public.quote_requests (description, phone) values ('Factory test request description', '+15555550100');

  -- ---------- factory A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fac_a_u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.projects where id = p_a;
  report := report || E'\nfactory A sees its assigned project: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.projects where id in (p_b, p_none);
  report := report || E'\nfactory A sees other or unassigned projects: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  with u as (update public.projects set status = 'shipping' where id = p_a returning 1)
  select count(*) into n from u;
  report := report || E'\nfactory A can change its project status directly: ' || n || ' rows (want 0, only the server may) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  with u as (update public.projects set title = 'renamed' where id = p_a returning 1)
  select count(*) into n from u;
  report := report || E'\nfactory A can edit its project details: ' || n || ' rows (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  with d as (delete from public.projects where id = p_a returning 1)
  select count(*) into n from d;
  report := report || E'\nfactory A can delete its project: ' || n || ' rows (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  select count(*) into n from public.quote_requests;
  report := report || E'\nfactory A sees quote requests: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- factory B ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fac_b_u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.projects where id = p_a;
  report := report || E'\nfactory B sees factory A''s project: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- customer ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.quote_requests;
  report := report || E'\ncustomer sees quote requests (even their own table): ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.quote_requests (description, phone, customer_email) values ('Faking someone else''s email', '+15555550101', 'ceo@example.com');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\ncustomer blocked from writing sender email themselves: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.quote_requests (description, phone, user_id) values ('Faking someone else''s account', '+15555550102', staff);
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\ncustomer blocked from writing sender account themselves: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- anonymous visitor ----------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  blocked := false;
  begin
    insert into public.quote_requests (description, phone, customer_name) values ('Anonymous faking a name', '+15555550103', 'Fake Name');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nanonymous blocked from writing a sender name: ' || case when blocked then 'PASS' else 'FAIL' end;

  -- the normal guest request must still work
  blocked := false;
  begin
    insert into public.quote_requests (description, phone) values ('A normal guest request still works', '+15555550104');
  exception when others then blocked := true;
  end;
  report := report || E'\nanonymous can still send a normal request: ' || case when not blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- staff ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.quote_requests;
  report := report || E'\nstaff sees quote requests: ' || n || ' (want at least 2) ' || case when n >= 2 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- report + roll everything back ----------
  raise exception 'FACTORY ACCESS REPORT (nothing was saved):%', report;
end
$$;
