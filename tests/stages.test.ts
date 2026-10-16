import { test } from "node:test";
import assert from "node:assert/strict";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, projectStatusLabel } from "../app/admin/statuses.ts";
import { FACTORY_MOVES, factoryNextFor } from "../lib/factoryWork.ts";
import { JOURNEY_STEPS, customerStatusLabel, journeyStepIndex, nextStepFor } from "../lib/projectJourney.ts";
import { describeActivity } from "../lib/projectActivity.ts";

/* One stage list, four views of it (the team, the factory, the customer's steps
   and the customer's wording). These tests keep them from drifting apart. */

test("every stage has a team name, a customer name, a customer message and a factory message", () => {
  for (const status of PROJECT_STATUSES) {
    assert.ok(PROJECT_STATUS_LABELS[status], `${status}: team name`);
    assert.ok(customerStatusLabel(status) && !customerStatusLabel(status).includes("_"), `${status}: customer name`);
    assert.notEqual(nextStepFor(status).headline, "In progress", `${status}: customer message`);
    assert.notEqual(factoryNextFor(status).headline, "In progress", `${status}: factory message`);
  }
});

test("the customer's steps list the stages in the same order as the stage list", () => {
  const flattened = JOURNEY_STEPS.flatMap((step) => step.statuses);
  assert.deepEqual(flattened, [...PROJECT_STATUSES]);
});

test("a later stage never lands in an earlier customer step", () => {
  let last = 0;
  for (const status of PROJECT_STATUSES) {
    const step = journeyStepIndex(status);
    assert.ok(step >= last, `${status} went backwards to step ${step}`);
    last = step;
  }
});

test("the factory can only move a project one stage forward, and only from the floor stages", () => {
  for (const [from, move] of Object.entries(FACTORY_MOVES)) {
    const fromIndex = PROJECT_STATUSES.indexOf(from as (typeof PROJECT_STATUSES)[number]);
    const toIndex = PROJECT_STATUSES.indexOf(move.to as (typeof PROJECT_STATUSES)[number]);
    assert.ok(fromIndex >= 0 && toIndex >= 0, `${from} -> ${move.to} must be real stages`);
    assert.equal(toIndex, fromIndex + 1, `${from} -> ${move.to} must be the very next stage`);
    assert.ok(["production", "qc"].includes(from), "only production and quality check are the factory's");
    assert.ok(move.button && move.note && move.ok);
  }
});

test("the factory can never mark a project paid, approved or delivered", () => {
  const targets = Object.values(FACTORY_MOVES).map((move) => move.to);
  for (const forbidden of ["approved", "payment", "proof", "delivered", "quote_ready", "factory_review"]) {
    assert.ok(!targets.includes(forbidden), `a factory must not be able to move to ${forbidden}`);
  }
});

test("every possible move reads well in the Activity tab, for the team and for customers", () => {
  for (let i = 0; i < PROJECT_STATUSES.length - 1; i++) {
    const row = {
      id: String(i),
      kind: "status_change",
      from_status: PROJECT_STATUSES[i],
      to_status: PROJECT_STATUSES[i + 1],
      actor_role: "dcl_staff",
      created_at: "2026-10-15T00:00:00.000Z",
    };
    for (const label of [projectStatusLabel, customerStatusLabel]) {
      const text = describeActivity(row, label);
      assert.ok(text.startsWith("Moved from "), text);
      assert.ok(!text.includes("_"), `no raw stage codes: ${text}`);
    }
  }
});

test("the customer wording makes no promise the app cannot keep yet", () => {
  for (const status of PROJECT_STATUSES) {
    const { headline, detail } = nextStepFor(status);
    const text = `${headline} ${detail}`.toLowerCase();
    assert.ok(!text.includes("factory-approved") && !text.includes("guaranteed"), `${status}: ${text}`);
  }
});
