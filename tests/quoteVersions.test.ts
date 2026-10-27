import { test } from "node:test";
import assert from "node:assert/strict";
import { ESTIMATE_NOTICE, estimate, type EstimateInput } from "../lib/estimate.ts";
import {
  buildQuoteVersionArgs,
  isProjectId,
  latestCustomerVersion,
  toCustomerVersion,
  type QuoteVersionRow,
} from "../lib/quoteVersions.ts";

/* Every number here is made up to prove the plumbing. None of it is a price. */

const PROJECT = "11111111-1111-4111-8111-111111111111";

const input: EstimateInput = {
  quantity: 500,
  product: { product: "Test box", minOrder: 200, tiers: [{ minQuantity: 200, pricePerPiece: 1.8 }, { minQuantity: 500, pricePerPiece: 1.2 }] },
  finishes: [{ name: "Matte", chargeType: "per_piece", amount: 0.06 }],
  tooling: [{ name: "Die", cost: 120 }],
  margins: [{ name: "Test default", appliesTo: "All products", margin: 0.35 }],
  leadTime: { proofDays: 5, productionDays: 15, finishDays: 3 },
};

function made() {
  const result = estimate(input);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("not ok");
  return result;
}

test("a project id must look like a uuid", () => {
  assert.equal(isProjectId(PROJECT), true);
  assert.equal(isProjectId("DCL-00088"), false);
  assert.equal(isProjectId(""), false);
  assert.equal(isProjectId(null), false);
  assert.equal(isProjectId("1; drop table projects"), false);
});

test("the saved arguments carry the whole estimate, split into the safe and the private half", () => {
  const result = made();
  const args = buildQuoteVersionArgs(PROJECT, input, result);

  assert.equal(args.p_project, PROJECT);
  assert.equal(args.p_quantity, 500);
  assert.equal(args.p_sell_total, result.sellTotal);
  assert.equal(args.p_sell_per_piece, result.sellPerPiece);
  assert.equal(args.p_lead_days, 23);
  assert.deepEqual(args.p_includes, ["product", "finishes", "tooling"]);
  assert.deepEqual(args.p_excludes, ["freight"]);
  assert.equal(args.p_notice, ESTIMATE_NOTICE);
  assert.equal(args.p_cost, result.cost);
  assert.equal(args.p_margin, 0.35);
  assert.equal(args.p_margin_rule, "Test default");
  assert.deepEqual(args.p_lines, result.lines);
});

test("the saved inputs keep the price rows that were used, so a later price change cannot alter an old quote", () => {
  const result = made();
  const args = buildQuoteVersionArgs(PROJECT, input, result);
  const saved = args.p_inputs as EstimateInput;

  assert.deepEqual(saved.product.tiers, [{ minQuantity: 200, pricePerPiece: 1.8 }, { minQuantity: 500, pricePerPiece: 1.2 }]);
  assert.equal(saved.margins[0].margin, 0.35);

  /* the saved copy is detached: changing the live objects afterwards changes nothing */
  input.product.tiers[1].pricePerPiece = 99;
  assert.equal(saved.product.tiers[1].pricePerPiece, 1.2);
  input.product.tiers[1].pricePerPiece = 1.2;
});

test("the arguments are plain data that survive being sent as JSON", () => {
  const args = buildQuoteVersionArgs(PROJECT, input, made());
  assert.deepEqual(JSON.parse(JSON.stringify(args)), args);
});

test("a bad project id is refused before anything is sent", () => {
  assert.throws(() => buildQuoteVersionArgs("DCL-00088", input, made()), /valid project id/);
});

const row = (over: Partial<QuoteVersionRow> = {}): QuoteVersionRow => ({
  version: 1,
  created_at: "2026-10-28T10:00:00.000Z",
  quantity: 500,
  sell_total: "1192.31",
  sell_per_piece: "2.3846",
  lead_days: 23,
  includes: ["product", "finishes"],
  excludes: ["freight"],
  notice: ESTIMATE_NOTICE,
  ...over,
});

test("a customer reads a version back as numbers, labeled as an estimate", () => {
  const view = toCustomerVersion(row());
  assert.ok(view);
  assert.equal(view.label, "Estimate");
  assert.equal(view.total, 1192.31);
  assert.equal(view.perPiece, 2.3846);
  assert.equal(view.currency, "USD");
  assert.equal(view.leadDays, 23);
  assert.equal(view.notice, ESTIMATE_NOTICE);
  assert.deepEqual(view.excludes, ["freight"]);
});

test("the estimate notice is always there, even if an old row lacks it", () => {
  assert.equal(toCustomerVersion(row({ notice: "   " }))?.notice, ESTIMATE_NOTICE);
  assert.equal(toCustomerVersion(row({ notice: null }))?.notice, ESTIMATE_NOTICE);
});

test("a row that cannot be read gives nothing, never a wrong price", () => {
  assert.equal(toCustomerVersion(null), null);
  assert.equal(toCustomerVersion(undefined), null);
  assert.equal(toCustomerVersion(row({ sell_total: "abc" })), null);
  assert.equal(toCustomerVersion(row({ sell_total: "-5" })), null);
  assert.equal(toCustomerVersion(row({ sell_per_piece: "NaN" })), null);
  assert.equal(toCustomerVersion(row({ quantity: 0 })), null);
  assert.equal(toCustomerVersion(row({ version: 0 })), null);
});

test("missing lists and lead time read as empty, not as errors", () => {
  const view = toCustomerVersion(row({ includes: null, excludes: null, lead_days: null }));
  assert.ok(view);
  assert.deepEqual(view.includes, []);
  assert.deepEqual(view.excludes, []);
  assert.equal(view.leadDays, null);
});

test("what a customer reads has no cost, margin, tier or rule", () => {
  const text = JSON.stringify(toCustomerVersion(row())).toLowerCase();
  for (const secret of ["margin", "cost", "tier", "rule", "inputs", "lines"]) {
    assert.ok(!text.includes(secret), `a customer's version must not mention ${secret}`);
  }
});

test("the newest version a customer can read wins, whatever the order", () => {
  const rows = [row({ version: 2, sell_total: "900" }), row({ version: 3, sell_total: "950" }), row({ version: 1 })];
  assert.equal(latestCustomerVersion(rows)?.version, 3);
  assert.equal(latestCustomerVersion([...rows].reverse())?.total, 950);
});

test("no readable version gives nothing", () => {
  assert.equal(latestCustomerVersion([]), null);
  assert.equal(latestCustomerVersion(null), null);
  assert.equal(latestCustomerVersion([row({ sell_total: "oops" })]), null);
});
