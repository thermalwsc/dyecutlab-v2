import { test } from "node:test";
import assert from "node:assert/strict";
import { MONTHLY_AI_CAP_USD, PLANNED_COST_PER_CALL, USAGE_RULES, type UsageKind } from "../lib/usageRules.ts";

const kinds = Object.keys(USAGE_RULES) as UsageKind[];

test("every limit is a sensible whole number", () => {
  assert.deepEqual([...kinds].sort(), ["analyze", "chat", "preflight", "upload"]);
  for (const kind of kinds) {
    const rule = USAGE_RULES[kind];
    for (const value of [rule.perMinute, rule.perDay, rule.siteDay]) {
      assert.ok(Number.isInteger(value) && value > 0, `${kind}: ${value}`);
    }
    assert.ok(rule.label.length > 0);
  }
});

test("one account can never be allowed more than the whole site", () => {
  for (const kind of kinds) {
    const rule = USAGE_RULES[kind];
    assert.ok(rule.perMinute <= rule.perDay, `${kind}: a minute above a day`);
    assert.ok(rule.perDay <= rule.siteDay, `${kind}: one account above the site total`);
  }
});

test("several customers can use the site on the same day", () => {
  for (const kind of kinds) {
    const rule = USAGE_RULES[kind];
    assert.ok(rule.siteDay >= rule.perDay * 3, `${kind}: the site ceiling fits fewer than 3 busy accounts`);
  }
});

test("a whole day at the AI ceiling stays near a tenth of the monthly cap", () => {
  const dayAtCeiling =
    USAGE_RULES.chat.siteDay * PLANNED_COST_PER_CALL.chat + USAGE_RULES.analyze.siteDay * PLANNED_COST_PER_CALL.analyze;
  assert.ok(dayAtCeiling <= MONTHLY_AI_CAP_USD / 10, `a day at the ceiling costs about $${dayAtCeiling.toFixed(2)}`);
  /* and the cap itself is the hard stop on a worst-case month */
  assert.equal(MONTHLY_AI_CAP_USD, 25);
});

test("a normal customer fits comfortably inside the daily limits", () => {
  /* a project is about 15 to 20 messages; a busy day is a few projects */
  assert.ok(USAGE_RULES.chat.perDay >= 4 * 20);
  assert.ok(USAGE_RULES.analyze.perDay >= 10);
  assert.ok(USAGE_RULES.upload.perDay >= 20);
});
