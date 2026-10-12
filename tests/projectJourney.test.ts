import { test } from "node:test";
import assert from "node:assert/strict";
import { JOURNEY_STEPS, REQUEST_STEPS, journeyStepIndex, nextStepFor, requestInfoFor } from "../lib/projectJourney.ts";
import { PROJECT_STATUSES } from "../app/admin/statuses.ts";

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

test("the customer only has something to do at the estimate and the proof", () => {
  const action = PROJECT_STATUSES.filter((s) => nextStepFor(s).tone === "action");
  assert.deepEqual(action, ["quote_ready", "proof"]);
  for (const status of action) assert.ok(nextStepFor(status).cta, `${status} needs a button label`);
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
