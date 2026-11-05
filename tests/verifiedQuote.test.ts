import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVerifiedQuoteArgs, type ApprovedFactoryQuote } from "../lib/verifiedQuote.ts";
import { VERIFIED_NOTICE, describeCustomerVersion, toCustomerVersion } from "../lib/quoteVersions.ts";
import type { PricingMargin } from "../lib/estimate.ts";

/* Every number here is made up to prove the arithmetic. None of it is a price. */

const PROJECT = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "22222222-2222-4222-8222-222222222222";

const margins: PricingMargin[] = [{ name: "Test default", appliesTo: "All products", margin: 0.35, minQuantity: 200, maxQuantity: null }];

const quote: ApprovedFactoryQuote = { id: QUOTE_ID, quantity: 500, price_per_piece: "1.1000", tooling_cost: "100.00", lead_days: 30 };

function build(over: Partial<ApprovedFactoryQuote> = {}, rules = margins, name = "Box") {
  return buildVerifiedQuoteArgs(PROJECT, name, { ...quote, ...over }, rules);
}

test("the customer's price is the factory's cost plus our margin", () => {
  const result = build();
  assert.equal(result.ok, true);
  if (!result.ok) return;

  /* 500 x 1.10 = 550 + 100 tooling = 650; 650 / 0.65 = 1000.00 */
  assert.equal(result.cost, 650);
  assert.equal(result.margin, 0.35);
  assert.equal(result.sellTotal, 1000);
  assert.equal(result.sellPerPiece, 2);
});

test("it is saved as a verified version, traced to the factory quote, with the factory's lead time", () => {
  const result = build();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { args } = result;

  assert.equal(args.p_kind, "verified");
  assert.equal(args.p_factory_quote, QUOTE_ID);
  assert.equal(args.p_project, PROJECT);
  assert.equal(args.p_quantity, 500);
  assert.equal(args.p_lead_days, 30);
  assert.deepEqual(args.p_includes, ["product", "tooling"]);
  assert.deepEqual(args.p_excludes, ["freight"], "shipping is added last, as the client decided");
  assert.equal(args.p_notice, VERIFIED_NOTICE);
  assert.equal(args.p_cost, 650);
  assert.equal(args.p_margin, 0.35);
  assert.equal(args.p_margin_rule, "Test default");
});

test("without tooling the version does not claim to include it", () => {
  const result = build({ tooling_cost: 0 });
  assert.equal(result.ok && result.cost, 550);
  assert.deepEqual(result.ok && result.args.p_includes, ["product"]);
  assert.equal(result.ok && (result.args.p_lines as unknown[]).length, 1);
});

test("an unknown lead time stays unknown", () => {
  const result = build({ lead_days: null });
  assert.equal(result.ok && result.args.p_lead_days, null);
});

test("the private snapshot keeps the factory quote and the margin rules used", () => {
  const result = build();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const inputs = result.args.p_inputs as { source: string; factoryQuote: { price_per_piece: string }; margins: PricingMargin[] };
  assert.equal(inputs.source, "factory_quote");
  assert.equal(inputs.factoryQuote.price_per_piece, "1.1000");
  assert.equal(inputs.margins[0].margin, 0.35);
  assert.deepEqual(JSON.parse(JSON.stringify(result.args)), result.args, "plain data, safe to send as JSON");
});

test("no margin rule means no verified quote and a sentence that says what to do", () => {
  for (const rules of [[], [{ name: "Pouch only", appliesTo: "Pouch", margin: 0.3 }], [{ name: "Big orders", margin: 0.3, minQuantity: 1000 }]] as PricingMargin[][]) {
    const result = build({}, rules);
    assert.equal(result.ok, false);
    assert.match(!result.ok ? result.message : "", /margin rule/);
  }
});

test("the margin rule for the product beats a general one", () => {
  const rules: PricingMargin[] = [...margins, { name: "Box only", appliesTo: "Box", margin: 0.5 }];
  const result = build({}, rules);
  assert.equal(result.ok && result.margin, 0.5);
  assert.equal(result.ok && result.sellTotal, 1300);
});

test("numbers the database would not hold are refused", () => {
  for (const over of [{ quantity: 0 }, { quantity: 1.5 }, { price_per_piece: "abc" }, { price_per_piece: -1 }, { tooling_cost: -5 }]) {
    assert.equal(build(over as Partial<ApprovedFactoryQuote>).ok, false, JSON.stringify(over));
  }
  assert.equal(buildVerifiedQuoteArgs("not-a-uuid", "Box", quote, margins).ok, false);
  assert.equal(buildVerifiedQuoteArgs(PROJECT, "Box", { ...quote, id: "nope" }, margins).ok, false);
});

test("the customer-facing half never holds the factory's price, the cost or the margin", () => {
  const result = build();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { args } = result;
  const customerSide = JSON.stringify({
    q: args.p_quantity,
    t: args.p_sell_total,
    p: args.p_sell_per_piece,
    l: args.p_lead_days,
    i: args.p_includes,
    e: args.p_excludes,
    n: args.p_notice,
  }).toLowerCase();
  for (const secret of ["1.1", "650", "margin", "cost", "tier", "default"]) {
    assert.ok(!customerSide.includes(secret), `the customer half must not mention ${secret}`);
  }
});

test("a verified quote reads as a quote, not an estimate, on the customer's side", () => {
  const view = toCustomerVersion({
    version: 3,
    kind: "verified",
    created_at: "2026-11-05T10:00:00.000Z",
    quantity: 500,
    sell_total: "1000.00",
    sell_per_piece: "2.0000",
    lead_days: 30,
    includes: ["product", "tooling"],
    excludes: ["freight"],
    notice: null,
  });
  assert.ok(view);
  assert.equal(view.kind, "verified");
  assert.equal(view.label, "Quote");
  assert.equal(view.notice, VERIFIED_NOTICE);

  const text = describeCustomerVersion(view);
  assert.equal(text.heading, "Your quote");
  assert.equal(text.notIncluded, "Shipping is added after the quote.");
  assert.ok(!JSON.stringify(text).toLowerCase().includes("estimate"), JSON.stringify(text));
});

test("an old row without a kind is still an estimate", () => {
  const view = toCustomerVersion({
    version: 1,
    created_at: "2026-10-28T10:00:00.000Z",
    quantity: 500,
    sell_total: "1153.85",
    sell_per_piece: "2.3077",
    lead_days: null,
    includes: ["product"],
    excludes: [],
    notice: null,
  });
  assert.ok(view);
  assert.equal(view.kind, "estimate");
  assert.equal(view.label, "Estimate");
  assert.equal(describeCustomerVersion(view).heading, "Your estimate");
});
