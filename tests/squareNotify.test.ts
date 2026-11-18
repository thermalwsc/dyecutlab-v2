import { test } from "node:test";
import assert from "node:assert/strict";
import { handleSquareNotification, type AppliedResult } from "../lib/squareNotify.ts";
import { signatureFor, type PaymentNotification } from "../lib/squareWebhook.ts";

/* The key, the address and the bodies here are made up. */

const KEY = "test-signature-key";
const URL_ = "https://example.test/api/square/webhook";

function payload(type = "payment.updated", status = "COMPLETED") {
  return JSON.stringify({
    type,
    event_id: "evt-1",
    data: { object: { payment: { id: "PAY-1", status, order_id: "ORDER-1", amount_money: { amount: 50000, currency: "USD" }, receipt_url: "https://squareup.com/receipt/preview/PAY-1" } } },
  });
}

function setup(rawBody: string, applied: AppliedResult | Error = { result: "paid", payment_id: "p-1", moved: true }) {
  const calls: PaymentNotification[] = [];
  const run = (overrides: Partial<Parameters<typeof handleSquareNotification>[0]> = {}) =>
    handleSquareNotification({
      rawBody,
      signatureHeader: signatureFor(KEY, URL_, rawBody),
      signatureKey: KEY,
      notificationUrl: URL_,
      apply: async (n) => {
        calls.push(n);
        if (applied instanceof Error) throw applied;
        return applied;
      },
      ...overrides,
    });
  return { calls, run };
}

test("a signed payment is applied, and the emails are asked for once when it newly paid", async () => {
  const { calls, run } = setup(payload());
  const answer = await run();
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, { ok: true, result: "paid" });
  assert.deepEqual(answer.paid, { paymentId: "p-1", movedToProof: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].orderId, "ORDER-1");
  assert.equal(calls[0].amountCents, 50000);
});

test("a paid balance does not claim it moved the project", async () => {
  const { run } = setup(payload(), { result: "paid", payment_id: "p-2", moved: false });
  assert.deepEqual((await run()).paid, { paymentId: "p-2", movedToProof: false });
});

test("a repeat, a wrong amount, an unknown order or a non-final status answers 200 and sends no email", async () => {
  for (const result of ["duplicate", "amount_mismatch", "unknown_order", "ignored", "already_paid", "failed", "canceled"]) {
    const { run } = setup(payload(), { result, payment_id: "p-1" });
    const answer = await run();
    assert.equal(answer.status, 200, result);
    assert.equal(answer.paid, undefined, `${result} sends no email`);
    assert.equal(answer.body.result, result);
  }
});

test("a call that is not signed by Square is refused and never reaches the database", async () => {
  const body = payload();
  for (const header of ["", null, undefined, "AAAA", signatureFor("another-key", URL_, body), signatureFor(KEY, "https://example.test/other", body), signatureFor(KEY, URL_, body.replace("50000", "1"))]) {
    const { calls, run } = setup(body);
    const answer = await run({ signatureHeader: header as string });
    assert.equal(answer.status, 403, String(header).slice(0, 12));
    assert.deepEqual(answer.body, { ok: false, result: "bad_signature" });
    assert.equal(calls.length, 0, "nothing is applied before the signature is proven");
  }
});

test("a body changed after signing is refused", async () => {
  const body = payload();
  const { calls, run } = setup(body);
  const answer = await run({ rawBody: body.replace("COMPLETED", "FAILED") });
  assert.equal(answer.status, 403);
  assert.equal(calls.length, 0);
});

test("with no key or no address set on the server, everything is refused with 503", async () => {
  for (const missing of [{ signatureKey: "" }, { signatureKey: undefined }, { notificationUrl: "" }, { notificationUrl: null }]) {
    const { calls, run } = setup(payload());
    const answer = await run(missing);
    assert.equal(answer.status, 503, JSON.stringify(missing));
    assert.equal(calls.length, 0);
  }
});

test("a signed call about something other than a payment is answered 200 and left alone", async () => {
  for (const body of [payload("order.updated"), payload("refund.updated"), "not json at all", "{}", JSON.stringify({ type: "payment.updated", event_id: "e", data: {} })]) {
    const { calls, run } = setup(body);
    const answer = await run();
    assert.equal(answer.status, 200, body.slice(0, 20));
    assert.deepEqual(answer.body, { ok: true, result: "ignored" });
    assert.equal(calls.length, 0);
  }
});

test("when the database fails the answer is 500 so Square tries again, and nothing is reported paid", async () => {
  const { run } = setup(payload(), new Error("boom"));
  const answer = await run();
  assert.equal(answer.status, 500);
  assert.deepEqual(answer.body, { ok: false, result: "failed" });
  assert.equal(answer.paid, undefined);
});

test("the answer never repeats the error or anything secret", async () => {
  const { run } = setup(payload(), new Error("secret-token-abc relation payments violates constraint"));
  const text = JSON.stringify(await run());
  assert.ok(!/secret|token|relation|constraint|payments/i.test(text), text);
});
