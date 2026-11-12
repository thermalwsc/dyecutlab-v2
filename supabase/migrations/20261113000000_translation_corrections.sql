-- =========================================================
-- 20261113000000_translation_corrections.sql
-- DYE CUT LAB — corrections to translations, kept so the translator can improve
-- =========================================================
--
-- Apply by pasting this file into the Supabase SQL editor (or `supabase db push`).
-- Requires: 20261109000000_factory_messages.sql (factory_messages),
--           20260928120000_accounts_and_roles.sql (is_dcl_team(), my_factory_id()).
--
-- Week 7: "Log translation corrections to improve accuracy." When a reader sees that a
-- translation is wrong, they correct it. The corrected words replace the translation they
-- read, and the correction is kept forever: the translation before, the translation after,
-- what kind of mistake it was and a note. That record is what the translator's glossary and
-- instructions are improved from later.
--
-- What it adds
--   • public.translation_corrections: one row per correction. The database fills in the old
--     translation, its language, the project, the factory, who corrected it, which side they
--     are on and when, so none of those can be forged.
--   • factory_messages.corrected_at: set when a message's translation has been corrected.
--     (The database itself replaces the translation when a correction is saved, in the same
--     step, so the two can never disagree.)
--
-- Rules
--   • You correct the translation YOU read: the team corrects what a factory wrote (read in
--     English), a factory corrects what the team wrote (read in Chinese). Nobody corrects the
--     translation of their own message.
--   • Only a finished translation can be corrected, and the correction must change it.
--   • A factory corrects only on its own projects. The team can correct on any project with a
--     factory. Customers and everyone else: nothing.
--   • Nobody can edit or delete a correction.
--
-- What does NOT change: no existing policy or function is touched. The one change to an
-- existing table is the new corrected_at column.

alter table public.factory_messages add column if not exists corrected_at timestamptz;

create table if not exists public.translation_corrections (
  id             uuid primary key default gen_random_uuid(),
  message_id     uuid not null references public.factory_messages (id) on delete cascade,
  project_id     uuid not null references public.projects (id) on delete cascade,
  factory_id     uuid not null references public.factories (id),
  corrector_side text not null check (corrector_side in ('team', 'factory')),
  corrected_by   uuid references auth.users (id) on delete set null,
  lang           text not null check (lang in ('en', 'zh')),
  old_text       text not null check (btrim(old_text) <> ''),
  new_text       text not null check (btrim(new_text) <> '' and char_length(new_text) <= 12000),
  kind           text not null check (kind in ('number', 'term', 'wording', 'missing', 'other')),
  note           text check (note is null or char_length(note) <= 1000),
  created_at     timestamptz not null default now(),
  -- "other" must say what was wrong
  constraint translation_corrections_other_needs_note check (kind <> 'other' or (note is not null and btrim(note) <> ''))
);

create index if not exists translation_corrections_message_idx on public.translation_corrections (message_id, created_at);
create index if not exists translation_corrections_project_idx on public.translation_corrections (project_id, created_at desc);
create index if not exists translation_corrections_kind_idx on public.translation_corrections (kind, created_at desc);

comment on table public.translation_corrections is
  'Each correction to a translated thread message: the translation before, the one after, the kind of mistake and a note. Never edited or deleted. Feeds the translator''s instructions and glossary.';

-- The database fills in everything the corrector must not choose, and replaces the translation.
create or replace function public.translation_corrections_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.factory_messages;
  side text;
begin
  select * into m from public.factory_messages where id = new.message_id;
  if not found then
    raise exception 'That message does not exist.' using errcode = '23514';
  end if;

  side := case when public.is_dcl_team() then 'team' else 'factory' end;
  if side = m.sender_side then
    raise exception 'You cannot correct the translation of your own message.' using errcode = '23514';
  end if;
  if m.translation_status <> 'done' or m.translated_text is null or m.translated_lang is null then
    raise exception 'Only a finished translation can be corrected.' using errcode = '23514';
  end if;
  if btrim(new.new_text) = btrim(m.translated_text) then
    raise exception 'The correction does not change the translation.' using errcode = '23514';
  end if;

  new.project_id := m.project_id;
  new.factory_id := m.factory_id;
  new.corrector_side := side;
  new.corrected_by := auth.uid();
  new.lang := m.translated_lang;
  new.old_text := m.translated_text;
  new.new_text := btrim(new.new_text);
  new.created_at := now();

  -- the corrected words are what everyone reads from now on, and any earlier warning is cleared
  -- (the app checks the numbers again and puts a warning back if the correction broke one)
  update public.factory_messages
     set translated_text = new.new_text,
         translation_note = null,
         corrected_at = now()
   where id = m.id;

  return new;
end;
$$;

drop trigger if exists translation_corrections_prepare on public.translation_corrections;
create trigger translation_corrections_prepare
  before insert on public.translation_corrections
  for each row execute function public.translation_corrections_prepare();

-- ---------------------------------------------------------
-- Access
-- ---------------------------------------------------------
alter table public.translation_corrections enable row level security;

revoke all on table public.translation_corrections from anon, authenticated;
grant select on table public.translation_corrections to authenticated;
-- Only what the corrector may type. No update, no delete, for anyone.
grant insert (message_id, new_text, kind, note) on table public.translation_corrections to authenticated;

drop policy if exists translation_corrections_team_select on public.translation_corrections;
create policy translation_corrections_team_select on public.translation_corrections for select to authenticated
  using (public.is_dcl_team());

drop policy if exists translation_corrections_factory_select on public.translation_corrections;
create policy translation_corrections_factory_select on public.translation_corrections for select to authenticated
  using (factory_id = (select public.my_factory_id()));

-- A factory may correct only a message on its own factory's thread; the team any message.
-- (The trigger above has already filled in the factory from the message.)
drop policy if exists translation_corrections_insert on public.translation_corrections;
create policy translation_corrections_insert on public.translation_corrections for insert to authenticated
  with check (
    public.is_dcl_team()
    or factory_id = (select public.my_factory_id())
  );

-- Check afterwards (read-only). Expect: RLS on.
--   select relname, relrowsecurity from pg_class where oid = 'public.translation_corrections'::regclass;
-- Full proof (nothing is saved): paste supabase/tests/translation_corrections_checks.sql.
