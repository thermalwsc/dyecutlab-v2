-- =========================================================
-- supabase/tests/quote_versions_checks.sql
-- DYE CUT LAB — prove quote versions are numbered, private where they must be, and never rewritten
-- =========================================================
--
-- Paste into the Supabase SQL Editor and Run (after applying
-- 20261028000000_quote_versions.sql).
--
-- Same shape as the other checks here: ONE transaction, throwaway accounts and
-- projects, and a deliberate error at the end whose message is the report. The
-- error rolls everything back, so NOTHING is saved. A red "ERROR: QUOTE
-- VERSIONS REPORT ..." box is the expected result. Every line should end with PASS.
-- All numbers are made up.
--
-- Requires: 20260928120000_accounts_and_roles.sql,
--           20260929000000_lock_project_tables.sql,
--           20261028000000_quote_versions.sql

do $$
declare
  cust_a  uuid := '00000000-0000-4000-8000-0000000000a1';
  cust_b  uuid := '00000000-0000-4000-8000-0000000000b1';
  staff   uuid := '00000000-0000-4000-8000-0000000000c1';
  fac_usr uuid := '00000000-0000-4000-8000-0000000000d1';
  fac     uuid := '00000000-0000-4000-8000-0000000000f1';
  p_a     uuid := gen_random_uuid();
  p_b     uuid := gen_random_uuid();
  v1      public.quote_versions;
  v2      public.quote_versions;
  report  text := '';
  n       bigint;
  blocked boolean;
  shown   timestamptz;
begin
  -- ---------- setup (as the database owner) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (cust_a,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'quote-test-customer-a@example.test', '{}', '{}', now(), now()),
    (cust_b,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'quote-test-customer-b@example.test', '{}', '{}', now(), now()),
    (staff,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'quote-test-staff@example.test',      '{}', '{}', now(), now()),
    (fac_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'quote-test-factory@example.test',    '{}', '{}', now(), now());

  insert into public.factories (id, name, active) values (fac, 'Quote test factory', true);
  update public.profiles set role = 'dcl_staff' where id = staff;
  update public.profiles set role = 'factory', factory_id = fac where id = fac_usr;

  insert into public.projects (id, title, owner_id, factory_id, status) values
    (p_a, 'Quote test: customer A (assigned to the factory)', cust_a, fac, 'development'),
    (p_b, 'Quote test: customer B', cust_b, null, 'development');

  -- ---------- the team saves two versions ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select * into v1 from public.save_quote_version(
    p_a, 500, 1192.31, 2.3846, 23, array['product','finishes','tooling'], array['freight'], 'This is an estimate until a factory confirms it.',
    '{"product":{"product":"Test box","tiers":[{"minQuantity":500,"pricePerPiece":1.2}]}}'::jsonb,
    '[{"label":"Test box","amount":600},{"label":"Tooling","amount":175}]'::jsonb,
    775, 0.35, 'Test default');

  select * into v2 from public.save_quote_version(
    p_a, 1000, 1300.00, 1.3000, 20, array['product'], array['freight'], 'This is an estimate until a factory confirms it.',
    '{"product":{"product":"Test box"}}'::jsonb, '[{"label":"Test box","amount":845}]'::jsonb, 845, 0.35, 'Test default');

  report := report || E'\nfirst version is number 1: ' || v1.version || ' (want 1) ' || case when v1.version = 1 then 'PASS' else 'FAIL' end;
  report := report || E'\nsecond version is number 2: ' || v2.version || ' (want 2) ' || case when v2.version = 2 then 'PASS' else 'FAIL' end;

  select count(*) into n from public.quote_version_details where version_id in (v1.id, v2.id);
  report := report || E'\nteam reads the private details of both: ' || n || ' (want 2) ' || case when n = 2 then 'PASS' else 'FAIL' end;

  select count(*) into n from public.quote_versions where project_id = p_a and shown_to_customer = false;
  report := report || E'\na new version starts hidden from the customer: ' || n || ' (want 2) ' || case when n = 2 then 'PASS' else 'FAIL' end;

  -- a version on another project starts again at 1
  select version into n from public.save_quote_version(
    p_b, 200, 100, 0.5, null, '{}', '{}', 'This is an estimate until a factory confirms it.', '{}'::jsonb, '[]'::jsonb, 65, 0.35, 'Test default');
  report := report || E'\nanother project starts at version 1: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;

  -- ---------- nobody rewrites history, not even the team ----------
  blocked := false;
  begin
    update public.quote_versions set sell_total = 1 where id = v1.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nteam cannot change a saved total: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.quote_version_details set margin = 0.1 where version_id = v1.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nteam cannot change a saved margin: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    delete from public.quote_versions where id = v1.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nteam cannot delete a version: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.quote_versions (project_id, version, quantity, sell_total, sell_per_piece, notice)
    values (p_a, 1, 500, 1, 1, 'duplicate number');
  exception when unique_violation then blocked := true;
  end;
  report := report || E'\nthe same version number twice is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.quote_versions (project_id, version, quantity, sell_total, sell_per_piece, notice)
    values (p_a, 9, 500, -1, 1, 'negative total');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na negative total is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.quote_versions (project_id, version, quantity, sell_total, sell_per_piece, notice)
    values (p_a, 9, 500, 1, 1, '   ');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na version without the estimate notice is refused: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- the customer sees nothing until the team shows a version ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.quote_versions where project_id = p_a;
  report := report || E'\nowner sees no version before it is shown: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- the team shows version 1 ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.quote_versions set shown_to_customer = true where id = v1.id;
  select shown_at into shown from public.quote_versions where id = v1.id;
  report := report || E'\nshowing a version records when: ' || case when shown is not null then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- the owner sees only that version, and only the safe half ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.quote_versions where project_id = p_a;
  report := report || E'\nowner sees the version that was shown, not the other: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;

  select count(*) into n from public.quote_version_details;
  report := report || E'\nowner reads no private details: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    perform 1 from public.save_quote_version(p_a, 500, 1, 1, null, '{}', '{}', 'x', '{}'::jsonb, '[]'::jsonb, 1, 0.1, 'x');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nowner cannot save a version: ' || case when blocked then 'PASS' else 'FAIL' end;

  update public.quote_versions set shown_to_customer = false where id = v1.id;
  get diagnostics n = row_count;
  report := report || E'\nowner cannot hide or show a version (rows touched): ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- another customer sees nothing, even after it is shown ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.quote_versions;
  report := report || E'\nanother customer sees no version of someone else''s project: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- the factory assigned to the project sees no price ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fac_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from public.quote_versions) + (select count(*) from public.quote_version_details) into n;
  report := report || E'\nfactory assigned to the project sees no quote data: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- a signed-out visitor cannot even ask ----------
  execute 'set local role anon';
  blocked := false;
  begin
    perform count(*) from public.quote_versions;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nsigned-out visitor cannot read quote versions: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- hiding a version again clears the time ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.quote_versions set shown_to_customer = false where id = v1.id;
  select shown_at into shown from public.quote_versions where id = v1.id;
  report := report || E'\nhiding a version clears the time it was shown: ' || case when shown is null then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- deleting a project takes its versions with it ----------
  delete from public.projects where id = p_b;
  select count(*) into n from public.quote_versions where project_id = p_b;
  report := report || E'\ndeleting a project removes its versions: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- ---------- report + roll everything back ----------
  raise exception 'QUOTE VERSIONS REPORT (nothing was saved):%', report;
end
$$;
