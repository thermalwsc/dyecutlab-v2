import { test } from "node:test";
import assert from "node:assert/strict";
import { summaryRows } from "../lib/intakeSummary.ts";

test("each summary line becomes a label and a value", () => {
  assert.deepEqual(summaryRows("PACKAGING · BOX\nUNITS · 1\nPRODUCTION · 200 PCS"), [
    { label: "PACKAGING", value: "BOX" },
    { label: "UNITS", value: "1" },
    { label: "PRODUCTION", value: "200 PCS" },
  ]);
});

test("a value that itself contains the separator stays whole", () => {
  assert.deepEqual(summaryRows("DESIGNS · 2 · 100 PCS EACH"), [{ label: "DESIGNS", value: "2 · 100 PCS EACH" }]);
});

test("flavors are shown as designs", () => {
  assert.deepEqual(summaryRows("FLAVORS · 3 · 100 PCS EACH"), [{ label: "DESIGNS", value: "3 · 100 PCS EACH" }]);
  assert.equal(summaryRows("FLAVOR · 1")[0].label, "DESIGNS");
});

test("blank lines are skipped and a line without a label keeps its text", () => {
  assert.deepEqual(summaryRows("\n  \nSIZE · 4 x 6 in\njust a note\n"), [
    { label: "SIZE", value: "4 x 6 in" },
    { label: "", value: "just a note" },
  ]);
  assert.deepEqual(summaryRows(""), []);
});
