import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESTIMATE_NOTICE,
  customerView,
  estimate,
  pickMargin,
  pickTier,
  type EstimateInput,
  type PricingMargin,
} from "../lib/estimate.ts";

/* Every number here is made up to prove the arithmetic. None of it is a real
   price and none of it is ever shown to anyone. */

const box = {
  product: "Test box",
  style: "Test mailer",
  minOrder: 200,
  tiers: [
    { minQuantity: 1000, pricePerPiece: 0.85 },
    { minQuantity: 200, pricePerPiece: 1.8 },
    { minQuantity: 5000, pricePerPiece: 0.55 },
    { minQuantity: 500, pricePerPiece: 1.2 },
  ],
};

const defaultMargin: PricingMargin = { name: "Default", appliesTo: "All products", margin: 0.35, minQuantity: 200, maxQuantity: 100000 };

const seaFreight = { method: "Sea", destination: "US West Coast", chargedBy: "cubic_metre" as const, rate: 95, minCharge: 150, transitDays: 30 };

function input(over: Partial<EstimateInput> = {}): EstimateInput {
  return { quantity: 500, product: box, margins: [defaultMargin], ...over };
}

function ok(result: ReturnType<typeof estimate>) {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("not ok");
  return result;
}

test("a price tier applies from its quantity upward", () => {
  assert.equal(pickTier(box.tiers, 200)?.pricePerPiece, 1.8);
  assert.equal(pickTier(box.tiers, 499)?.pricePerPiece, 1.8);
  assert.equal(pickTier(box.tiers, 500)?.pricePerPiece, 1.2);
  assert.equal(pickTier(box.tiers, 700)?.pricePerPiece, 1.2);
  assert.equal(pickTier(box.tiers, 1000)?.pricePerPiece, 0.85);
  assert.equal(pickTier(box.tiers, 99999)?.pricePerPiece, 0.55);
});

test("between the smallest order and the first tier the first tier's price applies", () => {
  const product = { product: "Small", minOrder: 100, tiers: [{ minQuantity: 200, pricePerPiece: 2 }] };
  assert.equal(pickTier(product.tiers, 150)?.pricePerPiece, 2);
  assert.equal(ok(estimate({ quantity: 150, product, margins: [defaultMargin, { name: "Low", margin: 0.2, minQuantity: 100, maxQuantity: 150 }] })).pricePerPiece, 2);
});

test("no tiers or broken tiers means no price", () => {
  assert.equal(pickTier([], 500), null);
  assert.equal(pickTier([{ minQuantity: 200, pricePerPiece: -1 }], 500), null);
  assert.equal(pickTier([{ minQuantity: 0, pricePerPiece: 1 }], 500), null);
  const result = estimate(input({ product: { product: "Empty", tiers: [] } }));
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "no_pricing");
});

test("the product price times the quantity, then the margin, is the selling price", () => {
  const result = ok(estimate(input()));
  assert.equal(result.cost, 600);
  assert.equal(result.margin, 0.35);
  assert.equal(result.sellTotal, 923.08);
  assert.equal(result.sellPerPiece, 1.8462);
});

test("finishes and tooling are added to the cost before the margin", () => {
  const result = ok(
    estimate(
      input({
        finishes: [
          { name: "Matte", chargeType: "per_piece", amount: 0.06 },
          { name: "Foil", chargeType: "per_order", amount: 25 },
        ],
        tooling: [{ name: "Die", cost: 120 }],
      })
    )
  );
  /* 600 + 30 + 25 + 120 = 775; 775 / 0.65 = 1192.31 */
  assert.equal(result.cost, 775);
  assert.equal(result.sellTotal, 1192.31);
  assert.equal(result.sellPerPiece, 2.3846);
  assert.deepEqual(result.includes, ["product", "finishes", "tooling"]);
});

test("the lines always add up to the cost", () => {
  const result = ok(
    estimate(
      input({
        quantity: 700,
        finishes: [{ name: "Matte", chargeType: "per_piece", amount: 0.0333 }],
        tooling: [{ name: "Die", cost: 119.99 }],
        freight: seaFreight,
        shipment: { cbm: 2.2 },
      })
    )
  );
  const sum = Math.round(result.lines.reduce((total, line) => total + line.amount, 0) * 100) / 100;
  assert.equal(sum, result.cost);
});

