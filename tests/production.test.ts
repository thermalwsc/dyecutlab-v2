import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustQuantityForFlavors, calculateProduction, productionRuleText, roundOrderQuantity, unitsForPieces } from "../lib/production.ts";

/* The client's own examples (Oct 15, 2026): 5 units is 700, 10 units is 1,300. */
test("the client's examples", () => {
  assert.equal(calculateProduction(5).total, 700);
  assert.equal(calculateProduction(10).total, 1300);
  assert.deepEqual(calculateProduction(1), { rawPieces: 128, total: 200, perFlavor: 0 });
});

test("a unit is 128 pieces and the whole order rounds up to the next 100", () => {
  assert.equal(calculateProduction(2).total, 300, "256 pieces");
  assert.equal(calculateProduction(9).total, 1200, "1,152 pieces");
  assert.equal(calculateProduction(500).total, 64000, "exactly 64,000 pieces");
  for (const units of [1, 2, 3, 7, 33, 250, 999]) {
    const { rawPieces, total } = calculateProduction(units);
    assert.equal(rawPieces, units * 128);
    assert.equal(total % 100, 0, "bulk orders are multiples of 100");
    assert.ok(total >= rawPieces, `${units} units must not be ordered below ${rawPieces}`);
    assert.ok(total - rawPieces < 100, "rounds up by less than one increment");
  }
});

test("with flavors every flavor is a whole multiple of 100", () => {
  assert.deepEqual(calculateProduction(1, 2), { rawPieces: 128, total: 200, perFlavor: 100 });
  assert.deepEqual(calculateProduction(1, 3), { rawPieces: 128, total: 300, perFlavor: 100 });
  assert.deepEqual(calculateProduction(10, 4), { rawPieces: 1280, total: 1600, perFlavor: 400 });
  for (const flavors of [1, 2, 3, 5, 8]) {
    const { rawPieces, total, perFlavor } = calculateProduction(7, flavors);
    assert.equal(perFlavor % 100, 0);
    assert.equal(perFlavor * flavors, total);
    assert.ok(total >= rawPieces);
  }
});

test("flavors not known yet means no per-flavor split", () => {
  assert.equal(calculateProduction(4, 0).perFlavor, 0);
  assert.equal(calculateProduction(4, null).perFlavor, 0);
  assert.equal(calculateProduction(4, undefined).perFlavor, 0);
  assert.equal(calculateProduction(4, 0).total, calculateProduction(4).total);
});

test("nothing usable gives zeros", () => {
  for (const bad of [0, -1, null, undefined, NaN, Infinity]) {
    assert.deepEqual(calculateProduction(bad as never, 2), { rawPieces: 0, total: 0, perFlavor: 0 }, String(bad));
  }
});

test("the helpers behave on their own", () => {
  assert.equal(roundOrderQuantity(128), 200);
  assert.equal(roundOrderQuantity(200), 200);
  assert.equal(roundOrderQuantity(201), 300);
  assert.deepEqual(adjustQuantityForFlavors(128, 0), { total: 200, perFlavor: 200 }, "0 flavors counts as 1");
  assert.deepEqual(adjustQuantityForFlavors(128, 2.9), { total: 200, perFlavor: 100 }, "fractions round down to 2");
});

test("pieces turn into the smallest number of units that covers them", () => {
  assert.equal(unitsForPieces(200), 1);
  assert.equal(unitsForPieces(300), 2);
  assert.equal(unitsForPieces(1000), 8);
  assert.equal(unitsForPieces(150), 1);
  assert.equal(unitsForPieces(10), 1);
  for (const bad of [0, -5, null, undefined, NaN, Infinity]) assert.equal(unitsForPieces(bad as never), 0, String(bad));

  /* brute force: the formula must agree with "smallest n whose total is enough" */
  for (let pieces = 1; pieces <= 5000; pieces++) {
    let n = 1;
    while (calculateProduction(n).total < pieces) n++;
    assert.equal(unitsForPieces(pieces), n, `${pieces} pieces`);
  }
});

test("the rule told to the AI matches what the code does", () => {
  const text = productionRuleText();
  assert.match(text, /1 unit = 128 pieces, ordered as 200/);
  assert.match(text, /5 units = 640 pieces, ordered as 700/);
  assert.match(text, /10 units = 1,280 pieces, ordered as 1,300/);
  assert.match(text, /1 unit with 3 flavors = 300/);
  assert.match(text, /200 pieces = 1 unit, 300 pieces = 2 units, 1,000 pieces = 8 units/);
});
