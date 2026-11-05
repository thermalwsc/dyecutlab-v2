-- =========================================================
-- 20261104000000_quote_version_kind.sql
-- DYE CUT LAB — tell an estimate from a verified quote, and trace a verified quote to its factory quote
-- =========================================================
--
-- Apply by pasting this file into the Supabase SQL editor (or `supabase db push`).
-- Requires: 20261028000000_quote_versions.sql, 20261102000000_factory_quotes.sql.
--
-- Until now every quote version was an instant estimate. A factory's quote, once the
-- DYE CUT LAB team approves it, becomes a VERIFIED quote: a version of the same project
-- with the customer's price (the factory's price plus our margin) and the factory's lead
-- time. The two must never be mistaken for each other, so each version says which it is.
--
-- What it adds
--   • quote_versions.kind: 'estimate' (the default, so every existing version stays an
--     estimate) or 'verified'. It is part of the customer-safe half, because the customer
--     card and the PDF word an estimate and a verified quote differently.
--   • quote_version_details.factory_quote_id: which factory quote a verified quote came
--     from. Private (team only), like the rest of the details. If the factory quote were
--     ever removed with its project, the link simply becomes empty.
--   • save_quote_version(...) gets two more arguments with defaults (p_kind, p_factory_quote),
--     so every existing call keeps working unchanged and saves an estimate.
--
-- Who can do what: unchanged. The team saves versions and chooses when a customer sees one;
-- a customer reads only versions shown to them, on their own project; factories read nothing
-- of this; nobody edits or deletes a saved version.
--
-- What does NOT change: no existing row, policy or grant is touched.

alter table public.quote_versions
  add column if not exists kind text not null default 'estimate'
  check (kind in ('estimate', 'verified'));

comment on column public.quote_versions.kind is
  'estimate = the instant estimate from the pricing tables; verified = built from a factory quote the team approved.';

alter table public.quote_version_details
  add column if not exists factory_quote_id uuid references public.factory_quotes (id) on delete set null;

comment on column public.quote_version_details.factory_quote_id is
  'For a verified quote: the approved factory quote it was built from. Team only.';

-- A factory quote can be behind at most one verified version, so a retry can never create a second one.
create unique index if not exists quote_version_details_one_per_factory_quote
  on public.quote_version_details (factory_quote_id) where factory_quote_id is not null;

-- ---------------------------------------------------------
-- The one way to save a version, now with a kind. The old 13-argument form is replaced
-- by this one; calls that pass 13 arguments still work because the new ones have defaults.
-- ---------------------------------------------------------
drop function if exists public.save_quote_version(uuid, integer, numeric, numeric, integer, text[], text[], text, jsonb, jsonb, numeric, numeric, text);

create or replace function public.save_quote_version(
  p_project        uuid,
  p_quantity       integer,
  p_sell_total     numeric,
  p_sell_per_piece numeric,
  p_lead_days      integer,
  p_includes       text[],
  p_excludes       text[],
  p_notice         text,
  p_inputs         jsonb,
  p_lines          jsonb,
  p_cost           numeric,
  p_margin         numeric,
  p_margin_rule    text,
  p_kind           text default 'estimate',
  p_factory_quote  uuid default null
)
returns public.quote_versions
language plpgsql
set search_path = ''
as $$
declare
  v_version integer;
  v_row     public.quote_versions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_project::text, 0));

  select coalesce(max(version), 0) + 1 into v_version
  from public.quote_versions where project_id = p_project;

  insert into public.quote_versions
    (project_id, version, kind, quantity, sell_total, sell_per_piece, lead_days, includes, excludes, notice)
  values
    (p_project, v_version, coalesce(p_kind, 'estimate'), p_quantity, p_sell_total, p_sell_per_piece, p_lead_days,
     coalesce(p_includes, '{}'), coalesce(p_excludes, '{}'), p_notice)
  returning * into v_row;

  insert into public.quote_version_details
    (version_id, created_by, inputs, lines, cost, margin, margin_rule, factory_quote_id)
  values
    (v_row.id, (select auth.uid()), p_inputs, p_lines, p_cost, p_margin, p_margin_rule, p_factory_quote);

  return v_row;
end;
$$;

revoke all on function public.save_quote_version(uuid, integer, numeric, numeric, integer, text[], text[], text, jsonb, jsonb, numeric, numeric, text, text, uuid)
  from public, anon;
grant execute on function public.save_quote_version(uuid, integer, numeric, numeric, integer, text[], text[], text, jsonb, jsonb, numeric, numeric, text, text, uuid)
  to authenticated, service_role;

-- Check afterwards (read-only). Expect: kind on quote_versions, factory_quote_id on the details.
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name in ('quote_versions', 'quote_version_details')
--     and column_name in ('kind', 'factory_quote_id') order by column_name;
-- Full proof (nothing is saved): paste supabase/tests/quote_version_kind_checks.sql.
