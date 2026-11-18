import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePaymentNotification, signatureFor, verifySquareSignature } from "../lib/squareWebhook.ts";

/* The key, the address and the bodies here are made up. */

const KEY = "test-signature-key";
const URL_ = "https://example.test/api/square/webhook";

function notification(overrides: Record<string, unknown> = {}, payment: Record<string, unknown> = {}) {
  return {
    merchant_id: "MERCHANT",
    type: "payment.updated",
    event_id: "evt-1",
    created_at: "2026-11-17T10:00:00Z",
    data: {
      type: "payment",
      id: "PAY-1",
      object: {
        payment: {
          id: "PAY-1",
          status: "COMPLETED",
          order_id: "ORDER-1",
          amount_money: { amount: 50000, currency: "USD" },
          total_money: { amount: 50000, currency: "USD" },
          receipt_url: "https://squareup.com/receipt/preview/PAY-1",
          ...payment,
        },
      },
    },
    ...overrides,
  };
}

test("a notification signed with our key is accepted", () => {
  const body = JSON.stringify(notification());
  const header = signatureFor(KEY, URL_, body);
  assert.equal(verifySquareSignature({ signatureKey: KEY, notificationUrl: URL_, rawBody: body, signatureHeader: header }), true);
  assert.equal(verifySquareSignature({ signatureKey: KEY, notificationUrl: URL_, rawBody: body, signatureHeader: `  ${header}  ` }), true, "stray spaces in the header are fine");
});

test("the signature is a base64 HMAC-SHA256 of the address followed by the exact body", () => {
  const signature = signatureFor(KEY, URL_, "{}");
  assert.match(signature, /^[A-Za-z0-9+/]{43}=$/, "32 bytes in base64");
  assert.equal(signature, signatureFor(KEY, URL_, "{}"), "same input, same signature");
  assert.notEqual(signature, signatureFor(KEY, URL_, "{ }"), "one space changes it");
});

test("anything that does not match is refused", () => {
  const body = JSON.stringify(notification());
  const good = signatureFor(KEY, URL_, body);
  const base = { signatureKey: KEY, notificationUrl: URL_, rawBody: body, signatureHeader: good };

  assert.equal(verifySquareSignature({ ...base, rawBody: body.replace("50000", "10") }), false, "a changed body");
  assert.equal(verifySquareSignature({ ...base, notificationUrl: "https://example.test/other" }), false, "another address");
  assert.equal(verifySquareSignature({ ...base, signatureKey: "another-key" }), false, "another key");
  assert.equal(verifySquareSignature({ ...base, signatureHeader: good.slice(0, -2) + "xx" }), false, "a wrong signature");
  assert.equal(verifySquareSignature({ ...base, signatureHeader: "" }), false, "an empty signature");
  assert.equal(verifySquareSignature({ ...base, signatureHeader: null }), false, "no signature header");
  assert.equal(verifySquareSignature({ ...base, signatureHeader: good + "A" }), false, "a longer signature");
});

test("a missing key or address refuses everything, so a forgotten setting never lets a forged call through", () => {
  const body = "{}";
  const header = signatureFor(KEY, URL_, body);
  assert.equal(verifySquareSignature({ signatureKey: "", notificationUrl: URL_, rawBody: body, signatureHeader: header }), false);
  assert.equal(verifySquareSignature({ signatureKey: undefined, notificationUrl: URL_, rawBody: body, signatureHeader: header }), false);
  assert.equal(verifySquareSignature({ signatureKey: KEY, notificationUrl: null, rawBody: body, signatureHeader: header }), false);
  assert.equal(verifySquareSignature({ signatureKey: "", notificationUrl: "", rawBody: body, signatureHeader: signatureFor("", "", body) }), false);
});

test("a payment notification is read into what we need", () => {
  assert.deepEqual(parsePaymentNotification(notification()), {
    eventId: "evt-1",
    type: "payment.updated",
    orderId: "ORDER-1",
    paymentId: "PAY-1",
    status: "COMPLETED",
    amountCents: 50000,
    receiptUrl: "https://squareup.com/receipt/preview/PAY-1",
  });
  assert.equal(parsePaymentNotification(notification({ type: "payment.created" }))?.type, "payment.created");
});

test("the amount asked for is used, not a total with a tip", () => {
  const parsed = parsePaymentNotification(notification({}, { amount_money: { amount: 50000, currency: "USD" }, total_money: { amount: 55000, currency: "USD" } }));
  assert.equal(parsed?.amountCents, 50000);
  const onlyTotal = parsePaymentNotification(notification({}, { amount_money: undefined }));
  assert.equal(onlyTotal?.amountCents, 50000, "falls back to the total when that is all there is");
});

test("a receipt and a payment id are optional", () => {
  const parsed = parsePaymentNotification(notification({}, { receipt_url: undefined, id: undefined }));
  assert.equal(parsed?.receiptUrl, null);
  assert.equal(parsed?.paymentId, null);
});

test("other events, and anything incomplete, are not payments", () => {
  assert.equal(parsePaymentNotification(notification({ type: "order.updated" })), null);
  assert.equal(parsePaymentNotification(notification({ type: "refund.updated" })), null);
  assert.equal(parsePaymentNotification(notification({ event_id: "" })), null);
  assert.equal(parsePaymentNotification(notification({ event_id: undefined })), null);
  assert.equal(parsePaymentNotification(notification({}, { order_id: undefined })), null);
  assert.equal(parsePaymentNotification(notification({}, { status: undefined })), null);
  assert.equal(parsePaymentNotification(notification({}, { amount_money: { amount: 50000, currency: "EUR" }, total_money: undefined })), null, "only US dollars");
  assert.equal(parsePaymentNotification(notification({}, { amount_money: { amount: 0, currency: "USD" } })), null);
  assert.equal(parsePaymentNotification(notification({}, { amount_money: { amount: -5, currency: "USD" } })), null);
  assert.equal(parsePaymentNotification(notification({}, { amount_money: { amount: 12.5, currency: "USD" } })), null, "cents are whole numbers");
  assert.equal(parsePaymentNotification(notification({}, { amount_money: { amount: "50000", currency: "USD" } })), null, "a number, not text");
  assert.equal(parsePaymentNotification({ type: "payment.updated", event_id: "e", data: {} }), null);
  for (const odd of [null, undefined, "text", 5, [], {}]) assert.equal(parsePaymentNotification(odd), null, JSON.stringify(odd));
});
