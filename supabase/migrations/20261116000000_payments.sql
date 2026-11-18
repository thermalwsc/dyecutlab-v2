-- =========================================================
-- 20261116000000_payments.sql
-- DYE CUT LAB — the customer's payments (a 50% deposit, then the 50% balance), paid through Square
-- =========================================================
--
-- Apply by pasting this file into the Supabase SQL editor (or `supabase db push`).
-- Requires: 20260928120000_accounts_and_roles.sql (is_dcl_team()),
--           20260929000000_lock_project_tables.sql (projects, owner_id, status),
--           20261028000000_quote_versions.sql and 20261104000000_quote_version_kind.sql (verified quotes).
--
-- Week 8. The client's terms: 50% before production, the other 50% before shipping. Both are worked
-- out from the verified quote the customer was shown, and the two always add up to the quote total
-- to the cent (the deposit is half rounded up, the balance is the rest).
--
-- What it adds
--   • public.payments: one row per payment. The amount, the kind (deposit or balance) and the quote it
--     belongs to are checked HERE, not trusted from the app, and can never change afterwards.
--   • public.payment_events: the id of every notification Square has sent us, so a repeated or late
--     notification can never be applied twice.
--   • public.record_payment_event(...): the one way a Square notification is applied. In a single step
--     it ignores repeats, finds the payment, checks the amount Square says was paid, marks the payment
--     paid, failed or cancelled, and, when a deposit is paid, moves the project to Proof.
--
-- Who can do what
--   • the customer who owns the project: reads its payments. Nothing else.
--   • the DYE CUT LAB team: reads every payment.
--   • factories and everyone else: nothing.
--   • nobody can insert, edit or delete a payment through the website or API. Only the server, with
--     its own key, creates a payment and applies Square's notification. Even then the rules below
--     apply, because they are triggers on the table.
--
-- All amounts are in US cents (whole numbers), so there is never a rounding error.
--
-- What does NOT change: no existing table, policy or function is touched, except that a paid deposit
-- moves its project from Approved or Payment to Proof, the step the plan describes.

-- ---------------------------------------------------------
-- 1. The payments
-- ---------------------------------------------------------
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects (id) on delete cascade,
  quote_version_id    uuid not null references public.quote_versions (id),
  kind                text not null check (kind in ('deposit', 'balance')),
  amount_cents        integer not null check (amount_cents > 0),
  currency            text not null default 'USD' check (currency = 'USD'),
  status              text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled', 'refunded')),
  provider            text not null default 'square' check (provider = 'square'),
  provider_order_id   text,
  provider_payment_id text,
  checkout_url        text,
  receipt_url         text,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  paid_at             timestamptz
);

-- A project has at most one live (waiting or paid) deposit and one live balance, so a double click or a
-- retry can never charge twice. A failed or cancelled payment frees the slot.
create unique index if not exists payments_one_live_per_kind on public.payments (project_id, kind) where status in ('pending', 'paid');
create unique index if not exists payments_provider_order_key on public.payments (provider_order_id) where provider_order_id is not null;
create unique index if not exists payments_provider_payment_key on public.payments (provider_payment_id) where provider_payment_id is not null;
create index if not exists payments_project_idx on public.payments (project_id, created_at);

comment on table public.payments is
  'A customer payment for a project: the 50% deposit or the 50% balance of the verified quote, paid through Square. Amounts in US cents. Created and updated only by the server.';

-- ---------------------------------------------------------
-- 2. The rules a new payment must follow
-- ---------------------------------------------------------
create or replace function public.payments_check_new()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  q           public.quote_versions;
  total_cents integer;
  deposit     integer;
  dep         public.payments;
begin
  select * into q from public.quote_versions where id = new.quote_version_id and project_id = new.project_id;
  if not found then
    raise exception 'That quote does not belong to this project.' using errcode = '23514';
  end if;
  if q.kind <> 'verified' or not q.shown_to_customer then
    raise exception 'Only a verified quote that has been shown to the customer can be paid.' using errcode = '23514';
  end if;

  total_cents := round(q.sell_total * 100)::integer;
  deposit := (total_cents + 1) / 2;  -- half, rounded up; the balance is the rest

  if new.kind = 'deposit' then
    if new.amount_cents <> deposit then
      raise exception 'The deposit must be exactly half of the quote.' using errcode = '23514';
    end if;
  else
    if new.amount_cents <> total_cents - deposit then
      raise exception 'The balance must be exactly the other half of the quote.' using errcode = '23514';
    end if;
    select * into dep from public.payments
     where project_id = new.project_id and kind = 'deposit' and status = 'paid';
    if not found or dep.quote_version_id <> new.quote_version_id then
      raise exception 'The balance can only be paid after the deposit for the same quote.' using errcode = '23514';
    end if;
  end if;

  -- a new payment always starts waiting, with nothing from Square yet
  new.status := 'pending';
  new.provider_payment_id := null;
  new.receipt_url := null;
  new.paid_at := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists payments_check_new on public.payments;
