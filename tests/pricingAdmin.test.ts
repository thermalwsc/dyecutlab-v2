import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRICING_TABLES,
  databaseErrorMessage,
  fieldValue,
  findPricingTable,
  parsePricingRow,
  percentText,
  usd,
} from "../lib/pricingAdmin.ts";

/* Every amount here is made up to prove the form checks. None of it is a price. */

function table(key: string) {
  const def = findPricingTable(key);
  assert.ok(def, key);
  return def;
}

function parse(key: string, values: Record<string, string>, productIds: string[] = []) {
  return parsePricingRow(table(key), (name) => values[name], productIds);
}

test("only the listed pricing tables can be reached, and each maps to its own database table", () => {
  assert.deepEqual(
    PRICING_TABLES.map((def) => def.table),
    ["pricing_products", "pricing_product_tiers", "pricing_finishes", "pricing_tooling", "pricing_freight", "pricing_margins", "pricing_lead_times"]
  );
  assert.equal(findPricingTable("profiles"), null);
  assert.equal(findPricingTable("pricing_products"), null, "the browser sends a key, never a table name");
  assert.equal(findPricingTable(undefined), null);
  assert.equal(new Set(PRICING_TABLES.map((def) => def.key)).size, PRICING_TABLES.length);
});

test("a product needs a name, and text is trimmed and kept short", () => {
  const missing = parse("products", { product: "   " });
  assert.equal(missing.ok, false);
  assert.match(!missing.ok ? missing.message : "", /Product/);

  const good = parse("products", { product: "  Box  ", style: " Mailer ", min_order: "200", active: "on" });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.row.product, "Box");
    assert.equal(good.row.style, "Mailer");
    assert.equal(good.row.min_order, 200);
    assert.equal(good.row.material, null);
    assert.equal(good.row.active, true);
  }

  const long = parse("products", { product: "x".repeat(121) });
  assert.equal(long.ok, false);
});

test("whole numbers must be whole and at least their minimum", () => {
  assert.equal(parse("products", { product: "Box", min_order: "0" }).ok, false, "smallest order of 0 is meaningless");
  assert.equal(parse("products", { product: "Box", min_order: "12.5" }).ok, false);
  assert.equal(parse("products", { product: "Box", min_order: "abc" }).ok, false);
  assert.equal(parse("products", { product: "Box", min_order: "-5" }).ok, false);
  assert.equal(parse("products", { product: "Box", min_order: "1,000" }).ok, true, "thousands commas are fine");
  assert.equal(parse("tooling", { name: "Die", cost: "10", production_days: "0" }).ok, true, "zero days is allowed");
});

test("money accepts dollar signs and commas, and is rounded to the table's decimals", () => {
  const tooling = parse("tooling", { name: "Die", cost: "$1,234.567" });
  assert.equal(tooling.ok && tooling.row.cost, 1234.57);

  const finish = parse("finishes", { name: "Matte", charge_type: "per_piece", amount: "0.03333" });
  assert.equal(finish.ok && finish.row.amount, 0.0333);

  assert.equal(parse("tooling", { name: "Die", cost: "-5" }).ok, false);
  assert.equal(parse("tooling", { name: "Die", cost: "" }).ok, false, "required");
  assert.equal(parse("tooling", { name: "Die", cost: "12abc" }).ok, false);
  assert.equal(parse("tooling", { name: "Die", cost: "99999999" }).ok, false, "too large");
});

test("a margin is typed as a percent and stored as a fraction", () => {
  const good = parse("margins", { name: "Default", margin: "35" });
  assert.equal(good.ok && good.row.margin, 0.35);

  const withSign = parse("margins", { name: "Default", margin: "12.5%" });
  assert.equal(withSign.ok && withSign.row.margin, 0.125);

  assert.equal(parse("margins", { name: "Default", margin: "0" }).ok, true);
  assert.equal(parse("margins", { name: "Default", margin: "94.99" }).ok, true);
  assert.equal(parse("margins", { name: "Default", margin: "95" }).ok, false);
  assert.equal(parse("margins", { name: "Default", margin: "-1" }).ok, false);
  assert.equal(parse("margins", { name: "Default", margin: "" }).ok, false);
});

