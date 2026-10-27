-- =========================================================
-- supabase/tests/pricing_tables_checks.sql
-- DYE CUT LAB — prove the pricing tables are the team's alone and reject bad numbers
-- =========================================================
--
-- Paste into the Supabase SQL Editor and Run (after applying
-- 20261026000000_pricing_tables.sql).
--
-- Same shape as the other checks here: ONE transaction, throwaway accounts and
-- rows, and a deliberate error at the end whose message is the report. The
-- error rolls everything back, so NOTHING is saved. A red "ERROR: PRICING
-- TABLES REPORT ..." box is the expected result. Every line should end with PASS.
--
-- Requires: 20260928120000_accounts_and_roles.sql,
--           20261026000000_pricing_tables.sql

do $$
declare
  cust    uuid := '00000000-0000-4000-8000-0000000000a1';
  staff   uuid := '00000000-0000-4000-8000-0000000000c1';
  fac_usr uuid := '00000000-0000-4000-8000-0000000000d1';
  fac     uuid := '00000000-0000-4000-8000-0000000000f1';
  prod    uuid := gen_random_uuid();
  report  text := '';
  n       bigint;
  blocked boolean;
  t0      timestamptz;
  t1      timestamptz;
  tbl     text;
begin
  -- ---------- setup (as the database owner) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (cust,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pricing-test-customer@example.test', '{}', '{}', now(), now()),
    (staff,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pricing-test-staff@example.test',    '{}', '{}', now(), now()),
    (fac_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pricing-test-factory@example.test',  '{}', '{}', now(), now());

  insert into public.factories (id, name, active) values (fac, 'Pricing test factory', true);
  update public.profiles set role = 'dcl_staff' where id = staff;
  update public.profiles set role = 'factory', factory_id = fac where id = fac_usr;

  -- ---------- the team can add and read every table ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.pricing_products (id, product, style, min_order) values (prod, 'Test box', 'Test mailer', 200);
  insert into public.pricing_product_tiers (product_id, min_quantity, price_per_piece) values (prod, 200, 1.80), (prod, 500, 1.20);
  insert into public.pricing_finishes (name, applies_to, charge_type, amount) values ('Test matte', 'Boxes', 'per_piece', 0.06);
  insert into public.pricing_tooling (name, cost) values ('Test die', 120);
  insert into public.pricing_freight (method, destination, charged_by, rate) values ('sea', 'US West Coast', 'cubic_metre', 95);
  insert into public.pricing_margins (name, applies_to, margin) values ('Test default', 'All products', 0.35);
  insert into public.pricing_lead_times (product, proof_days, production_days) values ('Test box', 5, 15);

  select count(*) into n from public.pricing_products where id = prod;
  report := report || E'\nteam can add and read a product: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;

  select count(*) into n from public.pricing_product_tiers where product_id = prod;
  report := report || E'\nteam can add and read its quantity tiers: ' || n || ' (want 2) ' || case when n = 2 then 'PASS' else 'FAIL' end;

  select (select count(*) from public.pricing_finishes) + (select count(*) from public.pricing_tooling)
       + (select count(*) from public.pricing_freight) + (select count(*) from public.pricing_margins)
       + (select count(*) from public.pricing_lead_times) into n;
  report := report || E'\nteam can add and read finishes, tooling, freight, margins and lead times: ' || n || ' (want 5) ' || case when n = 5 then 'PASS' else 'FAIL' end;

  update public.pricing_product_tiers set price_per_piece = 1.75 where product_id = prod and min_quantity = 200;
  select count(*) into n from public.pricing_product_tiers where product_id = prod and min_quantity = 200 and price_per_piece = 1.75;
  report := report || E'\nteam can change a price: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- a customer sees and changes nothing ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  foreach tbl in array array['pricing_products', 'pricing_product_tiers', 'pricing_finishes', 'pricing_tooling', 'pricing_freight', 'pricing_margins', 'pricing_lead_times'] loop
    execute format('select count(*) from public.%I', tbl) into n;
    report := report || E'\ncustomer reads no row of ' || tbl || ': ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  end loop;

  blocked := false;
  begin
    insert into public.pricing_margins (name, margin) values ('Customer margin', 0.10);
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\ncustomer cannot add a margin rule: ' || case when blocked then 'PASS' else 'FAIL' end;

  update public.pricing_product_tiers set price_per_piece = 0 where product_id = prod;
  get diagnostics n = row_count;
  report := report || E'\ncustomer cannot change a price (rows touched): ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  delete from public.pricing_products where id = prod;
  get diagnostics n = row_count;
  report := report || E'\ncustomer cannot delete a product (rows touched): ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- a factory sees nothing either ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fac_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select (select count(*) from public.pricing_products) + (select count(*) from public.pricing_product_tiers)
       + (select count(*) from public.pricing_margins) + (select count(*) from public.pricing_freight) into n;
  report := report || E'\nfactory reads no pricing row: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.pricing_products (product) values ('Factory product');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory cannot add a product: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- a signed-out visitor cannot even ask ----------
  execute 'set local role anon';
  blocked := false;
  begin
    perform count(*) from public.pricing_margins;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nsigned-out visitor cannot read margins: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- bad numbers are refused (as the team) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  blocked := false;
  begin
    insert into public.pricing_product_tiers (product_id, min_quantity, price_per_piece) values (prod, 1000, -1);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na negative price is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.pricing_margins (name, margin) values ('Too high', 0.95);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na margin of 95% or more is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.pricing_margins (name, margin, min_quantity, max_quantity) values ('Backwards range', 0.2, 500, 100);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na quantity range that ends before it starts is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.pricing_finishes (name, charge_type, amount) values ('Odd charge', 'per_kilo', 1);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nan unknown charge type is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.pricing_product_tiers (product_id, min_quantity, price_per_piece) values (prod, 200, 2.00);
  exception when unique_violation then blocked := true;
  end;
  report := report || E'\nthe same quantity level twice for a product is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.pricing_products (product, style) values ('  test BOX ', 'TEST mailer');
  exception when unique_violation then blocked := true;
  end;
  report := report || E'\nthe same active product and style twice is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.pricing_products (product) values ('   ');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na blank product name is refused: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- updated_at moves when a row changes ----------
  insert into public.pricing_tooling (name, cost, updated_at) values ('Old die', 50, '2020-01-01 00:00:00+00');
  select updated_at into t0 from public.pricing_tooling where name = 'Old die';
  update public.pricing_tooling set cost = 55 where name = 'Old die';
  select updated_at into t1 from public.pricing_tooling where name = 'Old die';
  report := report || E'\nupdated_at moves forward on a change: ' || case when t1 > t0 then 'PASS' else 'FAIL' end;

  -- ---------- removing a product removes its tiers ----------
  delete from public.pricing_products where id = prod;
  select count(*) into n from public.pricing_product_tiers where product_id = prod;
  report := report || E'\ndeleting a product removes its tiers: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- ---------- report + roll everything back ----------
  raise exception 'PRICING TABLES REPORT (nothing was saved):%', report;
end
$$;
