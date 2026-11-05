-- =========================================================
-- supabase/tests/factory_change_notes_checks.sql
-- DYE CUT LAB — prove change notes belong to the right factory, are private, and are never rewritten
-- =========================================================
--
-- Paste into the Supabase SQL Editor and Run (after applying
-- 20261105000000_factory_change_notes.sql).
--
-- Same shape as the other checks here: ONE transaction, throwaway accounts and
-- projects, and a deliberate error at the end whose message is the report. The
-- error rolls everything back, so NOTHING is saved. A red "ERROR: FACTORY CHANGE
-- NOTES REPORT ..." box is the expected result. Every line should end with PASS.
--
-- Requires: 20260928120000_accounts_and_roles.sql,
--           20260929000000_lock_project_tables.sql,
--           20261105000000_factory_change_notes.sql

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
  note1   public.factory_change_notes;
  noteb   public.factory_change_notes;
  notet   public.factory_change_notes;
  report  text := '';
  n       bigint;
  blocked boolean;
begin
  -- ---------- setup (as the database owner) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (cust,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cn-test-customer@example.test',  '{}', '{}', now(), now()),
    (staff,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cn-test-staff@example.test',     '{}', '{}', now(), now()),
    (fa_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cn-test-factory-a@example.test', '{}', '{}', now(), now()),
    (fb_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cn-test-factory-b@example.test', '{}', '{}', now(), now());

  insert into public.factories (id, name, active) values (fa, 'Note test factory A', true), (fb, 'Note test factory B', true);
  update public.profiles set role = 'dcl_staff' where id = staff;
  update public.profiles set role = 'factory', factory_id = fa where id = fa_usr;
  update public.profiles set role = 'factory', factory_id = fb where id = fb_usr;

  insert into public.projects (id, title, owner_id, factory_id, status) values
    (p1, 'CN test: assigned to factory A', cust, fa, 'production'),
    (p2, 'CN test: assigned to factory B', cust, fb, 'production'),
    (p3, 'CN test: no factory',            cust, null, 'development');

  -- ---------- factory A records a change on its own project ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fa_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.factory_change_notes (project_id, kind, what_changed, reason)
  values (p1, 'material', 'Changed from 350 gsm to 400 gsm board', 'The 350 gsm board is out of stock') returning * into note1;

  report := report || E'\nthe factory comes from the project, not the writer: ' || case when note1.factory_id = fa then 'PASS' else 'FAIL' end;
  report := report || E'\nthe database records who wrote it: ' || case when note1.created_by = fa_usr then 'PASS' else 'FAIL' end;
  report := report || E'\nthe database records when: ' || case when note1.created_at is not null then 'PASS' else 'FAIL' end;

  -- ---------- what factory A may not do ----------
  blocked := false;
  begin
    insert into public.factory_change_notes (project_id, kind, what_changed, reason) values (p2, 'price', 'x', 'y');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot write on another factory''s project: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_change_notes (project_id, kind, what_changed, reason) values (p3, 'price', 'x', 'y');
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  report := report || E'\nfactory A cannot write on a project with no factory: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_change_notes (project_id, kind, what_changed, reason, factory_id) values (p1, 'price', 'x', 'y', fb);
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot choose the factory: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_change_notes (project_id, kind, what_changed, reason) values (p1, 'colour', 'x', 'y');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nan unknown kind of change is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_change_notes (project_id, kind, what_changed, reason) values (p1, 'price', '   ', 'a reason');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na note that says nothing changed is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_change_notes (project_id, kind, what_changed, reason) values (p1, 'price', 'Raised the price', '   ');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na note without a reason is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_change_notes (project_id, kind, what_changed, reason) values (p1, 'other', repeat('x', 1001), 'a reason');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na very long note is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_change_notes set reason = 'rewritten' where id = note1.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot edit a note: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    delete from public.factory_change_notes where id = note1.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot delete a note: ' || case when blocked then 'PASS' else 'FAIL' end;

  select count(*) into n from public.factory_change_notes;
  report := report || E'\nfactory A reads its own note: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- factory B sees none of A's, and writes on its own project ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fb_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.factory_change_notes;
  report := report || E'\nfactory B sees none of factory A''s notes: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  insert into public.factory_change_notes (project_id, kind, what_changed, reason)
  values (p2, 'timing', 'Production moved from 15 to 20 days', 'The machine is booked') returning * into noteb;
  report := report || E'\nfactory B writes on its own project: ' || case when noteb.factory_id = fb then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- the customer and a signed-out visitor ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.factory_change_notes;
  report := report || E'\ncustomer reads no note, even on their own project: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_change_notes (project_id, kind, what_changed, reason) values (p1, 'price', 'x', 'y');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\ncustomer cannot write a note: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  execute 'set local role anon';
  blocked := false;
  begin
    perform count(*) from public.factory_change_notes;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nsigned-out visitor cannot read notes: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- the team reads everything and can add a note ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.factory_change_notes;
  report := report || E'\nteam reads every note: ' || n || ' (want 2) ' || case when n = 2 then 'PASS' else 'FAIL' end;

  insert into public.factory_change_notes (project_id, kind, what_changed, reason)
  values (p1, 'artwork', 'Moved the logo 5 mm left', 'Told us by text') returning * into notet;
  report := report || E'\nthe team can record a note for the project''s factory: ' || case when notet.factory_id = fa and notet.created_by = staff then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_change_notes set reason = 'rewritten' where id = notet.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe team cannot edit a note: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    delete from public.factory_change_notes where id = notet.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe team cannot delete a note: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- deleting a project removes its notes ----------
  delete from public.projects where id = p1;
  select count(*) into n from public.factory_change_notes where project_id = p1;
  report := report || E'\ndeleting a project removes its notes: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- ---------- report + roll everything back ----------
  raise exception 'FACTORY CHANGE NOTES REPORT (nothing was saved):%', report;
end
$$;
