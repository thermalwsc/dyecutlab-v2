import { NextRequest, NextResponse } from "next/server";
import { notifyPaymentPaid } from "../../../../lib/paymentAlerts";
import { handleSquareNotification, type AppliedResult } from "../../../../lib/squareNotify";
import { getServiceRoleSupabase, isServiceRoleConfigured } from "../../../../lib/supabase/admin";

/*
|--------------------------------------------------------------------------
| SQUARE'S NOTIFICATION ADDRESS
|--------------------------------------------------------------------------
|
| POST /api/square/webhook
|
| Square calls this when a payment changes. Anyone on the internet can call it,
| so nothing is done until the signature proves the call came from Square
| (lib/squareNotify.ts decides, lib/squareWebhook.ts checks). The payment is
| then applied by ONE database function (record_payment_event), which ignores
| repeats, checks the amount, marks the payment paid, failed or cancelled and,
| for a paid deposit, moves the project to Proof.
|
| The signature is made over the exact body, so the body is read as text and
| never re-encoded. Nothing secret is ever logged.
|
*/

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const answer = await handleSquareNotification({
    rawBody,
    signatureHeader: request.headers.get("x-square-hmacsha256-signature"),
    signatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim(),
    notificationUrl: process.env.SQUARE_WEBHOOK_URL?.trim(),
    apply: async (n) => {
      if (!isServiceRoleConfigured()) throw new Error("The server key is not configured.");
      const { data, error } = await getServiceRoleSupabase().rpc("record_payment_event", {
        p_event_id: n.eventId,
        p_event_type: n.type,
        p_order_id: n.orderId,
        p_payment_id: n.paymentId,
        p_status: n.status,
        p_amount_cents: n.amountCents,
        p_receipt_url: n.receiptUrl,
      });
      if (error) {
        console.error("SQUARE NOTIFICATION ERROR:", error.code, error.message);
        throw new Error("The payment could not be recorded.");
      }
      const applied = data as AppliedResult;
      if (applied.result === "amount_mismatch" || applied.result === "unknown_order") {
        console.error("SQUARE NOTIFICATION NOT APPLIED:", applied.result, applied.payment_id ?? "");
      }
      return applied;
    },
  });

  /* receipts and the team alert go out once, when this call is the one that marked it paid */
  if (answer.paid) await notifyPaymentPaid(answer.paid);

  return NextResponse.json(answer.body, { status: answer.status });
}
