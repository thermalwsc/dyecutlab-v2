/* =========================================================
   DYE CUT LAB — payments: the 50% deposit and the 50% balance, in whole cents
============================================================
   The client's terms: half before production, the other half before shipping. The table is
   supabase/migrations/20261116000000_payments.sql and the database re-checks every amount, so these
   functions only decide what to ASK for and what to show. Pure functions, no server-only imports,
   covered by tests/payments.test.ts.

   Every amount here is a whole number of US cents. Dollars appear only when a person reads them. */

export const PAYMENT_KINDS = ["deposit", "balance"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_STATUSES = ["pending", "paid", "failed", "canceled", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function isPaymentKind(value: unknown): value is PaymentKind {
  return typeof value === "string" && (PAYMENT_KINDS as readonly string[]).includes(value);
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && (PAYMENT_STATUSES as readonly string[]).includes(value);
}

/* A quote total in dollars (12345.67 or "12345.67") as whole cents, or null when it is not a usable
   amount. Rounds to the nearest cent, so 123.45 * 100 = 12345.000000000002 still gives 12345. */
export function toCents(dollars: number | string | null | undefined): number | null {
  const n = typeof dollars === "string" ? Number(dollars.trim()) : dollars;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  /* toPrecision(15) first, so 1.005 * 100 = 100.49999999999999 is read as 100.5 and rounds to 101 */
  const cents = Math.round(Number((n * 100).toPrecision(15)));
  return Number.isSafeInteger(cents) && cents > 0 && cents < 2_000_000_000 ? cents : null;
}

/* Half, rounded UP, and the balance is the rest, so the two always add up to the total exactly. The
   database computes the same ((total + 1) / 2 in whole numbers). */
export function splitCents(totalCents: number): { deposit: number; balance: number } {
  const deposit = Math.floor((totalCents + 1) / 2);
  return { deposit, balance: totalCents - deposit };
}

export function amountFor(kind: PaymentKind, totalCents: number): number {
  const { deposit, balance } = splitCents(totalCents);
  return kind === "deposit" ? deposit : balance;
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export const KIND_LABELS: Record<PaymentKind, string> = {
  deposit: "Deposit (50%)",
  balance: "Balance (50%)",
};

export const STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Waiting for payment",
  paid: "Paid",
  failed: "Did not go through",
  canceled: "Cancelled",
  refunded: "Refunded",
};

export function kindLabel(kind: string | null | undefined): string {
  return isPaymentKind(kind) ? KIND_LABELS[kind] : String(kind ?? "");
}

export function paymentStatusLabel(status: string | null | undefined): string {
  return isPaymentStatus(status) ? STATUS_LABELS[status] : String(status ?? "");
}

/* ---------------------------------------------------------------------------
   What is due, and when
   --------------------------------------------------------------------------- */

/* The deposit is asked for once the quote is approved. The balance is asked for while the order is
   being made and checked, and must be paid before it ships. */
export const DEPOSIT_OPEN_STATUSES = ["approved", "payment"] as const;
export const BALANCE_OPEN_STATUSES = ["production", "qc"] as const;

export type PaymentRow = { kind: string; status: string; amount_cents: number };

const live = (payments: PaymentRow[], kind: PaymentKind) =>
  payments.find((p) => p.kind === kind && (p.status === "pending" || p.status === "paid")) ?? null;

export type NextPayment =
  | { due: PaymentKind; amountCents: number; resume: boolean }
  | { due: null; why: "no_quote" | "not_yet" | "all_paid" };

/* What the customer should be asked to pay now, given the project's stage and what exists already.
   `resume` is true when a link for it was already made and is still waiting (the customer returns to it
   instead of a second charge being created). */
export function nextPayment(projectStatus: string | null | undefined, totalCents: number | null, payments: PaymentRow[]): NextPayment {
  if (totalCents === null) return { due: null, why: "no_quote" };
  const stage = (projectStatus || "").toLowerCase();
  const deposit = live(payments, "deposit");
  const balance = live(payments, "balance");

  if (!deposit || deposit.status === "pending") {
    if (!(DEPOSIT_OPEN_STATUSES as readonly string[]).includes(stage)) return { due: null, why: "not_yet" };
    return { due: "deposit", amountCents: amountFor("deposit", totalCents), resume: Boolean(deposit) };
  }
  if (balance?.status === "paid") return { due: null, why: "all_paid" };
  if (!(BALANCE_OPEN_STATUSES as readonly string[]).includes(stage)) return { due: null, why: "not_yet" };
  return { due: "balance", amountCents: amountFor("balance", totalCents), resume: Boolean(balance) };
}

/* A project may be marked shipped only when the balance is paid. */
export function balancePaid(payments: PaymentRow[]): boolean {
  return payments.some((p) => p.kind === "balance" && p.status === "paid");
}

export function depositPaid(payments: PaymentRow[]): boolean {
  return payments.some((p) => p.kind === "deposit" && p.status === "paid");
}

/* A database refusal turned into one plain sentence, never the database's own words. */
export function paymentDatabaseMessage(error: { code?: string } | null | undefined): string {
  switch (error?.code) {
    case "23505":
      return "A payment for this is already waiting or paid.";
    case "23514":
      return "That payment was refused. Check the quote and try again.";
    default:
      return "The payment could not be started. Please try again.";
  }
}
