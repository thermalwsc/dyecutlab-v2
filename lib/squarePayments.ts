/* =========================================================
   DYE CUT LAB — what we ask Square for, and how its answer is read
============================================================
   A customer pays on Square's own hosted checkout page: we create a payment link for one exact amount
   and send the customer there. Card details never touch our site. The call itself (and the secret
   token) lives in lib/squareClient.ts; everything that can be tested without the network is here.
   Covered by tests/squarePayments.test.ts.

   Square's Checkout API: POST /v2/online-checkout/payment-links with quick_pay (an item name, a price
   and the location). It answers with payment_link { id, order_id, url }. */

import type { PaymentKind } from "./payments.ts";

export type SquareEnvironment = "sandbox" | "production";

/* Anything but exactly "production" means the sandbox, so a typo can never spend real money. */
export function normalizeEnvironment(value: string | null | undefined): SquareEnvironment {
  return (value || "").trim().toLowerCase() === "production" ? "production" : "sandbox";
}

export function squareBaseUrl(environment: SquareEnvironment): string {
  return environment === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
}

/* The Square API version the request shapes below were written against. */
export const SQUARE_VERSION = "2026-09-16";

const KIND_NAMES: Record<PaymentKind, string> = { deposit: "50% deposit", balance: "50% balance" };

export type PaymentLinkInput = {
  /* the payment's own id: asking twice with it can never create two links */
  idempotencyKey: string;
  locationId: string;
  amountCents: number;
  kind: PaymentKind;
  projectNumber: string;
  /* where Square sends the customer afterwards */
  redirectUrl: string;
  buyerEmail?: string | null;
};

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/* The body of the request. Only an amount in whole US cents, never a decimal. */
export function buildPaymentLinkBody(input: PaymentLinkInput) {
  const email = input.buyerEmail?.trim();
  return {
    idempotency_key: input.idempotencyKey.slice(0, 192),
    quick_pay: {
      name: `DYE CUT LAB ${input.projectNumber}: ${KIND_NAMES[input.kind]}`.slice(0, 255),
      price_money: { amount: input.amountCents, currency: "USD" },
      location_id: input.locationId,
    },
    checkout_options: {
      redirect_url: input.redirectUrl.slice(0, 2048),
      allow_tipping: false,
      ask_for_shipping_address: false,
    },
    ...(email && EMAIL_RE.test(email) ? { pre_populated_data: { buyer_email: email } } : {}),
    payment_note: `${input.projectNumber} ${KIND_NAMES[input.kind]}`.slice(0, 500),
  };
}

export type PaymentLink = { url: string; orderId: string; linkId: string | null };

const text = (value: unknown, max = 2048): string | null =>
  typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;

/* The link and the order out of Square's answer, or null when it is not one. The link must be https so a
   customer is never sent somewhere odd. */
export function parsePaymentLinkResponse(body: unknown): PaymentLink | null {
  const link = (body as { payment_link?: Record<string, unknown> } | null)?.payment_link;
  if (!link || typeof link !== "object") return null;
  const url = text(link.url) ?? text(link.long_url);
  const orderId = text(link.order_id, 200);
  if (!url || !orderId || !/^https:\/\//i.test(url)) return null;
  return { url, orderId, linkId: text(link.id, 200) };
}

/* One plain sentence for a refusal from Square, never its own words or codes, and never anything secret. */
export function squareErrorMessage(status: number, body: unknown): string {
  const first = (body as { errors?: { category?: string; code?: string }[] } | null)?.errors?.[0];
  if (status === 401 || first?.category === "AUTHENTICATION_ERROR") return "Payments are not set up yet. Please tell DYE CUT LAB.";
  if (first?.code === "INVALID_EMAIL_ADDRESS") return "The email on your account was not accepted by the payment page. Please tell DYE CUT LAB.";
  if (status === 429) return "Too many payment attempts. Wait a moment and try again.";
  return "The payment page could not be opened. Please try again in a moment.";
}

/* Where Square sends the customer after paying. The page then waits for Square's notification. */
export function redirectUrlFor(siteUrl: string, projectNumber: string, kind: PaymentKind): string {
  return `${siteUrl.replace(/\/+$/, "")}/project/${encodeURIComponent(projectNumber)}?paid=${kind}`;
}

/* The idempotency-key rule in one place: the payment's own id. */
export function idempotencyKeyFor(paymentId: string): string {
  return `dcl-payment-${paymentId}`;
}
