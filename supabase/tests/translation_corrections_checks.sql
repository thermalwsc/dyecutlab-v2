-- =========================================================
-- supabase/tests/translation_corrections_checks.sql
-- DYE CUT LAB — prove a correction replaces the translation, is kept forever, and follows who may correct what
-- =========================================================
--
-- Paste into the Supabase SQL Editor and Run (after applying
-- 20261113000000_translation_corrections.sql).
--
-- Same shape as the other checks here: ONE transaction, throwaway accounts and
-- projects, and a deliberate error at the end whose message is the report. The
-- error rolls everything back, so NOTHING is saved. A red "ERROR: TRANSLATION
-- CORRECTIONS REPORT ..." box is the expected result. Every line should end with PASS.
--
-- Requires: 20260928120000_accounts_and_roles.sql,
--           20260929000000_lock_project_tables.sql,
--           20261109000000_factory_messages.sql,
--           20261113000000_translation_corrections.sql

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
  m_fac   public.factory_messages;  -- written by factory A (Chinese), read by the team in English
  m_team  public.factory_messages;  -- written by the team (English), read by factory A in Chinese
  m_wait  public.factory_messages;  -- written by factory A, translation still pending
  c1      public.translation_corrections;
  c2      public.translation_corrections;
  cur     public.factory_messages;
  report  text := '';
  n       bigint;
  blocked boolean;
