import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FACTORY_QUOTE_STATUSES,
  canDecide,
  checkDecision,
  decisionNoteRequired,
  factoryQuoteStatusLabel,
  isFactoryQuoteStatus,
  isFinal,
  quoteTotal,
  teamDecisions,
} from "../lib/factoryQuote.ts";

/* Every amount here is made up to prove the rules. None of it is a price. */

test("the four statuses are the ones the database knows", () => {
  assert.deepEqual([...FACTORY_QUOTE_STATUSES], ["submitted", "approved", "rejected", "superseded"]);
  assert.equal(isFactoryQuoteStatus("approved"), true);
  assert.equal(isFactoryQuoteStatus("Approved"), false);
  assert.equal(isFactoryQuoteStatus("draft"), false);
  assert.equal(isFactoryQuoteStatus(null), false);
});

test("a quote that is waiting can be approved or rejected, nothing else", () => {
  assert.deepEqual(teamDecisions("submitted"), ["approved", "rejected"]);
  assert.equal(canDecide("submitted", "approved"), true);
  assert.equal(canDecide("submitted", "rejected"), true);
  assert.equal(canDecide("submitted", "superseded"), false, "a person never marks a quote replaced");
  assert.equal(canDecide("submitted", "submitted"), false);
  assert.equal(canDecide("submitted", "deleted"), false);
});

test("an approved, rejected or replaced quote is final", () => {
  for (const status of ["approved", "rejected", "superseded"] as const) {
    assert.equal(isFinal(status), true, status);
    assert.deepEqual(teamDecisions(status), [], status);
    assert.equal(canDecide(status, "approved"), false, status);
    assert.equal(canDecide(status, "rejected"), false, status);
  }
  assert.equal(isFinal("submitted"), false);
});

test("only a rejection needs a reason", () => {
  assert.equal(decisionNoteRequired("rejected"), true);
  assert.equal(decisionNoteRequired("approved"), false);
});

test("a decision is checked before it is sent, with a plain sentence when it is refused", () => {
  assert.deepEqual(checkDecision("submitted", "approved", null), { ok: true, status: "approved", note: null });
  assert.deepEqual(checkDecision("submitted", "approved", "  Looks good  "), { ok: true, status: "approved", note: "Looks good" });
  assert.deepEqual(checkDecision("submitted", "rejected", "Too high"), { ok: true, status: "rejected", note: "Too high" });

  const noReason = checkDecision("submitted", "rejected", "   ");
  assert.equal(noReason.ok, false);
  assert.match(!noReason.ok ? noReason.message : "", /reason/);

  const late = checkDecision("approved", "rejected", "changed my mind");
  assert.equal(late.ok, false);
  assert.match(!late.ok ? late.message : "", /already been decided/);

  const odd = checkDecision("submitted", "superseded", "x");
  assert.equal(odd.ok, false);

  const long = checkDecision("submitted", "approved", "x".repeat(2001));
  assert.equal(long.ok, false);
});

test("the total is quantity x price + tooling, to the cent, like the database", () => {
  assert.equal(quoteTotal(500, 1.1, 100), 650);
  assert.equal(quoteTotal(500, 1.1), 550);
  assert.equal(quoteTotal(3, 0.1), 0.3, "small decimals do not drift");
  assert.equal(quoteTotal(700, 0.0333, 119.99), 143.3);
  assert.equal(quoteTotal(1, 0.005), 0.01, "half a cent rounds up, as numeric does");
  assert.equal(quoteTotal(200, 0), 0);
});

test("a total is never worked out from numbers the database would refuse", () => {
  assert.equal(quoteTotal(0, 1), null);
  assert.equal(quoteTotal(-5, 1), null);
  assert.equal(quoteTotal(1.5, 1), null);
  assert.equal(quoteTotal(500, -1), null);
  assert.equal(quoteTotal(500, 1, -1), null);
  assert.equal(quoteTotal(500, Number.NaN), null);
  assert.equal(quoteTotal(Infinity, 1), null);
});

test("the wording is plain, differs for the factory and the team, and has no raw codes", () => {
  for (const status of FACTORY_QUOTE_STATUSES) {
    for (const audience of ["team", "factory"] as const) {
      const text = factoryQuoteStatusLabel(status, audience);
      assert.ok(text && !text.includes("_") && text === text.trim(), `${status} ${audience}: ${text}`);
    }
  }
  assert.equal(factoryQuoteStatusLabel("submitted", "factory"), "Waiting for DYE CUT LAB");
  assert.equal(factoryQuoteStatusLabel("submitted", "team"), "Needs your review");
  assert.equal(factoryQuoteStatusLabel("rejected", "factory"), "Not accepted");
  assert.equal(factoryQuoteStatusLabel("rejected", "team"), "Rejected");
});

