import { test } from "node:test";
import assert from "node:assert/strict";
import { NEW_PROJECT_HOURS, countByStage, isNewProject } from "../lib/dashboardSummary.ts";

test("projects are counted per stage in stage order, skipping empty stages", () => {
  assert.deepEqual(countByStage(["production", "lead", "production", "quote_ready", "lead", "lead"]), [
    { status: "lead", count: 3 },
    { status: "quote_ready", count: 1 },
    { status: "production", count: 2 },
  ]);
});

test("the counts add up to the number of projects", () => {
  const rows = ["lead", "development", null, undefined, "delivered", "legacy", "Legacy", " LEAD "];
  const total = countByStage(rows).reduce((sum, row) => sum + row.count, 0);
  assert.equal(total, rows.length);
});

test("a missing stage counts as development, like the rest of the site", () => {
  assert.deepEqual(countByStage([null, undefined, "", "  "]), [{ status: "development", count: 4 }]);
});

test("case and spaces do not split a stage in two", () => {
  assert.deepEqual(countByStage(["Lead", " lead", "LEAD "]), [{ status: "lead", count: 3 }]);
});

test("an old value the system does not know is kept after the known stages", () => {
  assert.deepEqual(countByStage(["zzz-old", "delivered", "aaa-old", "lead", "aaa-old"]), [
    { status: "lead", count: 1 },
    { status: "delivered", count: 1 },
    { status: "aaa-old", count: 2 },
    { status: "zzz-old", count: 1 },
  ]);
});

test("nothing gives nothing", () => {
  assert.deepEqual(countByStage([]), []);
});

test("a project from the last two days is new, an older or odd one is not", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
  assert.equal(isNewProject(hoursAgo(1), now), true);
  assert.equal(isNewProject(hoursAgo(NEW_PROJECT_HOURS), now), true);
  assert.equal(isNewProject(hoursAgo(NEW_PROJECT_HOURS + 1), now), false);
  assert.equal(isNewProject(hoursAgo(-5), now), false, "a date in the future is not new");
  assert.equal(isNewProject(null, now), false);
  assert.equal(isNewProject("not a date", now), false);
});
