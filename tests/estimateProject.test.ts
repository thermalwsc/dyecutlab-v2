import { test } from "node:test";
import assert from "node:assert/strict";
import { estimate } from "../lib/estimate.ts";
import {
  buildProjectEstimateInput,
  finishesFor,
  matchProducts,
  pickLeadTime,
  toEngineMargin,
  toEngineProduct,
  type EstimateRows,
  type ProductRow,
} from "../lib/estimateProject.ts";

/* Every number here is made up to prove the plumbing. None of it is a price. */

const BOX: ProductRow = { id: "p-box", product: "Box", style: "Mailer", min_order: 200, active: true };
const BOX_TUCK: ProductRow = { id: "p-box2", product: "Box", style: "Tuck-top", min_order: 200, active: true };
const POUCH: ProductRow = { id: "p-pouch", product: "Pouch", style: null, min_order: null, active: true };

const rows: EstimateRows = {
  products: [BOX, BOX_TUCK, POUCH],
  tiers: [
    { product_id: "p-box", min_quantity: "200", price_per_piece: "1.8000" },
    { product_id: "p-box", min_quantity: 500, price_per_piece: 1.2 },
    { product_id: "p-pouch", min_quantity: 100, price_per_piece: 0.5 },
  ],
  finishes: [
    { id: "f-matte", name: "Matte", applies_to: "Box", charge_type: "per_piece", amount: "0.0600", min_order: null, active: true },
    { id: "f-foil", name: "Foil", applies_to: null, charge_type: "per_order", amount: 25, min_order: null, active: true },
    { id: "f-pouch", name: "Zip", applies_to: "Pouch", charge_type: "per_piece", amount: 0.02, min_order: null, active: true },
    { id: "f-off", name: "Old finish", applies_to: "Box", charge_type: "per_piece", amount: 9, min_order: null, active: false },
  ],
  tooling: [
    { id: "t-die", name: "Die", cost: "120.00", active: true },
    { id: "t-off", name: "Old die", cost: 1, active: false },
  ],
  margins: [{ name: "Default", applies_to: "All products", margin: "0.3500", min_quantity: 200, max_quantity: null, active: true }],
  leadTimes: [
    { product: "Box", proof_days: 5, production_days: 15, finish_days: 3, active: true },
    { product: "Box, Tuck-top", proof_days: 6, production_days: 18, finish_days: 4, active: true },
  ],
};

const project = { quantity: 500, product_type: "BOX" };

test("a project fits the pricing products with the same name, in any style and case", () => {
  assert.deepEqual(matchProducts("BOX", rows.products).map((p) => p.id), ["p-box", "p-box2"]);
  assert.deepEqual(matchProducts("  box ", rows.products).map((p) => p.id), ["p-box", "p-box2"]);
  assert.deepEqual(matchProducts("Pouch", rows.products).map((p) => p.id), ["p-pouch"]);
});

test("nothing fits when the type is empty, unknown, or the product is switched off", () => {
  assert.deepEqual(matchProducts(null, rows.products), []);
  assert.deepEqual(matchProducts("", rows.products), []);
  assert.deepEqual(matchProducts("Jar", rows.products), []);
  assert.deepEqual(matchProducts("Box", [{ ...BOX, active: false }]), []);
  assert.deepEqual(matchProducts("Box", null as unknown as ProductRow[]), []);
});

test("only finishes that apply to the product, and are switched on, are offered", () => {
  assert.deepEqual(finishesFor("Box", rows.finishes).map((f) => f.id), ["f-matte", "f-foil"]);
  assert.deepEqual(finishesFor("Pouch", rows.finishes).map((f) => f.id), ["f-foil", "f-pouch"]);
  assert.deepEqual(finishesFor("Jar", rows.finishes).map((f) => f.id), ["f-foil"]);
});

test("database rows become the engine's numbers, text numbers included", () => {
  const product = toEngineProduct(BOX, rows.tiers);
  assert.deepEqual(product.tiers, [
    { minQuantity: 200, pricePerPiece: 1.8 },
    { minQuantity: 500, pricePerPiece: 1.2 },
  ]);
  assert.equal(product.minOrder, 200);

  const margin = toEngineMargin(rows.margins[0]);
  assert.equal(margin.margin, 0.35);
  assert.equal(margin.active, true);
});

