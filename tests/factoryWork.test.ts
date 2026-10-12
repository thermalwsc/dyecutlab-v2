import { test } from "node:test";
import assert from "node:assert/strict";
import { FACTORY_MESSAGES, FACTORY_MOVES, factoryMoveFor, factoryNextFor } from "../lib/factoryWork.ts";
import { PROJECT_STATUSES } from "../app/admin/statuses.ts";

/* A factory may only do the two floor steps. These tests fail if anyone ever
   widens that, for example by letting a factory approve a quote or mark paid. */

test("a factory can move production to quality check, and quality check to shipping", () => {
  assert.equal(factoryMoveFor("production")?.to, "qc");
  assert.equal(factoryMoveFor("qc")?.to, "shipping");
});

test("every other status gives a factory no move at all", () => {
  const allowed = new Set(Object.keys(FACTORY_MOVES));
  for (const status of PROJECT_STATUSES) {
    if (allowed.has(status)) continue;
    assert.equal(factoryMoveFor(status), null, `${status} must not offer a factory move`);
  }
  for (const odd of ["", null, undefined, "paid", "delivered-ish"]) {
    assert.equal(factoryMoveFor(odd as string | null | undefined), null);
  }
});

test("status names are matched ignoring capitals", () => {
  assert.equal(factoryMoveFor("PRODUCTION")?.to, "qc");
});

test("a factory can never reach quote, payment, proof, approval or delivered", () => {
  const forbidden = ["lead", "development", "quote_ready", "factory_review", "approved", "payment", "proof", "delivered"];
  for (const move of Object.values(FACTORY_MOVES)) {
    assert.ok(!forbidden.includes(move.to), `${move.to} is not a factory step`);
  }
});

test("each move goes exactly one step forward in the blueprint order", () => {
  for (const [from, move] of Object.entries(FACTORY_MOVES)) {
    const a = PROJECT_STATUSES.indexOf(from as (typeof PROJECT_STATUSES)[number]);
    const b = PROJECT_STATUSES.indexOf(move.to as (typeof PROJECT_STATUSES)[number]);
    assert.ok(a >= 0 && b >= 0, "both statuses are real project statuses");
    assert.equal(b - a, 1, `${from} -> ${move.to} must be the next stage`);
  }
});

test("every move has a confirmation message", () => {
  for (const move of Object.values(FACTORY_MOVES)) {
    assert.ok(FACTORY_MESSAGES[move.ok], `missing message for ${move.ok}`);
  }
  for (const code of ["stale", "save_failed", "not_found", "invalid", "rate_limited", "no_service_key"]) {
    assert.ok(FACTORY_MESSAGES[code], `missing message for ${code}`);
  }
});

test("the factory home flags only the stages that are on the factory", () => {
  const action = PROJECT_STATUSES.filter((s) => factoryNextFor(s).tone === "action");
  assert.deepEqual(action, ["factory_review", "proof", "production", "qc"]);
  assert.equal(factoryNextFor("delivered").tone, "done");
  assert.equal(factoryNextFor("something-new").headline, "In progress");
});

test("factory wording never mentions customer details", () => {
  for (const status of PROJECT_STATUSES) {
    const text = JSON.stringify(factoryNextFor(status)).toLowerCase();
    assert.ok(!/(email|phone|customer's name)/.test(text), `${status} copy leaks customer details`);
  }
});
