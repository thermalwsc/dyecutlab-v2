import { test } from "node:test";
import assert from "node:assert/strict";
import { stageDates, trackerSteps } from "../lib/stageDates.ts";
import { JOURNEY_STEPS } from "../lib/projectJourney.ts";
import type { ActivityRow } from "../lib/projectActivity.ts";

let counter = 0;
const row = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  id: `r${counter++}`,
  kind: "status_change",
  from_status: null,
  to_status: "development",
  actor_role: "dcl_staff",
  created_at: "2026-10-01T10:00:00.000Z",
  ...over,
});

test("no history means no dates at all", () => {
  assert.deepEqual(stageDates([]), [null, null, null, null, null]);
  assert.deepEqual(stageDates([]).length, JOURNEY_STEPS.length);
});

test("a normal flow reaches each step on its own date", () => {
  const rows = [
    row({ kind: "created", to_status: "lead", created_at: "2026-10-01T09:00:00.000Z" }),
    row({ to_status: "development", created_at: "2026-10-02T09:00:00.000Z" }),
    row({ to_status: "quote_ready", created_at: "2026-10-05T09:00:00.000Z" }),
    row({ to_status: "approved", created_at: "2026-10-07T09:00:00.000Z" }),
  ];

  const dates = stageDates(rows);
  assert.equal(dates[0], "2026-10-01T09:00:00.000Z");
  assert.equal(dates[1], "2026-10-05T09:00:00.000Z");
  assert.equal(dates[2], null);
  assert.equal(dates[3], null);
  assert.equal(dates[4], null);
});

test("the earliest date wins when several statuses share a step", () => {
  const rows = [
    row({ to_status: "quote_ready", created_at: "2026-10-05T09:00:00.000Z" }),
    row({ to_status: "approved", created_at: "2026-10-07T09:00:00.000Z" }),
    row({ to_status: "factory_review", created_at: "2026-10-06T09:00:00.000Z" }),
  ];

  assert.equal(stageDates(rows)[1], "2026-10-05T09:00:00.000Z");
});

test("a skipped step stays empty and is never back-filled", () => {
  const rows = [
    row({ kind: "created", to_status: "lead", created_at: "2026-10-01T09:00:00.000Z" }),
    row({ to_status: "production", created_at: "2026-10-09T09:00:00.000Z" }),
  ];

  const dates = stageDates(rows);
  assert.equal(dates[0], "2026-10-01T09:00:00.000Z");
  assert.equal(dates[1], null);
  assert.equal(dates[2], null);
  assert.equal(dates[3], "2026-10-09T09:00:00.000Z");
  assert.equal(dates[4], null);
});

test("a backwards move keeps the first date and the current step still follows the status", () => {
  const rows = [
    row({ to_status: "production", created_at: "2026-10-09T09:00:00.000Z" }),
    row({ to_status: "development", created_at: "2026-10-12T09:00:00.000Z" }),
  ];

  assert.equal(stageDates(rows)[3], "2026-10-09T09:00:00.000Z");

  const steps = trackerSteps("development", rows);
  assert.equal(steps[0].state, "now");
  assert.equal(steps[3].state, "upcoming");
});

test("the order of the rows does not matter", () => {
  const oldest = [
    row({ kind: "created", to_status: "lead", created_at: "2026-10-01T09:00:00.000Z" }),
    row({ to_status: "quote_ready", created_at: "2026-10-05T09:00:00.000Z" }),
    row({ to_status: "production", created_at: "2026-10-09T09:00:00.000Z" }),
  ];
  const newest = [...oldest].reverse();

  assert.deepEqual(stageDates(newest), stageDates(oldest));
});

test("broken dates, unknown statuses and unknown kinds are ignored", () => {
  const rows = [
    row({ to_status: "quote_ready", created_at: "not a date" }),
    row({ to_status: "mystery_stage", created_at: "2026-10-05T09:00:00.000Z" }),
    row({ kind: "note", to_status: "production", created_at: "2026-10-06T09:00:00.000Z" }),
    row({ to_status: "proof", created_at: "2026-10-07T09:00:00.000Z" }),
  ];

  const dates = stageDates(rows);
  assert.equal(dates[1], null);
  assert.equal(dates[2], "2026-10-07T09:00:00.000Z");
  assert.equal(dates[3], null);
});

test("the rows that come in are not changed", () => {
  const rows = [
    row({ to_status: "quote_ready", created_at: "2026-10-05T09:00:00.000Z" }),
    row({ kind: "created", to_status: "lead", created_at: "2026-10-01T09:00:00.000Z" }),
  ];
  const copy = rows.map((item) => ({ ...item }));

  stageDates(rows);

  assert.deepEqual(rows, copy);
});

test("the tracker marks what is done, what is now and what is still to come", () => {
  const rows = [
    row({ kind: "created", to_status: "lead", created_at: "2026-10-01T09:00:00.000Z" }),
    row({ to_status: "quote_ready", created_at: "2026-10-05T09:00:00.000Z" }),
    row({ to_status: "proof", created_at: "2026-10-07T09:00:00.000Z" }),
  ];

  const steps = trackerSteps("proof", rows);

  assert.deepEqual(steps.map((step) => step.state), ["done", "done", "now", "upcoming", "upcoming"]);
  assert.equal(steps[0].date, "Oct 1, 2026");
  assert.equal(steps[1].date, "Oct 5, 2026");
  assert.equal(steps[2].date, "Oct 7, 2026");
  assert.equal(steps[3].date, "");
  assert.equal(steps[4].date, "");
});

test("without history the current step is still now and shows no date", () => {
  const steps = trackerSteps("quote_ready", []);

  assert.deepEqual(steps.map((step) => step.state), ["done", "now", "upcoming", "upcoming", "upcoming"]);
  assert.equal(steps[0].date, "");
  assert.equal(steps[1].date, "");
});

test("no raw stage code ever reaches the customer", () => {
  const rows = [
    row({ kind: "created", to_status: "lead", created_at: "2026-10-01T09:00:00.000Z" }),
    row({ to_status: "quote_ready", created_at: "2026-10-05T09:00:00.000Z" }),
    row({ to_status: "factory_review", created_at: "2026-10-06T09:00:00.000Z" }),
  ];

  const steps = trackerSteps("factory_review", rows);
  const text = steps.map((step) => `${step.label} ${step.state} ${step.date}`).join(" ");

  assert.equal(text.includes("_"), false);
  assert.deepEqual(steps.map((step) => step.label), ["Brief", "Quote", "Proof", "Production", "Delivery"]);
});
