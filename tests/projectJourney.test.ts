import { test } from "node:test";
import assert from "node:assert/strict";
import { JOURNEY_STEPS, REQUEST_STEPS, customerStatusLabel, journeyStepIndex, nextStepFor, requestInfoFor } from "../lib/projectJourney.ts";
import { PROJECT_STATUSES } from "../app/admin/statuses.ts";
import { ESTIMATES_IN_APP, PROOFS_IN_APP } from "../lib/siteFlags.ts";

test("every project status belongs to exactly one customer step", () => {
  for (const status of PROJECT_STATUSES) {
    const homes = JOURNEY_STEPS.filter((step) => step.statuses.includes(status));
    assert.equal(homes.length, 1, `${status} should sit in exactly one step`);
  }
});

test("statuses map to the right step, and unknown ones fall back to the first", () => {
  const expected: Record<string, number> = {
    lead: 0, development: 0,
    quote_ready: 1, factory_review: 1, approved: 1,
    payment: 2, proof: 2,
    production: 3, qc: 3,
    shipping: 4, delivered: 4,
  };
  for (const [status, step] of Object.entries(expected)) {
    assert.equal(journeyStepIndex(status), step, status);
  }
  assert.equal(journeyStepIndex("legacy-value"), 0);
  assert.equal(journeyStepIndex(null), 0);
  assert.equal(journeyStepIndex(undefined), 0);
});

test("every stage has a plain customer name, different from the team's jargon", () => {
  const seen = new Set<string>();
  for (const status of PROJECT_STATUSES) {
    const label = customerStatusLabel(status);
    assert.ok(label && !label.includes("_"), `${status} -> ${label}`);
    seen.add(label);
  }
  assert.equal(seen.size, PROJECT_STATUSES.length, "no two stages share a name");
  assert.equal(customerStatusLabel("lead"), "Request received");
  assert.equal(customerStatusLabel("production"), "Being made");
  assert.equal(customerStatusLabel("LEAD"), "Request received", "case does not matter");
});

test("unknown or empty stages still read sensibly for a customer", () => {
  assert.equal(customerStatusLabel(null), "In progress");
  assert.equal(customerStatusLabel(undefined), "In progress");
  assert.equal(customerStatusLabel("   "), "In progress");
  assert.equal(customerStatusLabel("legacy_value"), "Legacy value");
});

test("no stage offers a button for something that does not exist in the app yet", () => {
  /* While estimates and proofs are sent by text (lib/siteFlags.ts), the customer
     is not asked to open anything. Flip ESTIMATES_IN_APP / PROOFS_IN_APP when the
     views are built and this expectation changes with them. */
  const action = PROJECT_STATUSES.filter((s) => nextStepFor(s).tone === "action");
  const expected = [ESTIMATES_IN_APP ? "quote_ready" : null, PROOFS_IN_APP ? "proof" : null].filter(Boolean);
  assert.deepEqual(action, expected);
  for (const status of action) assert.ok(nextStepFor(status).cta, `${status} needs a button label`);
});

test("while estimates and proofs go out by text, those stages say so", () => {
  if (!ESTIMATES_IN_APP) {
    assert.match(nextStepFor("quote_ready").detail, /by text/);
    assert.equal(nextStepFor("quote_ready").cta, undefined);
  }
  if (!PROOFS_IN_APP) {
    assert.match(nextStepFor("proof").detail, /by text/);
    assert.equal(nextStepFor("proof").cta, undefined);
  }
});

test("every real status has its own message, not the generic fallback", () => {
  for (const status of PROJECT_STATUSES) {
    assert.notEqual(nextStepFor(status).headline, "In progress", `${status} has no specific message`);
  }
});

test("an estimate is never described as factory-approved", () => {
  const text = nextStepFor("quote_ready").detail.toLowerCase();
  assert.ok(text.includes("estimate"));
  assert.ok(text.includes("until a factory confirms"));
});

test("request statuses run received to confirmed, and lost is closed", () => {
  assert.equal(REQUEST_STEPS.length, 4);
  assert.deepEqual(["new", "contacted", "quoted", "won"].map((s) => requestInfoFor(s).step), [0, 1, 2, 3]);
  assert.equal(requestInfoFor("lost").step, -1);
  assert.equal(requestInfoFor("anything-else").step, 0);
});
