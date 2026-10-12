-- =========================================================
-- supabase/tests/files_and_storage_checks.sql
-- DYE CUT LAB — who can see, add, edit and delete project FILES (READ-ONLY IN EFFECT)
-- =========================================================
--
-- Paste into the Supabase SQL Editor and Run, like the other tests in this folder.
--
-- Inside ONE transaction it creates throwaway accounts (two customers, two
-- factory users, a staff user), two factories, a project for customer A that is
-- assigned to factory A, one file record and one stored file for that project,
-- then switches to each role and records what it can see and change.
-- It ENDS WITH A DELIBERATE ERROR whose message is the report, which rolls
-- everything back, so NOTHING is saved.
--
-- A red "ERROR: FILES AND STORAGE REPORT ..." box is the expected result. Every
-- line should end with PASS.
--
-- The lines about a FACTORY renaming, deleting or overwriting a customer's file
-- are the ones this test was written for: before
-- 20261012000000_files_owner_team_only.sql they FAIL (any account that can open
-- a project could change its files); after it they PASS.
--
-- Requires: 20260928120000_accounts_and_roles.sql,
--           20260929000000_lock_project_tables.sql,
--           20261012000000_files_owner_team_only.sql (for the factory lines to pass)

do $$
declare
  cust_a  uuid := '00000000-0000-4000-8000-0000000000a3';
  cust_b  uuid := '00000000-0000-4000-8000-0000000000b3';
  staff   uuid := '00000000-0000-4000-8000-0000000000c3';
  fac_a_u uuid := '00000000-0000-4000-8000-0000000000d4';
  fac_b_u uuid := '00000000-0000-4000-8000-0000000000d5';
  fac_a   uuid := '00000000-0000-4000-8000-0000000000f4';
  fac_b   uuid := '00000000-0000-4000-8000-0000000000f5';
  p_a     uuid := gen_random_uuid();
  f_a     uuid := gen_random_uuid();
  num_a   text;
  report  text := '';
  n       bigint;
  blocked boolean;
