-- =========================================================
-- supabase/tests/factory_messages_checks.sql
-- DYE CUT LAB — prove the team and factory thread is private, honest about who wrote what, and never rewrites an original
-- =========================================================
--
-- Paste into the Supabase SQL Editor and Run (after applying
-- 20261109000000_factory_messages.sql).
--
-- Same shape as the other checks here: ONE transaction, throwaway accounts and
-- projects, and a deliberate error at the end whose message is the report. The
-- error rolls everything back, so NOTHING is saved. A red "ERROR: FACTORY MESSAGES
-- REPORT ..." box is the expected result. Every line should end with PASS.
--
-- Requires: 20260928120000_accounts_and_roles.sql,
--           20260929000000_lock_project_tables.sql,
--           20261109000000_factory_messages.sql

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
  m1      public.factory_messages;
  mb      public.factory_messages;
  mt      public.factory_messages;
  report  text := '';
  n       bigint;
  blocked boolean;
  rows_hit bigint;
begin
  -- ---------- setup (as the database owner) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (cust,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fm-test-customer@example.test',  '{}', '{}', now(), now()),
    (staff,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fm-test-staff@example.test',     '{}', '{}', now(), now()),
    (fa_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fm-test-factory-a@example.test', '{}', '{}', now(), now()),
    (fb_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fm-test-factory-b@example.test', '{}', '{}', now(), now());

  insert into public.factories (id, name, active) values (fa, 'Thread test factory A', true), (fb, 'Thread test factory B', true);
  update public.profiles set role = 'dcl_staff' where id = staff;
  update public.profiles set role = 'factory', factory_id = fa where id = fa_usr;
  update public.profiles set role = 'factory', factory_id = fb where id = fb_usr;

  insert into public.projects (id, title, owner_id, factory_id, status) values
    (p1, 'FM test: assigned to factory A', cust, fa, 'factory_review'),
    (p2, 'FM test: assigned to factory B', cust, fb, 'factory_review'),
    (p3, 'FM test: no factory',            cust, null, 'development');

  -- ---------- factory A writes on its own project ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fa_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.factory_messages (project_id, original_text, original_lang)
  values (p1, '我们可以用400克卡纸，价格不变。', 'zh') returning * into m1;

  report := report || E'\nthe factory comes from the project, not the writer: ' || case when m1.factory_id = fa then 'PASS' else 'FAIL' end;
  report := report || E'\nthe database records which side wrote it (factory): ' || case when m1.sender_side = 'factory' then 'PASS' else 'FAIL' end;
  report := report || E'\nthe database records who wrote it: ' || case when m1.sender_id = fa_usr then 'PASS' else 'FAIL' end;
  report := report || E'\nthe database records when: ' || case when m1.created_at is not null then 'PASS' else 'FAIL' end;
  report := report || E'\na new message starts untranslated: ' || case when m1.translation_status = 'pending' and m1.translated_text is null then 'PASS' else 'FAIL' end;

  -- ---------- what factory A may not do ----------
  blocked := false;
  begin
    insert into public.factory_messages (project_id, original_text, original_lang) values (p2, 'hello', 'en');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot write on another factory''s project: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_messages (project_id, original_text, original_lang) values (p3, 'hello', 'en');
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  report := report || E'\nfactory A cannot write on a project with no factory: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_messages (project_id, original_text, original_lang, sender_side) values (p1, 'hello', 'en', 'team');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot pretend to be the team: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_messages (project_id, original_text, original_lang, factory_id) values (p1, 'hello', 'en', fb);
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot choose the factory: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_messages (project_id, original_text, original_lang, translated_text) values (p1, 'hello', 'en', '你好');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot write its own translation: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_messages (project_id, original_text, original_lang) values (p1, '   ', 'en');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nan empty message is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_messages (project_id, original_text, original_lang) values (p1, repeat('x', 4001), 'en');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na very long message is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_messages (project_id, original_text, original_lang) values (p1, 'bonjour', 'fr');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na language other than English or Chinese is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_messages set original_text = 'rewritten' where id = m1.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot edit a message: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    delete from public.factory_messages where id = m1.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory A cannot delete a message: ' || case when blocked then 'PASS' else 'FAIL' end;

  select count(*) into n from public.factory_messages;
  report := report || E'\nfactory A reads its own message: ' || n || ' (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- factory B sees none of A's, and writes on its own project ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fb_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.factory_messages;
  report := report || E'\nfactory B sees none of factory A''s messages: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  insert into public.factory_messages (project_id, original_text, original_lang)
  values (p2, '交货期需要20天。', 'zh') returning * into mb;
  report := report || E'\nfactory B writes on its own project: ' || case when mb.factory_id = fb then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- the customer and a signed-out visitor ----------
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.factory_messages;
  report := report || E'\ncustomer reads no message, even on their own project: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_messages (project_id, original_text, original_lang) values (p1, 'hello', 'en');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\ncustomer cannot write in the thread: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  execute 'set local role anon';
  blocked := false;
  begin
    perform count(*) from public.factory_messages;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nsigned-out visitor cannot read the thread: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- the team reads everything and writes as the team ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.factory_messages;
  report := report || E'\nteam reads every message: ' || n || ' (want 2) ' || case when n = 2 then 'PASS' else 'FAIL' end;

  insert into public.factory_messages (project_id, original_text, original_lang)
  values (p1, 'Yes, 400 gsm card is fine. Please confirm the price stays at $0.466.', 'en') returning * into mt;
  report := report || E'\nthe team writes as the team, for the project''s factory: ' || case when mt.sender_side = 'team' and mt.factory_id = fa and mt.sender_id = staff then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.factory_messages (project_id, original_text, original_lang) values (p3, 'hello', 'en');
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  report := report || E'\nthe team cannot write on a project with no factory: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_messages set original_text = 'rewritten' where id = mt.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe team cannot edit a message: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    delete from public.factory_messages where id = mt.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe team cannot delete a message: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- the server saves translations (as the database owner, like the server's own key) ----------
  update public.factory_messages
     set translated_text = 'We can use 400 g card, the price stays the same.', translated_lang = 'en',
         translation_status = 'done', translated_at = now()
   where id = m1.id;
  get diagnostics rows_hit = row_count;
  report := report || E'\nthe server can save a translation: ' || case when rows_hit = 1 then 'PASS' else 'FAIL' end;

  update public.factory_messages
     set translated_text = 'We can use 400 g card; the price is unchanged.', translation_note = 'Corrected by the team'
   where id = m1.id;
  get diagnostics rows_hit = row_count;
  report := report || E'\na translation can be replaced when it is corrected: ' || case when rows_hit = 1 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_messages set original_text = 'rewritten' where id = m1.id;
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nthe original text can never change, even for the server: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_messages set original_lang = 'en' where id = m1.id;
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nthe original language can never change: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_messages set sender_side = 'team' where id = m1.id;
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nwho wrote it can never change: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_messages set translation_status = 'done', translated_text = null where id = mb.id;
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na "done" translation must have its text: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_messages set translation_status = 'done', translated_text = 'same language', translated_lang = 'zh' where id = mb.id;
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na translation into the original''s own language is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.factory_messages set translation_status = 'maybe' where id = mb.id;
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nan unknown translation status is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  -- ---------- deleting a project removes its thread ----------
  delete from public.projects where id = p1;
  select count(*) into n from public.factory_messages where project_id = p1;
  report := report || E'\ndeleting a project removes its messages: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- ---------- report + roll everything back ----------
  raise exception 'FACTORY MESSAGES REPORT (nothing was saved):%', report;
end
$$;