begin
  -- ---------- setup (as the database owner) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (cust,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tc-test-customer@example.test',  '{}', '{}', now(), now()),
    (staff,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tc-test-staff@example.test',     '{}', '{}', now(), now()),
    (fa_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tc-test-factory-a@example.test', '{}', '{}', now(), now()),
    (fb_usr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tc-test-factory-b@example.test', '{}', '{}', now(), now());

  insert into public.factories (id, name, active) values (fa, 'Correction test factory A', true), (fb, 'Correction test factory B', true);
  update public.profiles set role = 'dcl_staff' where id = staff;
  update public.profiles set role = 'factory', factory_id = fa where id = fa_usr;
  update public.profiles set role = 'factory', factory_id = fb where id = fb_usr;

  insert into public.projects (id, title, owner_id, factory_id, status) values
    (p1, 'TC test: factory A', cust, fa, 'factory_review'),
    (p2, 'TC test: factory B', cust, fb, 'factory_review');

  -- the factory writes in Chinese, the team writes in English
  perform set_config('request.jwt.claims', json_build_object('sub', fa_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.factory_messages (project_id, original_text, original_lang) values (p1, '单价是0.466美元，3000套。', 'zh') returning * into m_fac;
  insert into public.factory_messages (project_id, original_text, original_lang) values (p1, '还在等翻译。', 'zh') returning * into m_wait;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.factory_messages (project_id, original_text, original_lang) values (p1, 'Please confirm 3,000 sets at $0.466.', 'en') returning * into m_team;
  execute 'reset role';

  -- the server saves the translations (as the database owner, like the server's own key)
  update public.factory_messages set translated_text = 'The price is 0.466 dollars, 3000 sets.', translated_lang = 'en', translation_status = 'done' where id = m_fac.id;
  update public.factory_messages set translated_text = '请确认3,000套，单价0.466美元。', translated_lang = 'zh', translation_status = 'done', translation_note = 'Check 3,000' where id = m_team.id;

  -- ---------- the team corrects what the factory wrote (read in English) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.translation_corrections (message_id, new_text, kind, note)
  values (m_fac.id, 'The unit price is $0.466 for 3000 sets.', 'wording', 'Said "dollars" instead of using the $ sign') returning * into c1;

  report := report || E'\nthe database keeps the translation before the correction: ' || case when c1.old_text = 'The price is 0.466 dollars, 3000 sets.' then 'PASS' else 'FAIL' end;
  report := report || E'\nthe database records the language it was in: ' || case when c1.lang = 'en' then 'PASS' else 'FAIL' end;
  report := report || E'\nthe database records which side corrected: ' || case when c1.corrector_side = 'team' then 'PASS' else 'FAIL' end;
  report := report || E'\nthe database records who corrected it: ' || case when c1.corrected_by = staff then 'PASS' else 'FAIL' end;
  report := report || E'\nthe project and factory come from the message: ' || case when c1.project_id = p1 and c1.factory_id = fa then 'PASS' else 'FAIL' end;

  select * into cur from public.factory_messages where id = m_fac.id;
  report := report || E'\nthe message now shows the corrected words: ' || case when cur.translated_text = 'The unit price is $0.466 for 3000 sets.' then 'PASS' else 'FAIL' end;
  report := report || E'\nthe message is marked as corrected: ' || case when cur.corrected_at is not null then 'PASS' else 'FAIL' end;
  report := report || E'\nthe original text is untouched: ' || case when cur.original_text = '单价是0.466美元，3000套。' and cur.original_lang = 'zh' then 'PASS' else 'FAIL' end;

  -- ---------- what the team may not do ----------
  blocked := false;
  begin
    insert into public.translation_corrections (message_id, new_text, kind) values (m_team.id, 'Please confirm 3000 sets.', 'wording');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nthe team cannot correct the translation of its own message: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.translation_corrections (message_id, new_text, kind) values (m_wait.id, 'Still waiting.', 'wording');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na translation that is not finished cannot be corrected: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.translation_corrections (message_id, new_text, kind) values (m_fac.id, '  The unit price is $0.466 for 3000 sets.  ', 'wording');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na correction that changes nothing is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.translation_corrections (message_id, new_text, kind) values (m_fac.id, '   ', 'wording');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nan empty correction is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.translation_corrections (message_id, new_text, kind) values (m_fac.id, 'Something else.', 'spelling');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\nan unknown kind of mistake is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.translation_corrections (message_id, new_text, kind) values (m_fac.id, 'Something else.', 'other');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\n"other" without a note is refused: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.translation_corrections (message_id, new_text, kind, corrector_side) values (m_fac.id, 'Something else.', 'wording', 'factory');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe corrector cannot choose which side they are: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.translation_corrections set new_text = 'rewritten' where id = c1.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe team cannot edit a correction: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    delete from public.translation_corrections where id = c1.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nthe team cannot delete a correction: ' || case when blocked then 'PASS' else 'FAIL' end;

  select count(*) into n from public.translation_corrections;
  report := report || E'\nthe failed attempts saved nothing: ' || n || ' correction so far (want 1) ' || case when n = 1 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- factory A corrects what the team wrote (read in Chinese) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fa_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.translation_corrections (message_id, new_text, kind)
  values (m_team.id, '请确认3,000套，单价$0.466。', 'number') returning * into c2;
  report := report || E'\na factory corrects the translation it reads: ' || case when c2.corrector_side = 'factory' and c2.lang = 'zh' and c2.factory_id = fa then 'PASS' else 'FAIL' end;

  select * into cur from public.factory_messages where id = m_team.id;
  report := report || E'\nthe correction replaces the translation and clears the old warning: ' || case when cur.translated_text = '请确认3,000套，单价$0.466。' and cur.translation_note is null and cur.corrected_at is not null then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.translation_corrections (message_id, new_text, kind) values (m_fac.id, 'Anything else.', 'wording');
  exception when check_violation then blocked := true;
  end;
  report := report || E'\na factory cannot correct the translation of its own message: ' || case when blocked then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    update public.translation_corrections set kind = 'other' where id = c2.id;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\na factory cannot edit a correction: ' || case when blocked then 'PASS' else 'FAIL' end;

  select count(*) into n from public.translation_corrections;
  report := report || E'\nfactory A reads the corrections on its own projects: ' || n || ' (want 2) ' || case when n = 2 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- ---------- factory B, the customer and a signed-out visitor ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fb_usr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.translation_corrections;
  report := report || E'\nfactory B sees none of factory A''s corrections: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.translation_corrections (message_id, new_text, kind) values (m_team.id, '请确认3000套。', 'wording');
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nfactory B cannot correct another factory''s thread: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.translation_corrections;
  report := report || E'\ncustomer reads no correction: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  blocked := false;
  begin
    insert into public.translation_corrections (message_id, new_text, kind) values (m_team.id, '请确认3000套。', 'wording');
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  report := report || E'\ncustomer cannot correct a translation: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  execute 'set local role anon';
  blocked := false;
  begin
    perform count(*) from public.translation_corrections;
  exception when insufficient_privilege then blocked := true;
  end;
  report := report || E'\nsigned-out visitor cannot read corrections: ' || case when blocked then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- the refused attempts above changed nothing on the messages they aimed at
  select * into cur from public.factory_messages where id = m_team.id;
  report := report || E'\nrefused corrections left the translation as the factory set it: ' || case when cur.translated_text = '请确认3,000套，单价$0.466。' then 'PASS' else 'FAIL' end;

  -- ---------- deleting a project removes its corrections ----------
  delete from public.projects where id = p1;
  select count(*) into n from public.translation_corrections where project_id = p1;
  report := report || E'\ndeleting a project removes its corrections: ' || n || ' (want 0) ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- ---------- report + roll everything back ----------
  raise exception 'TRANSLATION CORRECTIONS REPORT (nothing was saved):%', report;
end
$$;
