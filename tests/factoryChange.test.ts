import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHANGE_KINDS,
  CHANGE_KIND_LABELS,
  changeDatabaseMessage,
  changeKindLabel,
  isChangeKind,
  parseFactoryChange,
} from "../lib/factoryChange.ts";
import { buildFactoryQuoteAlert } from "../lib/factoryQuoteAlert.ts";

function parse(values: Record<string, string>) {
  return parseFactoryChange((name) => values[name]);
}

test("the kinds of change are the ones the database knows, each with a plain label", () => {
  assert.deepEqual([...CHANGE_KINDS], ["artwork", "price", "material", "finish", "timing", "other"]);
  for (const kind of CHANGE_KINDS) {
    assert.ok(CHANGE_KIND_LABELS[kind] && !CHANGE_KIND_LABELS[kind].includes("_"), kind);
    assert.equal(changeKindLabel(kind), CHANGE_KIND_LABELS[kind]);
  }
  assert.equal(changeKindLabel("material"), "Material");
  assert.equal(changeKindLabel("other"), "Something else");
  assert.equal(changeKindLabel("legacy"), "legacy");
  assert.equal(changeKindLabel(null), "");
  assert.equal(isChangeKind("price"), true);
  assert.equal(isChangeKind("Price"), false);
  assert.equal(isChangeKind(undefined), false);
});

test("a good note becomes the three fields the database wants, with tidy spacing", () => {
  const result = parse({ kind: "material", what_changed: "  Changed from 350 gsm\n to 400 gsm  ", reason: "The 350 gsm   board is out of stock" });
  assert.deepEqual(result.ok && result.value, { kind: "material", what_changed: "Changed from 350 gsm to 400 gsm", reason: "The 350 gsm board is out of stock" });
});

test("the kind must be chosen from the list", () => {
  for (const kind of ["", "colour", "PRICE", " "]) {
    const result = parse({ kind, what_changed: "x", reason: "y" });
    assert.equal(result.ok, false, kind);
    assert.match(!result.ok ? result.message : "", /kind of change/);
  }
});

test("a note must say what changed and why", () => {
  const noWhat = parse({ kind: "price", what_changed: "   ", reason: "because" });
  assert.equal(noWhat.ok, false);
  assert.match(!noWhat.ok ? noWhat.message : "", /what changed/i);

  const noWhy = parse({ kind: "price", what_changed: "Raised the price", reason: "" });
  assert.equal(noWhy.ok, false);
  assert.match(!noWhy.ok ? noWhy.message : "", /why/i);
});

test("a very long note is refused, and the limit itself is allowed", () => {
  assert.equal(parse({ kind: "other", what_changed: "x".repeat(1001), reason: "y" }).ok, false);
  assert.equal(parse({ kind: "other", what_changed: "x", reason: "y".repeat(1001) }).ok, false);
  assert.equal(parse({ kind: "other", what_changed: "x".repeat(1000), reason: "y".repeat(1000) }).ok, true);
});

test("the form cannot carry a factory, a writer or a date", () => {
  const result = parse({ kind: "price", what_changed: "x", reason: "y", factory_id: "f", created_by: "u", created_at: "2020-01-01" });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.ok ? result.value : {}).sort(), ["kind", "reason", "what_changed"]);
});

test("a database refusal becomes a plain sentence and never leaks the database words", () => {
  assert.match(changeDatabaseMessage({ code: "42501" }), /assigned to your factory/);
  assert.match(changeDatabaseMessage({ code: "23514" }), /refused/);
  for (const error of [{ code: "XX000" }, null, undefined]) {
    const text = changeDatabaseMessage(error);
    assert.ok(!/relation|constraint|factory_change_notes|violates/.test(text), text);
  }
});

test("the team's quote alert names the factory, the project and the amounts", () => {
  const alert = buildFactoryQuoteAlert({
    projectNumber: "DCL-00031",
    projectTitle: "Gift boxes",
    factoryName: "Test Factory",
    version: 2,
    quantity: 500,
    pricePerPiece: 1.1,
    total: 650,
    leadDays: 30,
  });
  assert.equal(alert.headline, "Test Factory sent a quote for DCL-00031");
  assert.deepEqual(alert.rows, [
    { label: "Project", value: "DCL-00031 · Gift boxes" },
    { label: "Quote", value: "Version 2 · $650.00" },
    { label: "Price", value: "500 pcs × $1.10 per piece" },
    { label: "Lead time", value: "30 days" },
  ]);
  assert.match(alert.footer, /Nothing goes to the customer until you review it/);
});

test("the alert leaves out what is missing and never shows a blank name", () => {
  const alert = buildFactoryQuoteAlert({
    projectNumber: "DCL-00031",
    projectTitle: "  ",
    factoryName: "  ",
    version: 1,
    quantity: 1000,
    pricePerPiece: 0.0333,
    total: 33.3,
    leadDays: null,
  });
  assert.equal(alert.headline, "A factory sent a quote for DCL-00031");
  assert.equal(alert.rows[0].value, "DCL-00031 · Untitled project");
  assert.equal(alert.rows.length, 3, "no lead time row when it is unknown");
  assert.match(alert.rows[2].value, /\$0\.0333 per piece/);
});
