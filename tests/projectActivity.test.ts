import { test } from "node:test";
import assert from "node:assert/strict";
import { actorWords, activityDate, cleanActivity, describeActivity } from "../lib/projectActivity.ts";

const label = (s: string) => ({ lead: "Lead", development: "Development", quote_ready: "Quote ready", production: "Production" } as Record<string, string>)[s] ?? s.replace(/_/g, " ");
const row = (over: Record<string, unknown> = {}) => ({
  id: "1",
  kind: "status_change",
  from_status: "development",
  to_status: "production",
  actor_role: "factory",
  created_at: "2026-10-15T10:00:00.000Z",
  ...over,
});

test("a stage change says from, to and who", () => {
  assert.equal(describeActivity(row(), label), "Moved from Development to Production by the factory");
});

test("without a starting stage it says where it moved to", () => {
  assert.equal(describeActivity(row({ from_status: null }), label), "Moved to Production by the factory");
});

test("roles become plain words, and staff are never named", () => {
  assert.equal(actorWords("customer"), "the customer");
  assert.equal(actorWords("dcl_staff"), "the DYE CUT LAB team");
  assert.equal(actorWords("dcl_admin"), "the DYE CUT LAB team");
  assert.equal(actorWords("factory"), "the factory");
  assert.equal(actorWords(null), "DYE CUT LAB");
  assert.equal(actorWords("something else"), "DYE CUT LAB");
  assert.equal(describeActivity(row({ actor_role: "dcl_admin" }), label), "Moved from Development to Production by the DYE CUT LAB team");
});

test("an unknown stage code still reads sensibly", () => {
  assert.equal(describeActivity(row({ to_status: "factory_review" }), label), "Moved from Development to factory review by the factory");
});

test("a created entry, with and without a known creator", () => {
  assert.equal(describeActivity(row({ kind: "created", from_status: null, to_status: "lead", actor_role: "customer" }), label), "Project created by the customer");
  assert.equal(describeActivity(row({ kind: "created", from_status: null, to_status: null, actor_role: null }), label), "Project created");
});

test("an unknown kind falls back to a generic line", () => {
  assert.equal(describeActivity(row({ kind: "mystery", to_status: null }), label), "Project updated");
  assert.equal(describeActivity(row({ to_status: null }), label), "Project updated");
});

test("dates read like the dashboard's", () => {
  assert.equal(activityDate("2026-10-15T10:00:00.000Z"), "Oct 15, 2026");
  assert.equal(activityDate("not a date"), "");
});

test("the API list is sorted newest first and limited", () => {
  const rows = [
    row({ id: "old", created_at: "2026-10-10T00:00:00.000Z" }),
    row({ id: "new", created_at: "2026-10-15T00:00:00.000Z" }),
    row({ id: "mid", created_at: "2026-10-12T00:00:00.000Z" }),
  ];
  assert.deepEqual(cleanActivity(rows).map((r) => r.id), ["new", "mid", "old"]);
  assert.equal(cleanActivity(rows, 2).length, 2);
});

test("junk rows are dropped and unknown fields are not passed on", () => {
  const cleaned = cleanActivity([null, 5, { id: 7 }, { id: "x" }, { ...row({ id: "ok" }), actor_id: "secret-user-id", extra: "x" }]);
  assert.equal(cleaned.length, 1);
  assert.deepEqual(Object.keys(cleaned[0]).sort(), ["actor_role", "created_at", "from_status", "id", "kind", "to_status"]);
  assert.deepEqual(cleanActivity("nope"), []);
  assert.deepEqual(cleanActivity(undefined), []);
});
