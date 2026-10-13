import { test } from "node:test";
import assert from "node:assert/strict";
import { intakeRows } from "../lib/intakeMessages.ts";
import { MAX_CHAT_CHARS } from "../lib/uploadRules.ts";

const at = new Date("2026-10-14T10:00:00.000Z");

test("a customer line and BABA's reply become two rows in speaking order", () => {
  const rows = intakeRows("I need 200 pouches", "How many flavors?", at);
  assert.deepEqual(rows, [
    { role: "user", message: "I need 200 pouches", created_at: "2026-10-14T10:00:00.000Z" },
    { role: "baba", message: "How many flavors?", created_at: "2026-10-14T10:00:00.001Z" },
  ]);
  assert.ok(rows[0].created_at < rows[1].created_at);
});

test("text is trimmed", () => {
  const rows = intakeRows("  hi  ", "  hello \n", at);
  assert.equal(rows[0].message, "hi");
  assert.equal(rows[1].message, "hello");
});

test("empty lines are left out", () => {
  assert.deepEqual(intakeRows("   ", "question", at).map((r) => r.role), ["baba"]);
  assert.deepEqual(intakeRows("said this", "", at).map((r) => r.role), ["user"]);
  assert.deepEqual(intakeRows("said this", null, at).map((r) => r.role), ["user"]);
  assert.deepEqual(intakeRows("", undefined, at), []);
});

test("very long text is cut to the chat limit", () => {
  const rows = intakeRows("x".repeat(MAX_CHAT_CHARS + 500), "y".repeat(MAX_CHAT_CHARS + 500), at);
  assert.equal(rows[0].message.length, MAX_CHAT_CHARS);
  assert.equal(rows[1].message.length, MAX_CHAT_CHARS);
});

test("only the two roles the project chat understands are used", () => {
  for (const row of intakeRows("a", "b", at)) assert.ok(row.role === "user" || row.role === "baba");
});
