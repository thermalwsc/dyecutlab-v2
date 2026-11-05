-- =========================================================
-- supabase/tests/quote_version_kind_checks.sql
-- DYE CUT LAB — prove an estimate and a verified quote cannot be mistaken, and a verified quote is traceable
-- =========================================================
--
-- Paste into the Supabase SQL Editor and Run (after applying
-- 20261104000000_quote_version_kind.sql).
--
-- Same shape as the other checks here: ONE transaction, throwaway accounts and
-- projects, and a deliberate error at the end whose message is the report. The
-- error rolls everything back, so NOTHING is saved. A red "ERROR: QUOTE VERSION
-- KIND REPORT ..." box is the expected result. Every line should end with PASS.
-- All numbers are made up.
--
-- Requires: 20261028000000_quote_versions.sql,
--           20261102000000_factory_quotes.sql,
--           20261104000000_quote_version_kind.sql

do $$
declare
  cust    uuid := '00000000-0000-4000-8000-0000000000a1';
  staff   uuid := '00000000-0000-4000-8000-0000000000c1';
  fa_usr  uuid := '00000000-0000-4000-8000-0000000000d1';
  fa      uuid := '00000000-0000-4000-8000-0000000000f1';
  p1      uuid := gen_random_uuid();
  fq      public.factory_quotes;
  v_est   public.quote_versions;
  v_ver   public.quote_versions;
  report  text := '';
  n       bigint;
  blocked boolean;
  k       text;
  link    uuid;
begin
  -- ---------- setup (as the database owner) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (cust,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kind-test-customer@example.test', '{}', '{}', now(), now()),
    (staff,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kind-test-staff@example.test',    '{}', '{}', now(), now()),
    (fa_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kind-test-factory@example.test',  '{}', '{}', now(), now());

  insert into public.factories (id, name, active) values (fa, 'Kind test factory', true);
  update public.profiles set role = 'dcl_staff' where id = staff;
  update public.profiles set role = 'factory', factory_id = fa where id = fa_usr;
  insert into public.projects (id, title, owner_id, factory_id, status) values (p1, 'Kind test project', cust, fa, 'factory_review');

  -- the factory sends a quote and the team approves it
  perform set_config('request.jwt.claims', json_build_object('sub', fa_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.factory_quotes (project_id, quantity, price_per_piece, tooling_cost, lead_days)
  values (p1, 500, 1.1, 100, 30) returning * into fq;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.factory_quotes set status = 'approved' where id = fq.id;

  -- ---------- an old-style call (13 arguments) still saves an estimate ----------
  select * into v_est from public.save_quote_version(
    p1, 500, 1000, 2, 20, array['product'], array['freight'], 'This is an estimate until a factory confirms it.',
    '{}'::jsonb, '[]'::jsonb, 650, 0.35, 'Test default');
  report := report || E'\na call without a kind saves an estimate: ' || v_est.kind || ' ' || case when v_est.kind = 'estimate' then 'PASS' else 'FAIL' end;

  -- ---------- a verified quote, traced to its factory quote ----------
  select * into v_ver from public.save_quote_version(
    p1, 500, 1000, 2, 30, array['product','tooling'], array['freight'], 'Confirmed by a factory.',
    '{}'::jsonb, '[]'::jsonb, 650, 0.35, 'Test default', 'verified', fq.id);
  report := report || E'\na verified version says so: ' || v_ver.kind || ' ' || case when v_ver.kind = 'verified' then 'PASS' else 'FAIL' end;

  select factory_quote_id into link from public.quote_version_details where version_id = v_ver.id;
  report := report || E'\nthe verified quote is traced to its factory quote: ' || case when link = fq.id then 'PASS' else 'FAIL' end;

  select factory_quote_id into link from public.quote_version_details where version_id = v_est.id;
  report := report || E'\nan estimate is traced to no factory quote: ' || case when link is null then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    perform 1 from public.save_quote_version(
      p1, 500, 1000, 2, 30, '{}', '{}', 'Confirmed by a factory.', '{}'::jsonb, '[]'::jsonb, 650, 0.35, 'Test default', 'verified', fq.id);
  exception when unique_violation then blocked := true;
  end;
  report := report || E'\na factory quote cannot be behind two verified quotes: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    perform 1 from public.save_quote_version(
      p1, 500, 1000, 2, 30, '{}', '{}', 'x', '{}'::jsonb, '[]'::jsonb, 650, 0.35, 'Test default', 'final', null);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nan unknown kind is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.quote_versions set kind = 'verified' where id = v_est.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe team cannot turn an estimate into a verified quote afterwards: ' || case when blocked then 'PASS' else 'FAIL' end;

  -- show both to the customer
  update public.quote_versions set shown_to_customer = true where id in (v_est.id, v_ver.id);
  execute 'reset role';

  -- ---------- the customer reads the kind, never the trace ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.quote_versions where project_id = p1 and kind in ('estimate', 'verified');
  report := report || E'\ncustomer reads both shown versions with their kind: ' || n || ' (want 2) ' || case when n = 2 then 'PASS' else 'FAIL' end;

  select count(*) into n from public.quote_version_details;
  report := report || E'\ncustomer reads no private details or trace: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    perform 1 from public.save_quote_version(
      p1, 500, 1, 1, null, '{}', '{}', 'x', '{}'::jsonb, '[]'::jsonb, 1, 0.1, 'x', 'verified', fq.id);
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\ncustomer cannot save a verified quote: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- the factory sees no quote of this kind ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fa_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from public.quote_versions) + (select count(*) from public.quote_version_details) into n;
  report := report || E'\nfactory sees no quote version or detail: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- removing the factory quote only empties the link ----------
  delete from public.factory_quotes where id = fq.id;
  select count(*) into n from public.quote_versions where id = v_ver.id;
  select factory_quote_id into link from public.quote_version_details where version_id = v_ver.id;
  report := report || E'\ndeleting the factory quote keeps the verified quote and empties the link: ' || case when n = 1 and link is null then 'PASS' else 'FAIL' end;

  -- ---------- report + roll everything back ----------
  raise exception 'QUOTE VERSION KIND REPORT (nothing was saved):%', report;
end
$$;