test("small decimals do not drift", () => {
  const product = { product: "Dime", tiers: [{ minQuantity: 1, pricePerPiece: 0.1 }] };
  const result = ok(estimate({ quantity: 3, product, margins: [{ name: "Free", margin: 0 }] }));
  assert.equal(result.cost, 0.3);
  assert.equal(result.sellTotal, 0.3);
});

test("freight is rate x measure, never below the minimum charge", () => {
  const small = ok(estimate(input({ freight: seaFreight, shipment: { cbm: 0.5 } })));
  assert.equal(small.lines.at(-1)?.amount, 150, "47.50 is below the 150 minimum");

  const large = ok(estimate(input({ freight: seaFreight, shipment: { cbm: 3 } })));
  assert.equal(large.lines.at(-1)?.amount, 285);
  assert.equal(large.cost, 885);
  assert.equal(large.sellTotal, 1361.54);
  assert.deepEqual(large.includes, ["product", "freight"]);

  const flat = ok(estimate(input({ freight: { method: "Express", destination: "US", chargedBy: "order", rate: 80 } })));
  assert.equal(flat.lines.at(-1)?.amount, 80);

  const perKg = ok(estimate(input({ freight: { method: "Air", destination: "US", chargedBy: "kilogram", rate: 6, minCharge: 50 }, shipment: { kg: 12 } })));
  assert.equal(perKg.lines.at(-1)?.amount, 72);

  const pallets = ok(estimate(input({ freight: { method: "Sea", destination: "US", chargedBy: "pallet", rate: 300 }, shipment: { pallets: 2 } })));
  assert.equal(pallets.lines.at(-1)?.amount, 600);
});

test("without a shipment measure freight is left out and the estimate says so", () => {
  const result = ok(estimate(input({ freight: seaFreight })));
  assert.deepEqual(result.excludes, ["freight"]);
  assert.equal(result.cost, 600);

  const none = ok(estimate(input()));
  assert.deepEqual(none.excludes, ["freight"]);

  const zero = ok(estimate(input({ freight: seaFreight, shipment: { cbm: 0 } })));
  assert.deepEqual(zero.excludes, ["freight"]);
});

test("the margin rule for the product beats the general one, and a narrower range beats a wider one", () => {
  const rules: PricingMargin[] = [
    { name: "General wide", appliesTo: "All products", margin: 0.35, minQuantity: 200, maxQuantity: 100000 },
    { name: "General narrow", margin: 0.4, minQuantity: 200, maxQuantity: 999 },
    { name: "Box only", appliesTo: " test BOX ", margin: 0.3, minQuantity: 200 },
  ];
  assert.equal(pickMargin(rules, "Test box", 500)?.name, "Box only");
  assert.equal(pickMargin(rules, "Other product", 500)?.name, "General narrow");
  assert.equal(pickMargin(rules, "Other product", 1000)?.name, "General wide");
});

test("a rule for another product, an inactive rule or a bad margin is never used", () => {
  assert.equal(pickMargin([{ name: "Pouch", appliesTo: "Pouch", margin: 0.3 }], "Test box", 500), null);
  assert.equal(pickMargin([{ name: "Off", margin: 0.3, active: false }], "Test box", 500), null);
  assert.equal(pickMargin([{ name: "Too high", margin: 0.95 }], "Test box", 500), null);
  assert.equal(pickMargin([{ name: "Negative", margin: -0.1 }], "Test box", 500), null);
  assert.equal(pickMargin([{ name: "Out of range", margin: 0.3, minQuantity: 1000 }], "Test box", 500), null);
  assert.equal(pickMargin([], "Test box", 500), null);
});

test("no margin rule means no estimate, never a guessed margin", () => {
  const result = estimate(input({ margins: [] }));
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "no_margin");
});

test("a quantity below the smallest order is refused", () => {
  const result = estimate(input({ quantity: 150 }));
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "below_minimum");
  assert.match(!result.ok ? result.detail : "", /200 pieces/);
});

