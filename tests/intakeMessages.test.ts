import { test } from "node:test";
import assert from "node:assert/strict";
import { intakeRows, savedToShown } from "../lib/intakeMessages.ts";
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

test("saved rows come back as chat bubbles in order", () => {
  const shown = savedToShown([
    { id: "a", role: "user", message: "I need pouches" },
    { id: "b", role: "baba", message: "How many units?" },
  ]);
  assert.deepEqual(shown, [
    { id: "a", role: "customer", text: "I need pouches" },
    { id: "b", role: "baba", text: "How many units?" },
  ]);
});

test("saved rows that are empty, wrong-role or junk are skipped", () => {
  const shown = savedToShown([
    { id: "a", role: "system", message: "ignore this" },
    { id: "b", role: "user", message: "   " },
    { id: "c", role: "baba", message: 42 },
    null as never,
    { role: "user", message: "kept, no id" },
  ]);
  assert.deepEqual(shown, [{ id: "saved-4", role: "customer", text: "kept, no id" }]);
  assert.deepEqual(savedToShown(null), []);
  assert.deepEqual(savedToShown("nope" as never), []);
});

test("only the two roles the project chat understands are used", () => {
  for (const row of intakeRows("a", "b", at)) assert.ok(row.role === "user" || row.role === "baba");
});
