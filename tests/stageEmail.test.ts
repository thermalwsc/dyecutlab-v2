import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROJECT_STATUSES } from "../app/admin/statuses.ts";
import { FACTORY_MOVES } from "../lib/factoryWork.ts";
import { buildStageEmail, shouldEmailStageChange } from "../lib/stageEmail.ts";

test("a step forward to a stage the customer cares about is emailed", () => {
  assert.equal(shouldEmailStageChange("development", "quote_ready"), true);
  assert.equal(shouldEmailStageChange("approved", "payment"), true);
  assert.equal(shouldEmailStageChange("production", "qc"), true);
  assert.equal(shouldEmailStageChange("qc", "shipping"), true);
  assert.equal(shouldEmailStageChange("shipping", "delivered"), true);
});

test("jumping several stages ahead is emailed once, as the stage it landed on", () => {
  assert.equal(shouldEmailStageChange("development", "production"), true);
});

test("the early stages are not emailed, the customer is chatting then", () => {
  assert.equal(shouldEmailStageChange(null, "lead"), false);
  assert.equal(shouldEmailStageChange("lead", "development"), false);
});

test("a correction backwards or no change never sends an email", () => {
  assert.equal(shouldEmailStageChange("production", "approved"), false);
  assert.equal(shouldEmailStageChange("qc", "production"), false);
  assert.equal(shouldEmailStageChange("proof", "proof"), false);
});

test("an unknown or missing stage is handled safely", () => {
  assert.equal(shouldEmailStageChange("legacy", "quote_ready"), true, "an unknown starting point counts as before the start");
  assert.equal(shouldEmailStageChange("approved", "legacy"), false);
  assert.equal(shouldEmailStageChange("approved", null), false);
  assert.equal(shouldEmailStageChange(undefined, undefined), false);
  assert.equal(shouldEmailStageChange("DEVELOPMENT", "QUOTE_READY"), true, "case does not matter");
});

test("both of the factory's moves are emailed", () => {
  for (const [from, move] of Object.entries(FACTORY_MOVES)) {
    assert.equal(shouldEmailStageChange(from, move.to), true, `${from} -> ${move.to}`);
  }
});

test("every stage that sends an email has a clean subject and message", () => {
  for (const status of PROJECT_STATUSES) {
    if (!shouldEmailStageChange("lead", status)) continue;
    const email = buildStageEmail({ projectNumber: "DCL-00062", title: "POUCH", toStatus: status, customerName: "Ghian Ladislao", projectUrl: "https://dyecutlab.com/project/DCL-00062" });
    assert.ok(email.subject.startsWith("Update on your project DCL-00062: "), email.subject);
    for (const part of [email.subject, email.headline, email.detail, email.stage]) {
      assert.ok(part && !part.includes("_") && !/undefined|null/.test(part), `${status}: ${part}`);
    }
    assert.equal(email.greeting, "Hi Ghian,");
    assert.equal(email.ctaLabel, "View your project");
  }
});

test("the email says what the customer sees on the page", () => {
  const email = buildStageEmail({ projectNumber: "DCL-1", toStatus: "production", projectUrl: "u" });
  assert.equal(email.stage, "Being made");
  assert.equal(email.headline, "Your order is being made");
  assert.equal(email.greeting, "Hi,", "no name known");
});

test("what the customer typed is flattened and shortened", () => {
  const email = buildStageEmail({ projectNumber: "DCL-1", title: "x".repeat(500), toStatus: "qc", customerName: "  Bob\n Builder ", projectUrl: "u" });
  assert.ok(email.title.length <= 100);
  assert.equal(email.greeting, "Hi Bob,");
});

test("both places that move a stage tell the customer", () => {
  assert.match(readFileSync("app/factory/actions.ts", "utf8"), /notifyCustomerOfStageChange/);
  assert.match(readFileSync("app/admin/actions.ts", "utf8"), /notifyCustomerOfStageChange/);
});