create trigger payments_check_new
  before insert on public.payments
  for each row execute function public.payments_check_new();

-- ---------------------------------------------------------
-- 3. What may change afterwards
-- ---------------------------------------------------------
create or replace function public.payments_check_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id
     or new.quote_version_id is distinct from old.quote_version_id
     or new.kind is distinct from old.kind
     or new.amount_cents is distinct from old.amount_cents
     or new.currency is distinct from old.currency
     or new.provider is distinct from old.provider
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'What a payment is for, and its amount, cannot be changed.' using errcode = '23514';
  end if;

  -- Square's order id is attached once, right after the checkout link is made
  if old.provider_order_id is not null and new.provider_order_id is distinct from old.provider_order_id then
    raise exception 'The payment already has its Square order.' using errcode = '23514';
  end if;

  if new.status <> old.status then
    if not (
      (old.status = 'pending' and new.status in ('paid', 'failed', 'canceled'))
      or (old.status = 'paid' and new.status = 'refunded')
    ) then
      raise exception 'This payment can no longer change from % to %.', old.status, new.status using errcode = '23514';
    end if;
    if new.status = 'paid' then
      new.paid_at := coalesce(new.paid_at, now());
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists payments_check_change on public.payments;
create trigger payments_check_change
  before update on public.payments
  for each row execute function public.payments_check_change();

-- ---------------------------------------------------------
-- 4. Notifications already received
-- ---------------------------------------------------------
create table if not exists public.payment_events (
  event_id    text primary key,
  event_type  text,
  received_at timestamptz not null default now()
);

comment on table public.payment_events is
  'The id of every Square notification already applied, so a repeated notification does nothing. Server only.';

-- ---------------------------------------------------------
-- 5. Applying a notification from Square, in one step
-- ---------------------------------------------------------
create or replace function public.record_payment_event(
  p_event_id     text,
  p_event_type   text,
  p_order_id     text,
  p_payment_id   text,
  p_status       text,
  p_amount_cents integer,
  p_receipt_url  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay        public.payments;
  new_status text;
  moved      boolean := false;
begin
  if p_event_id is null or btrim(p_event_id) = '' then
    raise exception 'A notification needs an event id.' using errcode = '23514';
  end if;

  insert into public.payment_events (event_id, event_type) values (p_event_id, p_event_type)
  on conflict (event_id) do nothing;
  if not found then
    return jsonb_build_object('result', 'duplicate');
  end if;

  select * into pay from public.payments where provider_order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('result', 'unknown_order');
  end if;

  -- trust Square's amount only if it is the amount we asked for
  if p_amount_cents is distinct from pay.amount_cents then
    return jsonb_build_object('result', 'amount_mismatch', 'payment_id', pay.id);
  end if;

  new_status := case upper(coalesce(p_status, ''))
    when 'COMPLETED' then 'paid'
    when 'CANCELED' then 'canceled'
    when 'FAILED' then 'failed'
    else null
  end;
  if new_status is null then
    return jsonb_build_object('result', 'ignored', 'payment_id', pay.id);
  end if;

  if pay.status <> 'pending' then
    return jsonb_build_object('result', 'already_' || pay.status, 'payment_id', pay.id);
  end if;

  update public.payments
     set status = new_status,
         provider_payment_id = coalesce(p_payment_id, provider_payment_id),
         receipt_url = coalesce(p_receipt_url, receipt_url)
   where id = pay.id;

  if new_status = 'paid' and pay.kind = 'deposit' then
    update public.projects set status = 'proof' where id = pay.project_id and status in ('approved', 'payment');
    moved := found;
  end if;

  return jsonb_build_object('result', new_status, 'payment_id', pay.id, 'project_id', pay.project_id, 'kind', pay.kind, 'moved', moved);
end;
$$;

revoke all on function public.record_payment_event(text, text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.record_payment_event(text, text, text, text, text, integer, text) to service_role;

-- ---------------------------------------------------------
-- 6. Access
-- ---------------------------------------------------------
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

revoke all on table public.payments from anon, authenticated;
revoke all on table public.payment_events from anon, authenticated;
-- Read only. Creating and updating a payment is the server's job (its own key bypasses these rules,
-- but not the triggers above).
grant select on table public.payments to authenticated;

drop policy if exists payments_team_select on public.payments;
create policy payments_team_select on public.payments for select to authenticated
  using (public.is_dcl_team());

drop policy if exists payments_owner_select on public.payments;
create policy payments_owner_select on public.payments for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = payments.project_id and p.owner_id = (select auth.uid())
    )
  );

-- Check afterwards (read-only). Expect: RLS on for both.
--   select relname, relrowsecurity from pg_class where oid in ('public.payments'::regclass, 'public.payment_events'::regclass);
-- Full proof (nothing is saved): paste supabase/tests/payments_checks.sql.