test("a margin quantity range cannot end before it starts", () => {
  assert.equal(parse("margins", { name: "Range", margin: "20", min_quantity: "500", max_quantity: "100" }).ok, false);
  assert.equal(parse("margins", { name: "Range", margin: "20", min_quantity: "100", max_quantity: "500" }).ok, true);
  assert.equal(parse("margins", { name: "Range", margin: "20", min_quantity: "100", max_quantity: "100" }).ok, true);
  assert.equal(parse("margins", { name: "Range", margin: "20", max_quantity: "100" }).ok, true);
});

test("choices must be one of the listed values", () => {
  assert.equal(parse("finishes", { name: "Foil", charge_type: "per_kilo", amount: "1" }).ok, false);
  assert.equal(parse("finishes", { name: "Foil", charge_type: "", amount: "1" }).ok, false);
  assert.equal(parse("finishes", { name: "Foil", charge_type: "per_order", amount: "25" }).ok, true);

  const freight = { method: "sea", destination: "US West Coast", charged_by: "cubic_metre", rate: "95" };
  assert.equal(parse("freight", freight).ok, true);
  assert.equal(parse("freight", { ...freight, method: "rail" }).ok, false);
  assert.equal(parse("freight", { ...freight, charged_by: "weight" }).ok, false);
});

test("a price level must point at a real product", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const values = { product_id: id, min_quantity: "200", price_per_piece: "1.80" };
  assert.equal(parse("tiers", values, [id]).ok, true);
  assert.equal(parse("tiers", values, []).ok, false);
  assert.equal(parse("tiers", { ...values, product_id: "someone-elses" }, [id]).ok, false);
  assert.equal(parse("tiers", { ...values, min_quantity: "0" }, [id]).ok, false);
});

test("a switch is on only when it was sent as on", () => {
  const on = parse("tooling", { name: "Die", cost: "10", reusable: "on" });
  assert.equal(on.ok && on.row.reusable, true);
  const off = parse("tooling", { name: "Die", cost: "10" });
  assert.equal(off.ok && off.row.reusable, false, "an unticked box sends nothing");
});

test("the form shows a margin as a percent again", () => {
  const margin = table("margins").fields.find((field) => field.name === "margin")!;
  assert.equal(fieldValue(margin, 0.35), "35");
  assert.equal(fieldValue(margin, "0.125"), "12.5");
  assert.equal(fieldValue(margin, null), "");
  const cost = table("tooling").fields.find((field) => field.name === "cost")!;
  assert.equal(fieldValue(cost, 120), "120");
});

test("money and percent read well in the list", () => {
  assert.equal(usd(1.8), "$1.80");
  assert.equal(usd("0.0333"), "$0.0333");
  assert.equal(usd(1234.5), "$1,234.50");
  assert.equal(usd(null), "");
  assert.equal(percentText(0.35), "35%");
  assert.equal(percentText("0.125"), "12.5%");
  assert.equal(percentText(undefined), "");
});

test("each row reads as a title and a detail line", () => {
  const product = table("products");
  assert.equal(product.title({ product: "Box", style: "Mailer" }, {}), "Box · Mailer");
  assert.match(product.detail({ material: "350 gsm", min_order: 200, active: false }), /Switched off/);

  const tier = table("tiers");
  assert.equal(tier.title({ product_id: "p1", min_quantity: 500 }, { p1: "Box" }), "Box: from 500 pcs");
  assert.equal(tier.detail({ price_per_piece: 1.2 }), "$1.20 per piece");

  const margin = table("margins");
  assert.equal(margin.title({ name: "Default", applies_to: null }, {}), "Default · all products");
  assert.equal(margin.detail({ margin: 0.35, min_quantity: 200, max_quantity: null }), "35% · 200 pcs to any");

  const freight = table("freight");
  assert.equal(freight.title({ method: "sea", destination: "US West Coast" }, {}), "Sea to US West Coast");
  assert.match(freight.detail({ rate: 95, charged_by: "cubic_metre", min_charge: 150, transit_days: 30 }), /\$95\.00 per cubic metre · min \$150\.00 · transit 30 d/);
});

test("a database refusal becomes one plain sentence and never leaks the database's own words", () => {
  assert.match(databaseErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "x"' }), /already exists/);
  assert.match(databaseErrorMessage({ code: "23514" }), /refused/);
  assert.match(databaseErrorMessage({ code: "42501" }), /access/);
  for (const error of [{ code: "XX000", message: "relation pricing_products does not exist" }, null, undefined]) {
    const text = databaseErrorMessage(error);
    assert.ok(!/relation|constraint|pricing_/.test(text), text);
  }
});
