import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPaymentContext } from "./paymentContext";
import { isPaymentKind, paymentDatabaseMessage, type PaymentKind } from "./payments";
import { createPaymentLink } from "./squareClient";
import { idempotencyKeyFor, redirectUrlFor } from "./squarePayments";
import { getServiceRoleSupabase, isServiceRoleConfigured } from "./supabase/admin";

/* =========================================================
   Starting a payment: the customer asks, the server decides
============================================================
   The customer's browser says only WHICH payment (deposit or balance). The amount, the quote and whether
   it is due all come from the database, read with the customer's own session. The payment row is created
   with the server's key, and the database re-checks the amount and the quote, so a forged request can
   never ask Square for a different sum.

   Order of events, so a failure never leaves a charge half-made:
     1. reserve the payment (one live deposit and one live balance per project, enforced by the database)
     2. ask Square for the checkout link, with the payment's own id as the idempotency key
     3. attach Square's order id and the link to the payment
   If step 2 or 3 fails, the payment is marked failed, which frees the slot for another try. */

export type StartResult =
  | { ok: true; url: string; resumed: boolean }
  | { ok: false; status: number; message: string };

const WHY: Record<string, string> = {
  no_quote: "There is no quote to pay yet.",
  not_yet: "Nothing is due right now.",
  all_paid: "This project is fully paid. Thank you!",
};

export async function startPayment(opts: {
  supabase: SupabaseClient;
  userId: string;
  userEmail: string | null;
  projectNumber: string;
  kind: unknown;
  siteUrl: string;
}): Promise<StartResult> {
  if (!isServiceRoleConfigured()) return { ok: false, status: 503, message: "Payments are not set up yet. Please tell DYE CUT LAB." };

  const context = await loadPaymentContext(opts.supabase, opts.projectNumber);
  if (!context) return { ok: false, status: 404, message: "We could not find that project." };
  if (context.project.owner_id !== opts.userId) return { ok: false, status: 403, message: "Only the owner of the project can pay for it." };
  if (!context.quote || context.totalCents === null) return { ok: false, status: 409, message: WHY.no_quote };

  const next = context.next;
  if (next.due === null) return { ok: false, status: 409, message: WHY[next.why] };

  /* the customer may name the payment, but it must be the one that is due */
  if (opts.kind !== undefined && opts.kind !== null && (!isPaymentKind(opts.kind) || opts.kind !== next.due)) {
    return { ok: false, status: 409, message: "That payment is not due right now." };
  }
  const kind: PaymentKind = next.due;

  const service = getServiceRoleSupabase();

  /* a link that was already made and is still waiting: go back to it, never create a second charge */
  let payment = context.payments.find((p) => p.kind === kind && p.status === "pending") ?? null;
  if (payment?.checkout_url) return { ok: true, url: payment.checkout_url, resumed: true };

  if (!payment) {
    const { data, error } = await service
      .from("payments")
      .insert({
        project_id: context.project.id,
        quote_version_id: context.quote.id,
        kind,
        amount_cents: next.amountCents,
        created_by: opts.userId,
      })
      .select("id, kind, status, amount_cents, receipt_url, checkout_url, paid_at, created_at")
      .single();

    if (error || !data) {
      console.error("PAYMENT RESERVE ERROR:", error?.code, error?.message);
      if (error?.code === "23505") {
        /* a second click arrived first: use the payment it made */
        const again = await loadPaymentContext(opts.supabase, opts.projectNumber);
        const waiting = again?.payments.find((p) => p.kind === kind && p.status === "pending");
        if (waiting?.checkout_url) return { ok: true, url: waiting.checkout_url, resumed: true };
      }
      return { ok: false, status: 409, message: paymentDatabaseMessage(error) };
    }
    payment = data;
  }

  const link = await createPaymentLink({
    idempotencyKey: idempotencyKeyFor(payment.id),
    amountCents: payment.amount_cents,
    kind,
    projectNumber: context.project.project_number,
    redirectUrl: redirectUrlFor(opts.siteUrl, context.project.project_number, kind),
    buyerEmail: opts.userEmail,
  });

  if (!link.ok) {
    await service.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return { ok: false, status: 502, message: link.message };
  }

  const { error: attachError } = await service
    .from("payments")
    .update({ provider_order_id: link.link.orderId, checkout_url: link.link.url })
    .eq("id", payment.id);
  if (attachError) {
    console.error("PAYMENT ATTACH ERROR:", attachError.code, attachError.message);
    await service.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return { ok: false, status: 500, message: "The payment could not be started. Please try again." };
  }

  /* asking for the deposit puts the project in the Payment stage */
  if (kind === "deposit" && context.project.status === "approved") {
    const { error: stageError } = await service.from("projects").update({ status: "payment" }).eq("id", context.project.id).eq("status", "approved");
    if (stageError) console.error("PAYMENT STAGE ERROR:", stageError.code, stageError.message);
  }

  return { ok: true, url: link.link.url, resumed: false };
}
