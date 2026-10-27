-- =========================================================
-- 20261026000000_pricing_tables.sql
-- DYE CUT LAB — the pricing tables behind the quoting engine
-- =========================================================
--
-- Apply by pasting this file into the Supabase SQL editor (or `supabase db push`).
-- Requires: 20260928120000_accounts_and_roles.sql (is_dcl_team()).
--
-- These tables hold the numbers an estimate is built from. They mirror the
-- pricing template sent to the client (DYECUTLAB-Pricing-Data-Template.xlsx):
--
--   pricing_products        one row per product and style
--   pricing_product_tiers   price per piece at each quantity level of a product
--   pricing_finishes        extra charges for finishes and special features
--   pricing_tooling         one-time tooling costs (dies, plates)
--   pricing_freight         shipping cost by method and destination
--   pricing_margins         DYE CUT LAB margin rules
--   pricing_lead_times      proof and production days per product
--
-- They start EMPTY on purpose. Nothing here is invented, and the website does
-- not show an estimate for a product that has no pricing.
--
-- Who can do what
--   • read, add, change, delete: the DYE CUT LAB team only (is_dcl_team()).
--   • customers and factories: nothing. Costs and margins are private, so there
--     is no policy for them and they cannot even read a row.
--   • the server (service role) reads them to work out an estimate for a customer
--     and returns only the result, never the tables.
--
-- All amounts are US dollars. Margin is stored as a fraction of the selling
-- price (0.35 = 35%).
--
-- What does NOT change: no existing table, policy or function is touched.

-- ---------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------
create table if not exists public.pricing_products (
  id          uuid primary key default gen_random_uuid(),
  product     text not null check (btrim(product) <> ''),
  style       text,
  min_size_mm text,
  max_size_mm text,
  material    text,
  min_order   integer check (min_order is null or min_order > 0),
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One active row per product and style, so the same price list is not entered twice.
create unique index if not exists pricing_products_active_unique
  on public.pricing_products (lower(btrim(product)), lower(btrim(coalesce(style, ''))))
  where active;

create table if not exists public.pricing_product_tiers (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.pricing_products (id) on delete cascade,
  min_quantity    integer not null check (min_quantity > 0),
  price_per_piece numeric(12, 4) not null check (price_per_piece >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (product_id, min_quantity)
);

create table if not exists public.pricing_finishes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  applies_to  text,
  charge_type text not null check (charge_type in ('per_piece', 'per_order')),
  amount      numeric(12, 4) not null check (amount >= 0),
  min_order   integer check (min_order is null or min_order > 0),
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.pricing_tooling (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (btrim(name) <> ''),
  cost            numeric(12, 2) not null check (cost >= 0),
  reusable        boolean not null default true,
  production_days integer check (production_days is null or production_days >= 0),
  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.pricing_freight (
  id           uuid primary key default gen_random_uuid(),
  method       text not null check (method in ('sea', 'air', 'express')),
  origin       text,
  destination  text not null check (btrim(destination) <> ''),
  charged_by   text not null check (charged_by in ('kilogram', 'cubic_metre', 'pallet', 'order')),
  rate         numeric(12, 4) not null check (rate >= 0),
  min_charge   numeric(12, 2) check (min_charge is null or min_charge >= 0),
  transit_days integer check (transit_days is null or transit_days >= 0),
  notes        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.pricing_margins (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (btrim(name) <> ''),
  applies_to   text,
  margin       numeric(5, 4) not null check (margin >= 0 and margin < 0.95),
  min_quantity integer check (min_quantity is null or min_quantity > 0),
  max_quantity integer check (max_quantity is null or max_quantity > 0),
  notes        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (min_quantity is null or max_quantity is null or max_quantity >= min_quantity)
);

create table if not exists public.pricing_lead_times (
  id              uuid primary key default gen_random_uuid(),
  product         text not null check (btrim(product) <> ''),
  proof_days      integer check (proof_days is null or proof_days >= 0),
  production_days integer check (production_days is null or production_days >= 0),
  finish_days     integer check (finish_days is null or finish_days >= 0),
  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.pricing_products is
  'Quoting engine: one row per product and style. Costs are private to the DYE CUT LAB team.';
comment on table public.pricing_product_tiers is
  'Quoting engine: price per piece (USD) from a given order quantity upward. Team only.';
comment on table public.pricing_finishes is
  'Quoting engine: extra charge (USD) for a finish or special feature, per piece or per order. Team only.';
comment on table public.pricing_tooling is
  'Quoting engine: one-time tooling cost (USD). Team only.';
comment on table public.pricing_freight is
  'Quoting engine: shipping rate by method and destination (USD). Team only.';
comment on table public.pricing_margins is
  'Quoting engine: margin as a fraction of the selling price (0.35 = 35%). Team only.';
comment on table public.pricing_lead_times is
  'Quoting engine: proof and production days per product. Team only.';

-- ---------------------------------------------------------
-- 2. Keep updated_at honest
-- ---------------------------------------------------------
create or replace function public.pricing_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------
-- 3. Access: the DYE CUT LAB team only
-- ---------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'pricing_products', 'pricing_product_tiers', 'pricing_finishes',
    'pricing_tooling', 'pricing_freight', 'pricing_margins', 'pricing_lead_times'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);

    execute format('drop policy if exists %I on public.%I', t || '_team_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_dcl_team()) with check (public.is_dcl_team())',
      t || '_team_all', t
    );

    execute format('drop trigger if exists %I on public.%I', t || '_touch_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.pricing_touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end
$$;

-- Check afterwards (read-only). Expect: seven rows, all with RLS on.
--   select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relname like 'pricing\_%' and relkind = 'r' order by relname;
-- Full proof (nothing is saved): paste supabase/tests/pricing_tables_checks.sql.
