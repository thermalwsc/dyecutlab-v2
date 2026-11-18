-- =========================================================
-- supabase/tests/payments_checks.sql
-- DYE CUT LAB — prove payments are exact, private, can never be applied twice, and move a paid deposit to Proof
-- =========================================================
--
-- Paste into the Supabase SQL Editor and Run (after applying
-- 20261116000000_payments.sql).
--
-- Same shape as the other checks here: ONE transaction, throwaway accounts and
-- projects, and a deliberate error at the end whose message is the report. The
-- error rolls everything back, so NOTHING is saved. A red "ERROR: PAYMENTS REPORT ..."
-- box is the expected result. Every line should end with PASS.
--
-- The server's own key bypasses row-level security, so the parts that only the server
-- does (creating a payment, applying Square's notification) run here as the database
-- owner. The triggers still apply to the owner, which is the point of the check.
--
-- Requires: 20260928120000_accounts_and_roles.sql,
--           20260929000000_lock_project_tables.sql,
--           20261028000000_quote_versions.sql, 20261104000000_quote_version_kind.sql,
--           20261116000000_payments.sql

do $$
declare
  cust    uuid := '00000000-0000-4000-8000-0000000000a1';
  cust2   uuid := '00000000-0000-4000-8000-0000000000a2';
  staff   uuid := '00000000-0000-4000-8000-0000000000c1';
  fac_usr uuid := '00000000-0000-4000-8000-0000000000d1';
  fac     uuid := '00000000-0000-4000-8000-0000000000f1';
  p1      uuid := gen_random_uuid();   -- 1000.00 quote
  p2      uuid := gen_random_uuid();   -- 123.45 quote (odd cents)
  p3      uuid := gen_random_uuid();   -- another customer's project
  q_ok    uuid := gen_random_uuid();   -- verified, shown, p1
  q_est   uuid := gen_random_uuid();   -- estimate, shown, p1
  q_hid   uuid := gen_random_uuid();   -- verified, NOT shown, p1
  q_odd   uuid := gen_random_uuid();   -- verified, shown, p2
  q_oth   uuid := gen_random_uuid();   -- verified, shown, p3
  dep     public.payments;
  bal     public.payments;
  dep2    public.payments;
  res     jsonb;
  pst     text;
  report  text := '';
  n       bigint;
  blocked boolean;
  rows_hit bigint;
begin
  -- ---------- setup (as the database owner) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (cust,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pay-test-customer@example.test',   '{}', '{}', now(), now()),
    (cust2,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pay-test-customer2@example.test',  '{}', '{}', now(), now()),
    (staff,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pay-test-staff@example.test',      '{}', '{}', now(), now()),
    (fac_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pay-test-factory@example.test',    '{}', '{}', now(), now());

  insert into public.factories (id, name, active) values (fac, 'Payment test factory', true);
  update public.profiles set role = 'dcl_staff' where id = staff;
  update public.profiles set role = 'factory', factory_id = fac where id = fac_usr;

  insert into public.projects (id, title, owner_id, factory_id, status) values
    (p1, 'PAY test: 1000.00', cust,  fac, 'approved'),
    (p2, 'PAY test: 123.45',  cust,  fac, 'approved'),
    (p3, 'PAY test: other customer', cust2, fac, 'approved');

  insert into public.quote_versions (id, project_id, version, quantity, sell_total, sell_per_piece, notice, shown_to_customer, kind) values
    (q_ok,  p1, 1, 500, 1000.00, 2.0000, 'notice', true,  'verified'),
    (q_est, p1, 2, 500, 1000.00, 2.0000, 'notice', true,  'estimate'),
    (q_hid, p1, 3, 500, 1000.00, 2.0000, 'notice', false, 'verified'),
    (q_odd, p2, 1, 100,  123.45, 1.2345, 'notice', true,  'verified'),
    (q_oth, p3, 1, 100, 1000.00, 10.0000, 'notice', true, 'verified');

  -- ---------- a new deposit ----------
  insert into public.payments (project_id, quote_version_id, kind, amount_cents, created_by, status, paid_at, receipt_url)
  values (p1, q_ok, 'deposit', 50000, cust, 'paid', now(), 'https://example.test/forged') returning * into dep;
  report := report || E'\nthe deposit is exactly half of a 1000.00 quote (50000 cents): ' || case when dep.amount_cents = 50000 then 'PASS' else 'FAIL' end;
  report := report || E'\na new payment always starts waiting, whatever it claims: ' || case when dep.status = 'pending' and dep.paid_at is null and dep.receipt_url is null then 'PASS' else 'FAIL' end;

  -- ---------- what a new payment may not be ----------
  blocked := false;
  begin
    insert into public.payments (project_id, quote_version_id, kind, amount_cents) values (p2, q_odd, 'deposit', 5000);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na deposit that is not half the quote is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.payments (project_id, quote_version_id, kind, amount_cents) values (p1, q_est, 'deposit', 50000);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nan estimate cannot be paid, only a verified quote: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.payments (project_id, quote_version_id, kind, amount_cents) values (p1, q_hid, 'deposit', 50000);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na verified quote the customer has not been shown cannot be paid: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.payments (project_id, quote_version_id, kind, amount_cents) values (p1, q_oth, 'deposit', 50000);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na quote of another project cannot be used: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.payments (project_id, quote_version_id, kind, amount_cents) values (p1, q_ok, 'deposit', 50000);
  exception when unique_violation then blocked := true;
  end;
  report := report || E'\na second live deposit for the same project is refused (no double charge): ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.payments (project_id, quote_version_id, kind, amount_cents) values (p1, q_ok, 'balance', 50000);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nthe balance cannot be created before the deposit is paid: ' || case when blocked then 'PASS' else 'FAIL' end;

  -- ---------- Square's order is attached once ----------
  update public.payments set provider_order_id = 'ORDER-1', checkout_url = 'https://example.test/pay' where id = dep.id;
  get diagnostics rows_hit = row_count;
  report := report || E'\nthe Square order and link are attached after the link is made: ' || case when rows_hit = 1 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.payments set provider_order_id = 'ORDER-OTHER' where id = dep.id;
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nthe Square order cannot be swapped afterwards: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.payments set amount_cents = 1 where id = dep.id;
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nthe amount can never be changed: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.payments set kind = 'balance' where id = dep.id;
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nwhat a payment is for can never be changed: ' || case when blocked then 'PASS' else 'FAIL' end;

  -- ---------- Square's notifications ----------
  res := public.record_payment_event('evt-0', 'payment.updated', 'NO-SUCH-ORDER', 'PAY-X', 'COMPLETED', 50000, null);
  report := report || E'\na notification for an order we do not know changes nothing: ' || case when res->>'result' = 'unknown_order' then 'PASS' else 'FAIL' end;

  res := public.record_payment_event('evt-1', 'payment.updated', 'ORDER-1', 'PAY-1', 'COMPLETED', 49999, 'https://example.test/receipt');
  select status into pst from public.payments where id = dep.id;
  report := report || E'\na notification with the wrong amount is not applied: ' || case when res->>'result' = 'amount_mismatch' and pst = 'pending' then 'PASS' else 'FAIL' end;

  res := public.record_payment_event('evt-2', 'payment.updated', 'ORDER-1', 'PAY-1', 'APPROVED', 50000, null);
  select status into pst from public.payments where id = dep.id;
  report := report || E'\na notification that is not final (APPROVED) is ignored: ' || case when res->>'result' = 'ignored' and pst = 'pending' then 'PASS' else 'FAIL' end;

  res := public.record_payment_event('evt-3', 'payment.updated', 'ORDER-1', 'PAY-1', 'COMPLETED', 50000, 'https://example.test/receipt');
  select * into dep from public.payments where id = dep.id;
  report := report || E'\na completed payment marks the deposit paid: ' || case when res->>'result' = 'paid' and dep.status = 'paid' and dep.paid_at is not null then 'PASS' else 'FAIL' end;
  report := report || E'\nthe receipt and Square payment id are kept: ' || case when dep.receipt_url = 'https://example.test/receipt' and dep.provider_payment_id = 'PAY-1' then 'PASS' else 'FAIL' end;
  select status into pst from public.projects where id = p1;
  report := report || E'\na paid deposit moves the project from Approved to Proof: ' || case when pst = 'proof' and (res->>'moved')::boolean then 'PASS' else 'FAIL' end;

  res := public.record_payment_event('evt-3', 'payment.updated', 'ORDER-1', 'PAY-1', 'COMPLETED', 50000, 'https://example.test/receipt');
  report := report || E'\na repeated notification does nothing: ' || case when res->>'result' = 'duplicate' then 'PASS' else 'FAIL' end;

  res := public.record_payment_event('evt-4', 'payment.updated', 'ORDER-1', 'PAY-1', 'CANCELED', 50000, null);
  select status into pst from public.payments where id = dep.id;
  report := report || E'\na later "cancelled" cannot undo a paid payment: ' || case when res->>'result' = 'already_paid' and pst = 'paid' then 'PASS' else 'FAIL' end;

  select count(*) into n from public.payment_events;
  report := report || E'\nevery notification id is remembered: ' || n || ' (want 5) ' || case when n = 5 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.payments set status = 'pending' where id = dep.id;
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na paid payment cannot go back to waiting: ' || case when blocked then 'PASS' else 'FAIL' end;

  -- ---------- the balance ----------
  blocked := false;
  begin
    insert into public.payments (project_id, quote_version_id, kind, amount_cents) values (p1, q_ok, 'balance', 40000);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na balance that is not the other half is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  insert into public.payments (project_id, quote_version_id, kind, amount_cents, created_by) values (p1, q_ok, 'balance', 50000, cust) returning * into bal;
  report := report || E'\nonce the deposit is paid, the balance (the other 50000) is allowed: ' || case when bal.status = 'pending' then 'PASS' else 'FAIL' end;

  update public.payments set provider_order_id = 'ORDER-2' where id = bal.id;
  res := public.record_payment_event('evt-5', 'payment.updated', 'ORDER-2', 'PAY-2', 'COMPLETED', 50000, 'https://example.test/receipt2');
  select status into pst from public.projects where id = p1;
  report := report || E'\na paid balance is recorded and does not move the project: ' || case when res->>'result' = 'paid' and not (res->>'moved')::boolean and pst = 'proof' then 'PASS' else 'FAIL' end;

  update public.payments set status = 'refunded' where id = bal.id;
  get diagnostics rows_hit = row_count;
  report := report || E'\na paid payment can be marked refunded: ' || case when rows_hit = 1 then 'PASS' else 'FAIL' end;

  -- ---------- a failed payment frees the slot ----------
  insert into public.payments (project_id, quote_version_id, kind, amount_cents) values (p2, q_odd, 'deposit', 6173) returning * into dep2;
  report := report || E'\nodd cents: the deposit rounds up (12345 cents gives 6173): ' || case when dep2.amount_cents = 6173 then 'PASS' else 'FAIL' end;
  update public.payments set provider_order_id = 'ORDER-3' where id = dep2.id;
  res := public.record_payment_event('evt-6', 'payment.updated', 'ORDER-3', 'PAY-3', 'FAILED', 6173, null);
  select status into pst from public.payments where id = dep2.id;
  report := report || E'\na failed payment is recorded as failed: ' || case when res->>'result' = 'failed' and pst = 'failed' then 'PASS' else 'FAIL' end;
  select status into pst from public.projects where id = p2;
  report := report || E'\na failed deposit does not move the project: ' || case when pst = 'approved' then 'PASS' else 'FAIL' end;

  insert into public.payments (project_id, quote_version_id, kind, amount_cents) values (p2, q_odd, 'deposit', 6173) returning * into dep2;
  report := report || E'\na failed payment frees the slot so the customer can try again: ' || case when dep2.status = 'pending' then 'PASS' else 'FAIL' end;
  update public.payments set provider_order_id = 'ORDER-4' where id = dep2.id;
  perform public.record_payment_event('evt-7', 'payment.updated', 'ORDER-4', 'PAY-4', 'COMPLETED', 6173, null);

  blocked := false;
  begin
    insert into public.payments (project_id, quote_version_id, kind, amount_cents) values (p2, q_odd, 'balance', 6173);
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nodd cents: the balance is the rest (6172), not another 6173: ' || case when blocked then 'PASS' else 'FAIL' end;
  insert into public.payments (project_id, quote_version_id, kind, amount_cents) values (p2, q_odd, 'balance', 6172) returning * into bal;
  report := report || E'\nodd cents: deposit and balance add up to the quote to the cent (6173 + 6172 = 12345): ' || case when 6173 + bal.amount_cents = 12345 then 'PASS' else 'FAIL' end;

  -- a payment on the other customer's project, to test who sees what
  insert into public.payments (project_id, quote_version_id, kind, amount_cents, created_by) values (p3, q_oth, 'deposit', 50000, cust2);

  -- ---------- who can see what ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.payments;
  report := report || E'\nthe customer reads the payments on their own projects: ' || n || ' (want 5) ' || case when n = 5 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.payments (project_id, quote_version_id, kind, amount_cents) values (p1, q_ok, 'balance', 50000);
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe customer cannot create a payment themselves: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.payments set status = 'paid' where id = dep2.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe customer cannot mark a payment paid: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    delete from public.payments where id = dep2.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe customer cannot delete a payment: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    perform public.record_payment_event('evt-forged', 'payment.updated', 'ORDER-4', 'PAY-4', 'COMPLETED', 6173, null);
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe customer cannot send themselves a Square notification: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    perform count(*) from public.payment_events;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe list of notifications is closed to customers: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', cust2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.payments;
  report := report || E'\nanother customer reads only their own: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.payments;
  report := report || E'\nthe team reads every payment: ' || n || ' (want 6) ' || case when n = 6 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.payments set status = 'paid' where id = dep2.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe team cannot edit a payment either: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', fac_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.payments;
  report := report || E'\na factory sees no payments: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  execute 'set local role anon';
  blocked := false;
  begin
    perform count(*) from public.payments;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\na signed-out visitor cannot read payments: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- deleting a project removes its payments ----------
  delete from public.projects where id = p1;
  select count(*) into n from public.payments where project_id = p1;
  report := report || E'\ndeleting a project removes its payments: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- ---------- report + roll everything back ----------
  raise exception 'PAYMENTS REPORT (nothing was saved):%', report;
end
$$;
