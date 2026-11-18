import { createHmac, timingSafeEqual } from "node:crypto";

/* =========================================================
   DYE CUT LAB — checking and reading a Square notification
============================================================
   Square tells us a payment happened by calling our notification address. Anyone can call that address,
   so a notification is trusted only when its signature proves it came from Square: an HMAC-SHA256 of the
   notification address plus the exact body, made with the signature key from our Square application,
   sent in the x-square-hmacsha256-signature header (Square's documented scheme).

   Pure functions with no network and no secrets of their own, covered by tests/squareWebhook.test.ts.
   The route that uses them is app/api/square/webhook/route.ts. */

export function signatureFor(signatureKey: string, notificationUrl: string, rawBody: string): string {
  return createHmac("sha256", signatureKey).update(notificationUrl + rawBody).digest("base64");
}

/* true only when the header matches. Compared in constant time, so the answer does not leak how many
   characters were right. */
export function verifySquareSignature(input: {
  signatureKey: string | null | undefined;
  notificationUrl: string | null | undefined;
  rawBody: string;
  signatureHeader: string | null | undefined;
}): boolean {
  const { signatureKey, notificationUrl, rawBody, signatureHeader } = input;
  if (!signatureKey || !notificationUrl || !signatureHeader) return false;
  const expected = Buffer.from(signatureFor(signatureKey, notificationUrl, rawBody));
  const given = Buffer.from(signatureHeader.trim());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type PaymentNotification = {
  eventId: string;
  type: string;
  orderId: string;
  paymentId: string | null;
  status: string;
  amountCents: number;
  receiptUrl: string | null;
};

const PAYMENT_EVENTS = new Set(["payment.created", "payment.updated"]);

const text = (value: unknown, max = 200): string | null =>
  typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;

/* The payment inside a notification, or null when it is some other kind of event or is missing what we
   need (an event id, the order, an amount in US dollars). Nothing is guessed. */
export function parsePaymentNotification(body: unknown): PaymentNotification | null {
  if (!body || typeof body !== "object") return null;
  const event = body as Record<string, unknown>;
  const type = text(event.type, 60);
  const eventId = text(event.event_id);
  if (!type || !eventId || !PAYMENT_EVENTS.has(type)) return null;

  const data = event.data as { object?: { payment?: Record<string, unknown> } } | undefined;
  const payment = data?.object?.payment;
  if (!payment || typeof payment !== "object") return null;

  const orderId = text(payment.order_id);
  const status = text(payment.status, 40);
  /* amount_money is what the checkout asked for; total_money would also include a tip or a fee */
  const money = (payment.amount_money ?? payment.total_money) as { amount?: unknown; currency?: unknown } | undefined;
  const amount = money?.amount;
  if (!orderId || !status || !money || money.currency !== "USD") return null;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) return null;

  return {
    eventId,
    type,
    orderId,
    paymentId: text(payment.id),
    status,
    amountCents: amount,
    receiptUrl: text(payment.receipt_url, 500),
  };
}
