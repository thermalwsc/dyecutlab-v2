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