begin
  -- ---------- setup (as the database owner) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (cust_a,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'files-test-customer-a@example.test', '{}', '{}', now(), now()),
    (cust_b,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'files-test-customer-b@example.test', '{}', '{}', now(), now()),
    (staff,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'files-test-staff@example.test',      '{}', '{}', now(), now()),
    (fac_a_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'files-test-factory-a@example.test',  '{}', '{}', now(), now()),
    (fac_b_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'files-test-factory-b@example.test',  '{}', '{}', now(), now());

  insert into public.factories (id, name, active) values (fac_a, 'Files test factory A', true), (fac_b, 'Files test factory B', true);
  update public.profiles set role = 'factory', factory_id = fac_a where id = fac_a_u;
  update public.profiles set role = 'factory', factory_id = fac_b where id = fac_b_u;
  update public.profiles set role = 'dcl_staff' where id = staff;

  insert into public.projects (id, title, owner_id, factory_id, status)
  values (p_a, 'Files test: customer A, factory A', cust_a, fac_a, 'production');
  select project_number into num_a from public.projects where id = p_a;

  insert into public.project_files (id, project_id, file_name, storage_path, file_type, file_size, category, uploaded_by)
  values (f_a, p_a, 'artwork-a.pdf', num_a || '/artwork/artwork-a.pdf', 'application/pdf', 1000, 'artwork', 'client');
  insert into storage.objects (bucket_id, name) values ('project-files', num_a || '/artwork/artwork-a.pdf');

  -- ---------- customer A (the owner) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.project_files where project_id = p_a;
  report := report || E'\ncustomer A sees own file record: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  select count(*) into n from storage.objects where bucket_id = 'project-files' and name like num_a || '/%';
  report := report || E'\ncustomer A sees own stored file: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  blocked := false;
  begin
    insert into public.project_files (project_id, file_name, storage_path, file_type, file_size, category, uploaded_by)
    values (p_a, 'second.pdf', num_a || '/artwork/second.pdf', 'application/pdf', 10, 'artwork', 'client');
  exception when others then blocked := true;
  end;
  report := report || E'\ncustomer A can add a file to own project: ' || case when not blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- customer B (a different customer) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.project_files where project_id = p_a;
  report := report || E'\ncustomer B sees A''s file records: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  select count(*) into n from storage.objects where bucket_id = 'project-files' and name like num_a || '/%';
  report := report || E'\ncustomer B sees A''s stored files: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  blocked := false;
  begin
    insert into public.project_files (project_id, file_name, storage_path, file_type, file_size, category, uploaded_by)
    values (p_a, 'planted.pdf', num_a || '/artwork/planted.pdf', 'application/pdf', 10, 'artwork', 'client');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\ncustomer B blocked from adding a file record to A''s project: ' || case when blocked then 'PASS' else 'FAIL' end;
  blocked := false;
  begin
    insert into storage.objects (bucket_id, name) values ('project-files', num_a || '/artwork/planted.pdf');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\ncustomer B blocked from uploading under A''s project folder: ' || case when blocked then 'PASS' else 'FAIL' end;
  with d as (delete from public.project_files where id = f_a returning 1) select count(*) into n from d;
  report := report || E'\ncustomer B deleting A''s file record: ' || n || ' rows (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- anonymous visitor ----------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  blocked := false;
  begin
    select count(*) into n from public.project_files;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nanonymous blocked from file records: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- staff ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.project_files where project_id = p_a;
  report := report || E'\nstaff sees the file record: ' || n || ' (want at least 1) ' || case when n >= 1 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- factory B (not assigned) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fac_b_u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.project_files where project_id = p_a;
  report := report || E'\nfactory B (not assigned) sees file records: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  select count(*) into n from storage.objects where bucket_id = 'project-files' and name like num_a || '/%';
  report := report || E'\nfactory B (not assigned) sees stored files: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- factory A (assigned): reading ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fac_a_u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.project_files where project_id = p_a;
  report := report || E'\nfactory A (assigned) sees the file records: ' || n || ' (want 1 or more) ' || case when n >= 1 then 'PASS' else 'FAIL' end;
  select count(*) into n from storage.objects where bucket_id = 'project-files' and name like num_a || '/%';
  report := report || E'\nfactory A (assigned) sees the stored files: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;

  -- ---------- factory A (assigned): changing the customer's files (do last: these can change data) ----------
  with u as (update public.project_files set file_name = 'renamed-by-factory.pdf' where id = f_a returning 1) select count(*) into n from u;
  report := report || E'\nfactory A renaming the customer''s file record: ' || n || ' rows (want 0) ' || case when n = 0 then 'PASS' else 'FAIL  <- see note in the file header' end;
  with d as (delete from public.project_files where id = f_a returning 1) select count(*) into n from d;
  report := report || E'\nfactory A deleting the customer''s file record: ' || n || ' rows (want 0) ' || case when n = 0 then 'PASS' else 'FAIL  <- see note in the file header' end;
  with u as (update storage.objects set metadata = '{"changed_by":"factory"}'::jsonb where bucket_id = 'project-files' and name like num_a || '/%' returning 1) select count(*) into n from u;
  report := report || E'\nfactory A overwriting the stored file: ' || n || ' rows (want 0) ' || case when n = 0 then 'PASS' else 'FAIL  <- see note in the file header' end;
  execute 'reset role';

  -- ---------- customer A again: the owner must still be able to manage own files ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  with u as (update public.project_files set file_name = 'renamed-by-owner.pdf' where id = f_a returning 1) select count(*) into n from u;
  report := report || E'\ncustomer A renaming own file record: ' || n || ' rows (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  with u as (update storage.objects set metadata = '{"changed_by":"owner"}'::jsonb where bucket_id = 'project-files' and name like num_a || '/%' returning 1) select count(*) into n from u;
  report := report || E'\ncustomer A overwriting own stored file: ' || n || ' rows (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- staff again: the team can manage files ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  with u as (update public.project_files set file_name = 'renamed-by-staff.pdf' where id = f_a returning 1) select count(*) into n from u;
  report := report || E'\nstaff renaming a file record: ' || n || ' rows (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- report + roll everything back ----------
  raise exception 'FILES AND STORAGE REPORT (nothing was saved):%', report;
end
$$;
