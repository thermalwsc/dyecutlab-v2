-- =========================================================
-- promote-admin.sql
-- DYE CUT LAB — give someone DCL admin access from the SQL editor
-- =========================================================
-- Needed only to bootstrap: /admin/accounts can promote anyone afterwards,
-- but the first admin has to already exist.
-- Run supabase/migrations/20260928120000_accounts_and_roles.sql FIRST.
--
-- 1. The person signs up normally at /signin (email + password, or Google).
--    That creates their auth.users row, and the trigger their profiles row.
-- 2. Then run the statement below, changing the email.

update public.profiles
   set role = 'dcl_admin'
 where lower(email) = 'you@dyecutlab.com';

-- Sanity check: this should list the roles of every account.
select id, email, full_name, role, factory_id, disabled_at, created_at
  from public.profiles
 order by created_at desc;

-- Other useful one-liners -----------------------------------------------
--
-- DCL staff (no account management):
--   update public.profiles set role = 'dcl_staff'
--    where lower(email) = 'teammate@dyecutlab.com';
--
-- A factory user must point at a factory row (create it first here, or add it
-- on /admin/accounts):
--   insert into public.factories (name, contact_name, contact_email)
--        values ('Guangzhou Print Co.', 'Wei', 'wei@example.com')
--     returning id;
--
--   update public.profiles
--      set role = 'factory', factory_id = '<that id>'
--    where lower(email) = 'wei@example.com';
--
-- Switch an account off (the app then signs it out and refuses sign-in):
--   update public.profiles set disabled_at = now()
--    where lower(email) = 'someone@example.com';
--
--   update public.profiles set disabled_at = null
--    where lower(email) = 'someone@example.com';
--
-- Back to a normal customer:
--   update public.profiles
--      set role = 'customer', factory_id = null
--    where lower(email) = 'someone@example.com';
--
-- Note: switching an account off from SQL does NOT ban it in Supabase Auth.
-- Deactivating from /admin/accounts does both. See AUTH_SETUP.md §3.