import { QUOTE_OPEN_STATUSES, canQuoteInStatus, parseFactoryQuote, quoteDatabaseMessage } from "../lib/factoryQuote.ts";

function parse(values: Record<string, string>) {
  return parseFactoryQuote((name) => values[name]);
}

test("a factory can quote while a project is being priced, and not after it has moved on", () => {
  assert.deepEqual([...QUOTE_OPEN_STATUSES], ["development", "quote_ready", "factory_review"]);
  for (const status of ["development", "quote_ready", "factory_review", " Factory_Review "]) assert.equal(canQuoteInStatus(status), true, status);
  for (const status of ["lead", "approved", "payment", "proof", "production", "qc", "shipping", "delivered", "", null, undefined]) {
    assert.equal(canQuoteInStatus(status), false, String(status));
  }
});

test("a good quote form becomes the numbers the database wants", () => {
  const result = parse({ quantity: "1,000", price_per_piece: "$1.1", tooling_cost: "120.5", lead_days: "30", notes: "  Includes matte lamination  " });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.value, { quantity: 1000, price_per_piece: 1.1, tooling_cost: 120.5, lead_days: 30, notes: "Includes matte lamination" });
});

test("tooling, lead time and notes are optional", () => {
  const result = parse({ quantity: "500", price_per_piece: "2" });
  assert.deepEqual(result.ok && result.value, { quantity: 500, price_per_piece: 2, tooling_cost: 0, lead_days: null, notes: null });
});

test("amounts are rounded to the database decimals", () => {
  const result = parse({ quantity: "10", price_per_piece: "1.23456", tooling_cost: "10.999" });
  assert.equal(result.ok && result.value.price_per_piece, 1.2346);
  assert.equal(result.ok && result.value.tooling_cost, 11);
});

test("the quantity must be a whole number of at least one", () => {
  for (const quantity of ["", "0", "-5", "1.5", "abc", "1e3", "99999999"]) {
    const result = parse({ quantity, price_per_piece: "1" });
    assert.equal(result.ok, false, quantity);
    assert.match(!result.ok ? result.message : "", /quantity/i, quantity);
  }
});

test("the price per piece must be a positive number", () => {
  for (const price of ["", "abc", "-1", "0", "0.00", "1e3", "5000000"]) {
    const result = parse({ quantity: "100", price_per_piece: price });
    assert.equal(result.ok, false, price);
    assert.match(!result.ok ? result.message : "", /price/i, price);
  }
});

test("a broken tooling cost, lead time or note is refused, and an empty one is fine", () => {
  assert.equal(parse({ quantity: "100", price_per_piece: "1", tooling_cost: "abc" }).ok, false);
  assert.equal(parse({ quantity: "100", price_per_piece: "1", tooling_cost: "-5" }).ok, false);
  assert.equal(parse({ quantity: "100", price_per_piece: "1", lead_days: "2.5" }).ok, false);
  assert.equal(parse({ quantity: "100", price_per_piece: "1", lead_days: "-3" }).ok, false);
  assert.equal(parse({ quantity: "100", price_per_piece: "1", lead_days: "5000" }).ok, false);
  assert.equal(parse({ quantity: "100", price_per_piece: "1", notes: "x".repeat(2001) }).ok, false);
  assert.equal(parse({ quantity: "100", price_per_piece: "1", lead_days: "0" }).ok, true, "zero days is allowed");
});

test("the form cannot carry a status, a factory, a version or a total", () => {
  const result = parse({ quantity: "100", price_per_piece: "1", status: "approved", factory_id: "x", version: "9", total: "1" });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.ok ? result.value : {}).sort(), ["lead_days", "notes", "price_per_piece", "quantity", "tooling_cost"]);
});

test("a database refusal becomes a plain sentence and never leaks the database words", () => {
  assert.match(quoteDatabaseMessage({ code: "42501" }), /assigned to your factory/);
  assert.match(quoteDatabaseMessage({ code: "23514" }), /refused/);
  for (const error of [{ code: "XX000" }, null, undefined]) {
    const text = quoteDatabaseMessage(error);
    assert.ok(!/relation|constraint|factory_quotes|violates/.test(text), text);
  }
});
