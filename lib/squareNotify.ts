/* =========================================================
   DYE CUT LAB — what the Square notification address does with a call
============================================================
   Pure and covered by tests/squareNotify.test.ts: the decision, kept apart from the web route and the
   database so each answer can be tested.

   The answers matter, because Square retries any call that is not answered with 200:
     • no key or address set on this server  → 503 (we are not ready; nothing is trusted)
     • signature does not match              → 403 (not from Square; never retried usefully)
     • signed, but not a payment we care for → 200 (nothing to do; do not make Square retry)
     • signed payment, the database answered → 200
     • signed payment, the database failed   → 500 (Square tries again later, and a repeat is safe)

   Anything is applied only AFTER the signature is proven. */

import { parsePaymentNotification, verifySquareSignature, type PaymentNotification } from "./squareWebhook.ts";

export type AppliedResult = {
  result: string;
  payment_id?: string;
  project_id?: string;
  kind?: string;
  moved?: boolean;
};

export type NotifyAnswer = {
  status: 200 | 403 | 500 | 503;
  body: { ok: boolean; result?: string };
  /* set only when this call newly marked a payment paid, so the emails go out once */
  paid?: { paymentId: string; movedToProof: boolean };
};

export async function handleSquareNotification(input: {
  rawBody: string;
  signatureHeader: string | null | undefined;
  signatureKey: string | null | undefined;
  notificationUrl: string | null | undefined;
  apply: (notification: PaymentNotification) => Promise<AppliedResult>;
}): Promise<NotifyAnswer> {
  const { rawBody, signatureHeader, signatureKey, notificationUrl } = input;

  if (!signatureKey || !notificationUrl) return { status: 503, body: { ok: false, result: "not_configured" } };
  if (!verifySquareSignature({ signatureKey, notificationUrl, rawBody, signatureHeader })) {
    return { status: 403, body: { ok: false, result: "bad_signature" } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 200, body: { ok: true, result: "ignored" } };
  }

  const notification = parsePaymentNotification(parsed);
  if (!notification) return { status: 200, body: { ok: true, result: "ignored" } };

  try {
    const applied = await input.apply(notification);
    const paid = applied.result === "paid" && applied.payment_id ? { paymentId: applied.payment_id, movedToProof: applied.moved === true } : undefined;
    return { status: 200, body: { ok: true, result: applied.result }, ...(paid ? { paid } : {}) };
  } catch {
    return { status: 500, body: { ok: false, result: "failed" } };
  }
}
