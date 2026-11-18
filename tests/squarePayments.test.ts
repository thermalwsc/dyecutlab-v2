import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SQUARE_VERSION,
  buildPaymentLinkBody,
  idempotencyKeyFor,
  normalizeEnvironment,
  parsePaymentLinkResponse,
  redirectUrlFor,
  squareBaseUrl,
  squareErrorMessage,
} from "../lib/squarePayments.ts";

/* Every id, link and address here is made up. */

const input = {
  idempotencyKey: "dcl-payment-123",
  locationId: "LOC-1",
  amountCents: 50000,
  kind: "deposit" as const,
  projectNumber: "DCL-00109",
  redirectUrl: "https://example.test/project/DCL-00109?paid=deposit",
};

test("anything but exactly production means the sandbox, so a typo never spends real money", () => {
  assert.equal(normalizeEnvironment("production"), "production");
  assert.equal(normalizeEnvironment(" Production "), "production");
  for (const odd of ["sandbox", "", "prod", "live", "PRODUCTIONS", null, undefined]) assert.equal(normalizeEnvironment(odd), "sandbox", String(odd));
});

test("each environment has its own address", () => {
  assert.equal(squareBaseUrl("sandbox"), "https://connect.squareupsandbox.com");
  assert.equal(squareBaseUrl("production"), "https://connect.squareup.com");
  assert.match(SQUARE_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test("the request asks for one exact amount in whole US cents, to this location, with this key", () => {
  const body = buildPaymentLinkBody(input);
  assert.equal(body.idempotency_key, "dcl-payment-123");
  assert.deepEqual(body.quick_pay.price_money, { amount: 50000, currency: "USD" });
  assert.equal(body.quick_pay.location_id, "LOC-1");
  assert.match(body.quick_pay.name, /DCL-00109/);
  assert.match(body.quick_pay.name, /50% deposit/);
  assert.equal(body.checkout_options.redirect_url, input.redirectUrl);
  assert.equal(body.checkout_options.allow_tipping, false, "a tip would change the amount");
  assert.equal(body.checkout_options.ask_for_shipping_address, false);
  assert.match(body.payment_note, /DCL-00109 50% deposit/);
});

test("the balance is named as the balance", () => {
  const body = buildPaymentLinkBody({ ...input, kind: "balance", amountCents: 6172 });
  assert.match(body.quick_pay.name, /50% balance/);
  assert.equal(body.quick_pay.price_money.amount, 6172);
});

test("the buyer's email is passed on only when it looks like one", () => {
  assert.deepEqual(buildPaymentLinkBody({ ...input, buyerEmail: " buyer@example.test " }).pre_populated_data, { buyer_email: "buyer@example.test" });
  for (const bad of ["not an email", "a@b", "", "  ", null, undefined]) {
    assert.equal("pre_populated_data" in buildPaymentLinkBody({ ...input, buyerEmail: bad }), false, String(bad));
  }
});

test("long values are cut to what Square accepts", () => {
  const body = buildPaymentLinkBody({ ...input, idempotencyKey: "k".repeat(500), redirectUrl: "https://example.test/" + "a".repeat(3000) });
  assert.equal(body.idempotency_key.length, 192);
  assert.equal(body.checkout_options.redirect_url.length, 2048);
});

test("the checkout link and order are read out of Square's answer", () => {
  assert.deepEqual(parsePaymentLinkResponse({ payment_link: { id: "LINK-1", order_id: "ORDER-1", url: "https://square.link/u/abc", long_url: "https://checkout.square.site/x" } }), {
    url: "https://square.link/u/abc",
    orderId: "ORDER-1",
    linkId: "LINK-1",
  });
  assert.equal(parsePaymentLinkResponse({ payment_link: { order_id: "ORDER-1", long_url: "https://checkout.square.site/x" } })?.url, "https://checkout.square.site/x", "falls back to the long link");
});

test("an answer without a link and an order is not trusted, and neither is a link that is not https", () => {
  assert.equal(parsePaymentLinkResponse({ payment_link: { order_id: "ORDER-1" } }), null);
  assert.equal(parsePaymentLinkResponse({ payment_link: { url: "https://square.link/u/abc" } }), null);
  assert.equal(parsePaymentLinkResponse({ payment_link: { order_id: "O", url: "http://square.link/u/abc" } }), null);
  assert.equal(parsePaymentLinkResponse({ payment_link: { order_id: "O", url: "javascript:alert(1)" } }), null);
  assert.equal(parsePaymentLinkResponse({ errors: [{ code: "X" }] }), null);
  for (const odd of [null, undefined, "text", 5, [], {}]) assert.equal(parsePaymentLinkResponse(odd), null, JSON.stringify(odd));
});

test("a refusal from Square becomes one plain sentence and never repeats its codes", () => {
  assert.match(squareErrorMessage(401, { errors: [{ category: "AUTHENTICATION_ERROR", code: "UNAUTHORIZED" }] }), /not set up yet/);
  assert.match(squareErrorMessage(400, { errors: [{ category: "INVALID_REQUEST_ERROR", code: "INVALID_EMAIL_ADDRESS" }] }), /email/);
  assert.match(squareErrorMessage(429, null), /Too many/);
  for (const text of [squareErrorMessage(500, null), squareErrorMessage(400, { errors: [{ category: "INVALID_REQUEST_ERROR", code: "VALUE_TOO_LOW" }] }), squareErrorMessage(0, undefined)]) {
    assert.match(text, /could not be opened/);
    assert.ok(!/INVALID|UNAUTHORIZED|VALUE_TOO|token|Bearer/i.test(text), text);
  }
});

test("the customer comes back to their own project, whatever the address looks like", () => {
  assert.equal(redirectUrlFor("https://www.dyecutlab.com", "DCL-00109", "deposit"), "https://www.dyecutlab.com/project/DCL-00109?paid=deposit");
  assert.equal(redirectUrlFor("http://localhost:3000///", "DCL-00109", "balance"), "http://localhost:3000/project/DCL-00109?paid=balance");
  assert.equal(redirectUrlFor("https://x.test", "A B/C", "deposit"), "https://x.test/project/A%20B%2FC?paid=deposit");
});

test("the idempotency key comes from the payment's own id, so asking twice makes one link", () => {
  assert.equal(idempotencyKeyFor("abc"), "dcl-payment-abc");
  assert.equal(idempotencyKeyFor("abc"), idempotencyKeyFor("abc"));
  assert.notEqual(idempotencyKeyFor("abc"), idempotencyKeyFor("abd"));
});
