-- =========================================================
-- supabase/tests/factory_quotes_checks.sql
-- DYE CUT LAB — prove factory quotes are numbered, private, decided only by the team and never rewritten
-- =========================================================
--
-- Paste into the Supabase SQL Editor and Run (after applying
-- 20261102000000_factory_quotes.sql).
--
-- Same shape as the other checks here: ONE transaction, throwaway accounts and
-- projects, and a deliberate error at the end whose message is the report. The
-- error rolls everything back, so NOTHING is saved. A red "ERROR: FACTORY QUOTES
-- REPORT ..." box is the expected result. Every line should end with PASS.
-- All numbers are made up.
--
-- Requires: 20260928120000_accounts_and_roles.sql,
--           20260929000000_lock_project_tables.sql,
--           20261102000000_factory_quotes.sql

do $$
declare
  cust    uuid := '00000000-0000-4000-8000-0000000000a1';
  staff   uuid := '00000000-0000-4000-8000-0000000000c1';
  fa_usr  uuid := '00000000-0000-4000-8000-0000000000d1';
  fb_usr  uuid := '00000000-0000-4000-8000-0000000000d2';
  fa      uuid := '00000000-0000-4000-8000-0000000000f1';
  fb      uuid := '00000000-0000-4000-8000-0000000000f2';
  p1      uuid := gen_random_uuid();
  p2      uuid := gen_random_uuid();
  p3      uuid := gen_random_uuid();
  q1      public.factory_quotes;
  q2      public.factory_quotes;
  q4      public.factory_quotes;
  qb      public.factory_quotes;
  qt      public.factory_quotes;
  report  text := '';
  n       bigint;
  blocked boolean;
  st      text;
  tot     numeric;