test("a lead time is found for the product, and the more specific style wins", () => {
  assert.deepEqual(pickLeadTime(rows.leadTimes, { product: "Box", style: "Mailer" }), { proofDays: 5, productionDays: 15, finishDays: 3 });
  assert.deepEqual(pickLeadTime(rows.leadTimes, { product: "Box", style: "Tuck-top" }), { proofDays: 6, productionDays: 18, finishDays: 4 });
  assert.equal(pickLeadTime(rows.leadTimes, { product: "Jar" }), null);
  assert.equal(pickLeadTime([], { product: "Box" }), null);
});

test("the project's quantity, the chosen rows and the pricing rows become one estimate input", () => {
  const built = buildProjectEstimateInput(project, { productId: "p-box", finishIds: ["f-matte", "f-foil"], toolingIds: ["t-die"] }, rows);
  assert.equal(built.ok, true);
  if (!built.ok) return;

  assert.equal(built.input.quantity, 500);
  assert.equal(built.input.finishes?.length, 2);
  assert.equal(built.input.tooling?.[0].cost, 120);
  assert.equal(built.input.freight, undefined, "shipping is added last, not in the instant estimate");

  /* and it runs: 600 + 30 + 25 + 120 = 775; 775 / 0.65 = 1192.31 */
  const result = estimate(built.input);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.sellTotal, 1192.31);
  assert.equal(result.ok && result.leadDays.total, 23);
  assert.deepEqual(result.ok && result.excludes, ["freight"]);
});

test("a project without a quantity cannot be estimated", () => {
  for (const quantity of [null, 0, -5, 1.5]) {
    const built = buildProjectEstimateInput({ quantity: quantity as number | null, product_type: "BOX" }, { productId: "p-box", finishIds: [], toolingIds: [] }, rows);
    assert.equal(built.ok, false, String(quantity));
    assert.match(!built.ok ? built.message : "", /quantity/);
  }
});

test("a product that does not fit the project is refused, even if it exists", () => {
  const wrong = buildProjectEstimateInput(project, { productId: "p-pouch", finishIds: [], toolingIds: [] }, rows);
  assert.equal(wrong.ok, false);
  const unknown = buildProjectEstimateInput(project, { productId: "nope", finishIds: [], toolingIds: [] }, rows);
  assert.equal(unknown.ok, false);
  const none = buildProjectEstimateInput({ quantity: 500, product_type: "Jar" }, { productId: "p-box", finishIds: [], toolingIds: [] }, rows);
  assert.equal(none.ok, false);
  assert.match(!none.ok ? none.message : "", /Jar/);
});

test("a forged form cannot add a finish or tooling that does not apply or is switched off", () => {
  const pouchFinish = buildProjectEstimateInput(project, { productId: "p-box", finishIds: ["f-pouch"], toolingIds: [] }, rows);
  assert.equal(pouchFinish.ok, false);
  const off = buildProjectEstimateInput(project, { productId: "p-box", finishIds: ["f-off"], toolingIds: [] }, rows);
  assert.equal(off.ok, false);
  const offTool = buildProjectEstimateInput(project, { productId: "p-box", finishIds: [], toolingIds: ["t-off"] }, rows);
  assert.equal(offTool.ok, false);
  const missing = buildProjectEstimateInput(project, { productId: "p-box", finishIds: [], toolingIds: ["t-x"] }, rows);
  assert.equal(missing.ok, false);
});

test("choosing the same finish twice charges it once", () => {
  const built = buildProjectEstimateInput(project, { productId: "p-box", finishIds: ["f-matte", "f-matte"], toolingIds: [] }, rows);
  assert.equal(built.ok && built.input.finishes?.length, 1);
});

test("with no tiers the input still builds and the engine refuses, never guessing a price", () => {
  const built = buildProjectEstimateInput(project, { productId: "p-box2", finishIds: [], toolingIds: [] }, rows);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const result = estimate(built.input);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "no_pricing");
});

test("with no margin rule the engine refuses", () => {
  const built = buildProjectEstimateInput(project, { productId: "p-box", finishIds: [], toolingIds: [] }, { ...rows, margins: [] });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const result = estimate(built.input);
  assert.equal(!result.ok && result.reason, "no_margin");
});
