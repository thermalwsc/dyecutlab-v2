import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAT_PROJECT_FIELDS, GENERIC_CHAT_ERROR, pickChatProject, projectForModel } from "../lib/chatProject.ts";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  project_number: "DCL-00051",
  title: "POUCH",
  request: "i need box and bag",
  product_type: "POUCH + BOX",
  units: 50,
  flavor_count: 1,
  status: "development",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
  // internal columns that must never reach the AI or the browser
  owner_id: "22222222-2222-4222-8222-222222222222",
  factory_id: "33333333-3333-4333-8333-333333333333",
  client_id: "44444444-4444-4444-8444-444444444444",
  archived_at: null,
  notes: "team only: customer is slow to pay",
  internal_margin: 0.4,
};

test("only the allowed project fields come through", () => {
  const picked = pickChatProject(row);
  for (const key of Object.keys(picked)) {
    assert.ok((CHAT_PROJECT_FIELDS as readonly string[]).includes(key), `${key} should not be exposed`);
  }
  for (const secret of ["owner_id", "factory_id", "client_id", "archived_at", "notes", "internal_margin"]) {
    assert.ok(!(secret in picked), `${secret} must not be exposed`);
  }
  assert.equal(picked.project_number, "DCL-00051");
  assert.equal(picked.units, 50);
});

test("the AI is not shown internal ids or timestamps", () => {
  const forModel = projectForModel(row);
  for (const hidden of ["id", "created_at", "updated_at", "owner_id", "factory_id"]) {
    assert.ok(!(hidden in forModel), `${hidden} must not be sent to the model`);
  }
  assert.equal(forModel.title, "POUCH");
  assert.ok(!JSON.stringify(forModel).includes("33333333"), "the factory id must not appear anywhere");
});

test("missing rows are handled", () => {
  assert.deepEqual(pickChatProject(null), {});
  assert.deepEqual(projectForModel(undefined), {});
});

test("the customer-facing error says nothing internal", () => {
  const text = GENERIC_CHAT_ERROR.toLowerCase();
  for (const word of ["key", "openai", "supabase", "env", "token", "sql", "stack"]) {
    assert.ok(!text.includes(word), `error text mentions ${word}`);
  }
});
