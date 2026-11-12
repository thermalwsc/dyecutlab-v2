-- =========================================================
-- 20261109000000_factory_messages.sql
-- DYE CUT LAB — the team and factory thread on a project, with its translation
-- =========================================================
--
-- Apply by pasting this file into the Supabase SQL editor (or `supabase db push`).
-- Requires: 20260928120000_accounts_and_roles.sql (is_dcl_team(), my_factory_id(), factories),
--           20260929000000_lock_project_tables.sql (projects, projects.factory_id).
--
-- Week 7 (bilingual layer). The existing chat (project_messages) is between the customer and
-- DICI, and factories cannot read it. This is a separate, private thread between the DYE CUT LAB
-- team and the project's factory, so the team writes in English, the factory reads Chinese, and
-- the other way round.
--
-- What it adds
--   • public.factory_messages: what the sender typed (the ORIGINAL, never changed) and its
--     translation. The database fills in the factory (from the project), which side wrote it
--     (team or factory), who wrote it and when.
--   • The translation is saved afterwards by the server. It can be pending, done, failed or
--     skipped (nothing to translate, like a message that is only numbers). A translation can be
--     replaced when it is corrected; the original can never be.
--
-- Who can do what
--   • a factory: reads and writes ONLY on projects assigned to its own factory.
--   • the DYE CUT LAB team: reads everything, writes on any project that has a factory.
--   • customers and everyone else: nothing.
--   • nobody can edit an original or delete a message from the app. (Only the server, with its
--     own key, saves translations.)
--
-- What does NOT change: no existing table, policy or function is touched.

create table if not exists public.factory_messages (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  factory_id       uuid not null references public.factories (id),
  sender_side      text not null check (sender_side in ('team', 'factory')),
  sender_id        uuid references auth.users (id) on delete set null,
  original_text    text not null check (btrim(original_text) <> '' and char_length(original_text) <= 4000),
  original_lang    text not null check (original_lang in ('en', 'zh')),
  translated_text  text check (translated_text is null or (btrim(translated_text) <> '' and char_length(translated_text) <= 12000)),
  translated_lang  text check (translated_lang is null or translated_lang in ('en', 'zh')),
  translation_status text not null default 'pending' check (translation_status in ('pending', 'done', 'failed', 'skipped')),
  translation_note text check (translation_note is null or char_length(translation_note) <= 1000),
  translated_at    timestamptz,
  created_at       timestamptz not null default now(),
  -- a finished translation has its text, and is never in the same language as the original
  constraint factory_messages_translation_complete check (
    translation_status <> 'done' or (translated_text is not null and translated_lang is not null and translated_lang <> original_lang)
  )
);

create index if not exists factory_messages_project_idx on public.factory_messages (project_id, created_at);
create index if not exists factory_messages_factory_idx on public.factory_messages (factory_id, created_at desc);

comment on table public.factory_messages is
  'Private thread between the DYE CUT LAB team and a project''s factory, each message with its original and its translation. The original is never changed.';

-- The database fills in everything the writer must not choose.
create or replace function public.factory_messages_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_factory uuid;
begin
  select p.factory_id into v_factory from public.projects p where p.id = new.project_id;
  if v_factory is null then
    raise exception 'This project has no factory assigned, so it has no factory thread.'
      using errcode = '23514';
  end if;

  new.factory_id := v_factory;
  new.sender_side := case when public.is_dcl_team() then 'team' else 'factory' end;
  new.sender_id := auth.uid();
  new.created_at := now();
  -- a new message always starts untranslated; the server saves the translation afterwards
  new.translated_text := null;
  new.translated_lang := null;
  new.translation_status := 'pending';
  new.translation_note := null;
  new.translated_at := null;
  return new;
end;
$$;

drop trigger if exists factory_messages_prepare on public.factory_messages;
create trigger factory_messages_prepare
  before insert on public.factory_messages
  for each row execute function public.factory_messages_prepare();

-- Only the translation columns can ever change. Everything the sender wrote stays as written,
-- whoever tries (this runs for the server's own key too).
create or replace function public.factory_messages_keep_original()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id
     or new.factory_id is distinct from old.factory_id
     or new.sender_side is distinct from old.sender_side
     or new.sender_id is distinct from old.sender_id
     or new.original_text is distinct from old.original_text
     or new.original_lang is distinct from old.original_lang
     or new.created_at is distinct from old.created_at then
    raise exception 'The original message cannot be changed.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists factory_messages_keep_original on public.factory_messages;
create trigger factory_messages_keep_original
  before update on public.factory_messages
  for each row execute function public.factory_messages_keep_original();

-- ---------------------------------------------------------
-- Access
-- ---------------------------------------------------------
alter table public.factory_messages enable row level security;

revoke all on table public.factory_messages from anon, authenticated;
grant select on table public.factory_messages to authenticated;
-- Only what the writer may type. No update, no delete, for anyone in the app.
grant insert (project_id, original_text, original_lang) on table public.factory_messages to authenticated;

drop policy if exists factory_messages_team_select on public.factory_messages;
create policy factory_messages_team_select on public.factory_messages for select to authenticated
  using (public.is_dcl_team());

drop policy if exists factory_messages_factory_select on public.factory_messages;
create policy factory_messages_factory_select on public.factory_messages for select to authenticated
  using (factory_id = (select public.my_factory_id()));

drop policy if exists factory_messages_insert on public.factory_messages;
create policy factory_messages_insert on public.factory_messages for insert to authenticated
  with check (
    public.is_dcl_team()
    or exists (
      select 1 from public.projects p
      where p.id = factory_messages.project_id and p.factory_id = (select public.my_factory_id())
    )
  );

-- Check afterwards (read-only). Expect: RLS on.
--   select relname, relrowsecurity from pg_class where oid = 'public.factory_messages'::regclass;
-- Full proof (nothing is saved): paste supabase/tests/factory_messages_checks.sql.
