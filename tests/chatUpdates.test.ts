import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAT_EDITABLE_FIELDS, MAX_FLAVORS, MAX_TEXT_LENGTH, MAX_UNITS, cleanChatUpdates, rejectedNote } from "../lib/chatUpdates.ts";

test("good values pass through", () => {
  const { updates, rejected } = cleanChatUpdates(["units", "flavor_count", "material"], {
    units: 50,
    flavor_count: 3,
    material: "  Mylar  ",
  });
  assert.deepEqual(updates, { units: 50, flavor_count: 3, material: "Mylar" });
  assert.deepEqual(rejected, []);
});

test("numbers written as text are accepted when they are whole numbers", () => {
  assert.deepEqual(cleanChatUpdates(["units"], { units: "50" }).updates, { units: 50 });
});

test("bad numbers are dropped and reported, not fatal", () => {
  for (const bad of [0, -5, 2.5, "lots", "", NaN, Infinity, MAX_UNITS + 1, 1e12, true, {}, []]) {
    const { updates, rejected } = cleanChatUpdates(["units"], { units: bad });
    assert.ok(!("units" in updates), `${String(bad)} must not be saved`);
    assert.deepEqual(rejected, ["units"], `${String(bad)} must be reported`);
  }
});

test("the ceilings are inclusive", () => {
  assert.deepEqual(cleanChatUpdates(["units"], { units: MAX_UNITS }).updates, { units: MAX_UNITS });
  assert.deepEqual(cleanChatUpdates(["flavor_count"], { flavor_count: MAX_FLAVORS }).updates, { flavor_count: MAX_FLAVORS });
  assert.deepEqual(cleanChatUpdates(["flavor_count"], { flavor_count: MAX_FLAVORS + 1 }).rejected, ["flavor_count"]);
  assert.deepEqual(cleanChatUpdates(["units"], { units: 1 }).updates, { units: 1 });
});

test("a bad value does not stop the good ones", () => {
  const { updates, rejected } = cleanChatUpdates(["units", "flavor_count", "finish"], {
    units: 0,
    flavor_count: 2,
    finish: "matte",
  });
  assert.deepEqual(updates, { flavor_count: 2, finish: "matte" });
  assert.deepEqual(rejected, ["units"]);
});

test("text must be a short, non-empty string", () => {
  assert.deepEqual(cleanChatUpdates(["size"], { size: "" }).updates, {});
  assert.deepEqual(cleanChatUpdates(["size"], { size: "   " }).updates, {});
  assert.deepEqual(cleanChatUpdates(["size"], { size: 12 }).rejected, ["size"]);
  assert.deepEqual(cleanChatUpdates(["size"], { size: "x".repeat(MAX_TEXT_LENGTH + 1) }).rejected, ["size"]);
  assert.deepEqual(cleanChatUpdates(["size"], { size: "x".repeat(MAX_TEXT_LENGTH) }).rejected, []);
});

test("fields the chat may not change are ignored, whatever the AI asks for", () => {
  const { updates } = cleanChatUpdates(["owner_id", "factory_id", "status", "title", "quantity", "units"], {
    owner_id: "someone-else",
    factory_id: "x",
    status: "delivered",
    title: "hacked",
    quantity: 99999999,
    units: 10,
  });
  assert.deepEqual(updates, { units: 10 });
  for (const field of Object.keys(updates)) assert.ok((CHAT_EDITABLE_FIELDS as readonly string[]).includes(field));
});

test("junk input is handled without throwing", () => {
  for (const changed of [null, undefined, "units", 5, {}]) {
    assert.deepEqual(cleanChatUpdates(changed, { units: 5 }), { updates: {}, rejected: [] });
  }
  assert.deepEqual(cleanChatUpdates(["units"], null), { updates: {}, rejected: [] });
  assert.deepEqual(cleanChatUpdates([1, null, {}, "units"], { units: 5 }).updates, { units: 5 });
  assert.deepEqual(cleanChatUpdates(["units", "units"], { units: 5 }).updates, { units: 5 });
});

test("a null value means nothing to change, not an error", () => {
  assert.deepEqual(cleanChatUpdates(["units", "finish"], { units: null, finish: undefined }), { updates: {}, rejected: [] });
});

test("the note to the customer names what was left out", () => {
  assert.equal(rejectedNote([]), "");
  assert.match(rejectedNote(["units"]), /units/);
  assert.match(rejectedNote(["units", "flavor_count"]), /units and number of designs or flavors/);
  assert.match(rejectedNote(["units", "size", "finish"]), /units, size and finish/);
  assert.ok(!/units_|flavor_count/.test(rejectedNote(["flavor_count"])), "uses friendly names, not column names");
});