test("a finish that needs more pieces than the order is refused", () => {
  const result = estimate(input({ finishes: [{ name: "Foil", chargeType: "per_order", amount: 25, minOrder: 1000 }] }));
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "finish_minimum");
});

test("broken amounts are refused instead of becoming NaN", () => {
  const badFinish = estimate(input({ finishes: [{ name: "Odd", chargeType: "per_piece", amount: Number.NaN }] }));
  assert.equal(!badFinish.ok && badFinish.reason, "bad_number");
  const badTool = estimate(input({ tooling: [{ name: "Odd", cost: -5 }] }));
  assert.equal(!badTool.ok && badTool.reason, "bad_number");
});

test("the quantity must be a whole number above zero", () => {
  for (const quantity of [0, -5, 1.5, Number.NaN, Infinity, "500" as unknown as number]) {
    const result = estimate(input({ quantity }));
    assert.equal(result.ok, false, String(quantity));
    assert.equal(!result.ok && result.reason, "bad_quantity", String(quantity));
  }
});

test("lead time adds proof, production, finishing (only when finishes are chosen) and transit (only when freight is priced)", () => {
  const leadTime = { proofDays: 5, productionDays: 15, finishDays: 3 };

  const plain = ok(estimate(input({ leadTime })));
  assert.deepEqual(plain.leadDays, { proof: 5, production: 15, finishes: 0, transit: 0, total: 20 });

  const finished = ok(estimate(input({ leadTime, finishes: [{ name: "Matte", chargeType: "per_piece", amount: 0.06 }] })));
  assert.equal(finished.leadDays.total, 23);

  const shipped = ok(estimate(input({ leadTime, freight: seaFreight, shipment: { cbm: 3 } })));
  assert.equal(shipped.leadDays.transit, 30);
  assert.equal(shipped.leadDays.total, 50);

  const unknown = ok(estimate(input()));
  assert.equal(unknown.leadDays.total, 0);
});

test("every result carries the estimate notice", () => {
  assert.equal(ok(estimate(input())).notice, ESTIMATE_NOTICE);
  assert.match(ESTIMATE_NOTICE, /estimate until a factory confirms/);
});

test("what a customer sees has the price and timing but no cost, tier or margin", () => {
  const result = estimate(
    input({
      finishes: [{ name: "Matte", chargeType: "per_piece", amount: 0.06 }],
      tooling: [{ name: "Die", cost: 120 }],
      leadTime: { proofDays: 5, productionDays: 15 },
    })
  );
  const view = customerView(result);
  assert.ok(view);
  assert.deepEqual(Object.keys(view).sort(), ["currency", "excludes", "includes", "label", "leadDays", "notice", "perPiece", "quantity", "total"]);
  assert.equal(view.label, "Estimate");
  /* 600 + 30 matte + 120 die = 750; 750 / 0.65 = 1153.85 */
  assert.equal(view.total, 1153.85);
  assert.equal(view.leadDays, 20);

  const text = JSON.stringify(view).toLowerCase();
  for (const secret of ["margin", "cost", "tier", "default", "die", "matte"]) {
    assert.ok(!text.includes(secret), `the customer view must not mention ${secret}`);
  }
});

test("a refused estimate gives the customer nothing to show", () => {
  assert.equal(customerView(estimate(input({ margins: [] }))), null);
  assert.equal(customerView(estimate(input({ quantity: 10 }))), null);
});

test("the input is never changed", () => {
  const data = input({
    finishes: [{ name: "Matte", chargeType: "per_piece", amount: 0.06 }],
    tooling: [{ name: "Die", cost: 120 }],
    freight: seaFreight,
    shipment: { cbm: 3 },
    leadTime: { proofDays: 5, productionDays: 15 },
  });
  const copy = JSON.parse(JSON.stringify(data));
  estimate(data);
  assert.deepEqual(data, copy);
});

test("the selling price is never below the cost", () => {
  for (const margin of [0, 0.1, 0.35, 0.9]) {
    const result = ok(estimate(input({ margins: [{ name: "Test", margin }] })));
    assert.ok(result.sellTotal >= result.cost, `margin ${margin}`);
  }
});
