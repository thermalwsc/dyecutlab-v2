import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProjectAlertEmail, buildProjectAlertSms, oneLine, sizeSummary, whoWords } from "../lib/projectAlert.ts";

const base = {
  projectNumber: "DCL-00062",
  title: "POUCH",
  request: "I need 200 pouches",
  units: 1,
  quantity: 200,
  flavorCount: 2,
  customerName: "Ghian",
  customerEmail: "ghian@example.com",
  customerPhone: "+63 912 000 0000",
  projectUrl: "https://dyecutlab.com/admin/projects/abc",
};

test("the text names the project, who sent it, what it is and how to reach them", () => {
  const sms = buildProjectAlertSms(base);
  assert.match(sms, /new project DCL-00062 from Ghian: POUCH, 1 unit, 200 pcs, 2 flavors\./);
  assert.match(sms, /Text them: \+63 912 000 0000/);
  assert.match(sms, /"I need 200 pouches"/);
  assert.match(sms, /https:\/\/dyecutlab\.com\/admin\/projects\/abc$/);
});

test("a brand-new project with little known still reads cleanly", () => {
  const sms = buildProjectAlertSms({ projectNumber: "DCL-00063", projectUrl: "https://x.test/p" });
  assert.equal(sms, "Hi Gilbert - new project DCL-00063 from a customer.\nhttps://x.test/p");
  assert.ok(!/undefined|null|NaN/.test(sms));
});

test("the sender falls back from name to email to 'a customer'", () => {
  assert.equal(whoWords({ customerName: "Ghian", customerEmail: "g@x.test" }), "Ghian");
  assert.equal(whoWords({ customerName: "  ", customerEmail: "g@x.test" }), "g@x.test");
  assert.equal(whoWords({}), "a customer");
});

test("customer text is flattened, cleaned and shortened", () => {
  assert.equal(oneLine("  line one\n\nline\ttwo \u0000\u0007 ", 100), "line one line two");
  const long = oneLine("word ".repeat(200), 50);
  assert.ok(long.length <= 50 && long.endsWith("…"));
  assert.equal(oneLine(null, 10), "");
  const sms = buildProjectAlertSms({ ...base, request: "x".repeat(5000) });
  assert.ok(sms.length < 520, `text is ${sms.length} characters`);
});

test("the size summary only says what is known", () => {
  assert.equal(sizeSummary({ units: 1 }), "1 unit");
  assert.equal(sizeSummary({ units: 10, flavorCount: 3 }), "10 units, 3 flavors");
  assert.equal(sizeSummary({ flavorCount: 1 }), "1 flavor");
  assert.equal(sizeSummary({ units: 0, quantity: null, flavorCount: undefined }), "");
  assert.equal(sizeSummary({ quantity: 64000 }), "64,000 pcs");
});

test("the email carries the full picture and a useful subject", () => {
  const email = buildProjectAlertEmail(base);
  assert.equal(email.subject, "New project DCL-00062 from Ghian — POUCH");
  assert.equal(email.request, "I need 200 pouches");
  assert.equal(email.email, "ghian@example.com");
  assert.equal(email.phone, "+63 912 000 0000");
  assert.equal(email.projectUrl, base.projectUrl);
  assert.equal(buildProjectAlertEmail({ projectNumber: "DCL-1", projectUrl: "u" }).subject, "New project DCL-1 from a customer");
});

test("markup in what the customer typed stays plain text for the builder to escape", () => {
  const email = buildProjectAlertEmail({ ...base, request: "<script>alert(1)</script> hi", customerName: "<b>Bob</b>" });
  assert.equal(email.request, "<script>alert(1)</script> hi", "kept as text; the email sender escapes it");
  assert.equal(email.who, "<b>Bob</b>");
});