begin
  -- ---------- setup (as the database owner) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (cust,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fq-test-customer@example.test',  '{}', '{}', now(), now()),
    (staff,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fq-test-staff@example.test',     '{}', '{}', now(), now()),
    (fa_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fq-test-factory-a@example.test', '{}', '{}', now(), now()),
    (fb_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fq-test-factory-b@example.test', '{}', '{}', now(), now());

  insert into public.factories (id, name, active) values (fa, 'Quote test factory A', true), (fb, 'Quote test factory B', true);
  update public.profiles set role = 'dcl_staff' where id = staff;
  update public.profiles set role = 'factory', factory_id = fa where id = fa_usr;
  update public.profiles set role = 'factory', factory_id = fb where id = fb_usr;

  insert into public.projects (id, title, owner_id, factory_id, status) values
    (p1, 'FQ test: assigned to factory A', cust, fa, 'factory_review'),
    (p2, 'FQ test: assigned to factory B', cust, fb, 'factory_review'),
    (p3, 'FQ test: no factory',            cust, null, 'development');

  -- ---------- factory A sends a quote for its own project ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fa_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.factory_quotes (project_id, quantity, price_per_piece, tooling_cost, lead_days, notes)
  values (p1, 500, 1.1, 100, 30, 'First quote') returning * into q1;

  report := report || E'\nthe first quote is version 1: ' || q1.version || ' (want 1) ' || case when q1.version = 1 then 'PASS' else 'FAIL' end;
  report := report || E'\na sent quote starts as submitted: ' || q1.status || ' ' || case when q1.status = 'submitted' then 'PASS' else 'FAIL' end;
  report := report || E'\nthe total is worked out (500 x 1.10 + 100): ' || q1.total || ' (want 650.00) ' || case when q1.total = 650 then 'PASS' else 'FAIL' end;
  report := report || E'\nthe factory comes from the project, not the sender: ' || case when q1.factory_id = fa then 'PASS' else 'FAIL' end;
  report := report || E'\nthe database records who sent it: ' || case when q1.submitted_by = fa_usr then 'PASS' else 'FAIL' end;

  insert into public.factory_quotes (project_id, quantity, price_per_piece, tooling_cost, lead_days)
  values (p1, 500, 1.05, 100, 28) returning * into q2;

  report := report || E'\na second quote is version 2: ' || q2.version || ' (want 2) ' || case when q2.version = 2 then 'PASS' else 'FAIL' end;
  select status into st from public.factory_quotes where id = q1.id;
  report := report || E'\nthe earlier undecided quote is replaced: ' || st || ' ' || case when st = 'superseded' then 'PASS' else 'FAIL' end;

  -- ---------- what factory A may not do ----------
  blocked := false;
  begin
    insert into public.factory_quotes (project_id, quantity, price_per_piece) values (p2, 100, 1);
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot quote another factory''s project: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_quotes (project_id, quantity, price_per_piece) values (p3, 100, 1);
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  report := report || E'\nfactory A cannot quote a project with no factory: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_quotes (project_id, quantity, price_per_piece, status) values (p1, 100, 1, 'approved');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot choose the status: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_quotes (project_id, quantity, price_per_piece, factory_id) values (p1, 100, 1, fb);
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot choose the factory: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_quotes (project_id, quantity, price_per_piece) values (p1, 100, -1);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na negative price is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_quotes (project_id, quantity, price_per_piece) values (p1, 0, 1);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na quantity of zero is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  update public.factory_quotes set status = 'approved' where id = q2.id;
  get diagnostics n = row_count;
  report := report || E'\nfactory A cannot approve its own quote (rows touched): ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_quotes set price_per_piece = 0.01 where id = q2.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot edit a quote it sent: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    delete from public.factory_quotes where id = q2.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot delete a quote: ' || case when blocked then 'PASS' else 'FAIL' end;

  select count(*) into n from public.factory_quotes;
  report := report || E'\nfactory A reads its own project''s quotes: ' || n || ' (want 2) ' || case when n = 2 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- factory B sees nothing of A's, and numbers its own project from 1 ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fb_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.factory_quotes;
  report := report || E'\nfactory B sees none of factory A''s quotes: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  insert into public.factory_quotes (project_id, quantity, price_per_piece, lead_days)
  values (p2, 300, 2.5, 20) returning * into qb;
  report := report || E'\nanother project starts at version 1: ' || qb.version || ' (want 1) ' || case when qb.version = 1 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- the customer and a signed-out visitor ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.factory_quotes;
  report := report || E'\ncustomer reads no factory quote, even on their own project: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_quotes (project_id, quantity, price_per_piece) values (p1, 100, 1);
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\ncustomer cannot send a quote: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  execute 'set local role anon';
  blocked := false;
  begin
    perform count(*) from public.factory_quotes;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nsigned-out visitor cannot read factory quotes: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- the team reads everything and decides ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.factory_quotes;
  report := report || E'\nteam reads every factory quote: ' || n || ' (want 3) ' || case when n = 3 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_quotes set status = 'rejected' where id = q2.id;
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na rejection without a reason is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  update public.factory_quotes set status = 'rejected', team_note = 'Price is too high' where id = q2.id;
  select status into st from public.factory_quotes where id = q2.id;
  report := report || E'\nthe team rejects a quote with a reason: ' || st || ' ' || case when st = 'rejected' then 'PASS' else 'FAIL' end;

  select count(*) into n from public.factory_quotes where id = q2.id and decided_by = staff and decided_at is not null;
  report := report || E'\nthe database records who decided and when: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_quotes set status = 'approved' where id = q2.id;
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na rejected quote cannot be approved afterwards: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_quotes set status = 'approved' where id = q1.id;
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na replaced quote cannot be approved: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_quotes set quantity = 1 where id = qb.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe team cannot edit what a factory quoted: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    delete from public.factory_quotes where id = q2.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe team cannot delete a quote: ' || case when blocked then 'PASS' else 'FAIL' end;

  -- the team records a quote that came by text or email, for the project's factory
  insert into public.factory_quotes (project_id, quantity, price_per_piece, notes)
  values (p1, 500, 1.0, 'Received by text') returning * into qt;
  report := report || E'\nthe team can record a quote for the project''s factory: version ' || qt.version || ' (want 3) ' || case when qt.version = 3 and qt.factory_id = fa then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_quotes (project_id, quantity, price_per_piece) values (p3, 100, 1);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na project with no factory cannot have a quote: ' || case when blocked then 'PASS' else 'FAIL' end;

  -- a person cannot mark a waiting quote as replaced
  blocked := false;
  begin
    update public.factory_quotes set status = 'superseded' where id = qt.id;
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na person cannot mark a quote as replaced: ' || case when blocked then 'PASS' else 'FAIL' end;

  update public.factory_quotes set status = 'approved' where id = qt.id;
  select status into st from public.factory_quotes where id = qt.id;
  report := report || E'\nthe team approves a waiting quote: ' || st || ' ' || case when st = 'approved' then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- one approved quote per project ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fa_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.factory_quotes (project_id, quantity, price_per_piece) values (p1, 500, 0.9) returning * into q4;
  execute 'reset role';

  select status into st from public.factory_quotes where id = qt.id;
  report := report || E'\na newer quote does not replace an approved one: ' || st || ' ' || case when st = 'approved' then 'PASS' else 'FAIL' end;

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  blocked := false;
  begin
    update public.factory_quotes set status = 'approved' where id = q4.id;
  exception when unique_violation then blocked := true;
  end;
  report := report || E'\na project cannot have two approved quotes: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- the total follows its parts ----------
  select total into tot from public.factory_quotes where id = qb.id;
  report := report || E'\nthe total is worked out by the database (300 x 2.50): ' || tot || ' (want 750.00) ' || case when tot = 750 then 'PASS' else 'FAIL' end;

  -- ---------- deleting a project removes its quotes ----------
  delete from public.projects where id = p1;
  select count(*) into n from public.factory_quotes where project_id = p1;
  report := report || E'\ndeleting a project removes its quotes: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- ---------- report + roll everything back ----------
  raise exception 'FACTORY QUOTES REPORT (nothing was saved):%', report;
end
$$;
