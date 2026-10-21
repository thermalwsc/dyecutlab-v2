import { test } from "node:test";
import assert from "node:assert/strict";
import { readRememberedClient } from "../lib/rememberedClient.ts";

const stored = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ id: "client-1", phone: "+63 912 000 0000", email: "a@b.test", marketingSms: false, userId: "user-1", ...extra });

test("the memory is used by the account that saved it", () => {
  assert.deepEqual(readRememberedClient(stored(), "user-1"), {
    id: "client-1",
    phone: "+63 912 000 0000",
    email: "a@b.test",
    marketingSms: false,
  });
});

test("another account on the same browser does not get it", () => {
  assert.equal(readRememberedClient(stored(), "user-2"), null);
});

test("an old memory with no account attached is ignored", () => {
  assert.equal(readRememberedClient(stored({ userId: undefined }), "user-1"), null);
});

test("nobody signed in means nothing is remembered for them", () => {
  assert.equal(readRememberedClient(stored(), null), null);
  assert.equal(readRememberedClient(stored(), undefined), null);
  assert.equal(readRememberedClient(stored(), ""), null);
});

test("broken or incomplete memory is ignored without throwing", () => {
  assert.equal(readRememberedClient(null, "user-1"), null);
  assert.equal(readRememberedClient("", "user-1"), null);
  assert.equal(readRememberedClient("{not json", "user-1"), null);
  assert.equal(readRememberedClient("null", "user-1"), null);
  assert.equal(readRememberedClient(stored({ id: "" }), "user-1"), null);
  assert.equal(readRememberedClient(stored({ id: 7 }), "user-1"), null);
  assert.equal(readRememberedClient(stored({ phone: "   " }), "user-1"), null);
});

test("missing optional fields get safe defaults", () => {
  const client = readRememberedClient(JSON.stringify({ id: "c", phone: "1", userId: "u" }), "u");
  assert.deepEqual(client, { id: "c", phone: "1", email: "", marketingSms: false });
});
