import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPaymentReceipt, buildStaffPaymentAlert, isEmailablePayment } from "../lib/paymentEmail.ts";

/* Every name, amount and link here is made up. */

const base = {
  kind: "deposit" as const,
  amountCents: 50000,
  projectNumber: "DCL-00109",
  title: "Soft touch boxes",
  customerName: "Ghian Ladislao",
  projectUrl: "https://example.test/project/DCL-00109",
};

test("the deposit receipt says what we received and what happens next", () => {
  const mail = buildPaymentReceipt(base);
  assert.equal(mail.subject, "We received your deposit for DCL-00109");
  assert.equal(mail.greeting, "Hi Ghian,");
  assert.equal(mail.headline, "Your 50% deposit is paid. Thank you!");
  assert.match(mail.detail, /\$500\.00/);
  assert.match(mail.detail, /proof/i);
  assert.deepEqual(mail.rows.slice(0, 3), [
    { label: "Project", value: "DCL-00109 · Soft touch boxes" },
    { label: "Payment", value: "Deposit (50%)" },
    { label: "Amount", value: "$500.00" },
  ]);
  assert.equal(mail.ctaLabel, "View your project");
  assert.equal(mail.projectUrl, base.projectUrl);
});

test("the balance receipt says the order is fully paid", () => {
  const mail = buildPaymentReceipt({ ...base, kind: "balance", amountCents: 6172 });
  assert.equal(mail.subject, "We received your balance for DCL-00109");
  assert.equal(mail.headline, "Your balance is paid. Thank you!");
  assert.match(mail.detail, /\$61\.72/);
  assert.match(mail.detail, /fully paid/);
  assert.equal(mail.rows[1].value, "Balance (50%)");
});

test("a customer without a name, or a project without a title, still reads well", () => {
  const mail = buildPaymentReceipt({ ...base, customerName: null, title: "  " });
  assert.equal(mail.greeting, "Hi,");
  assert.equal(mail.rows[0].value, "DCL-00109");
});

test("Square's receipt link is included only when it is a secure link", () => {
  const secure = buildPaymentReceipt({ ...base, receiptUrl: "https://squareup.com/receipt/preview/abc" });
  assert.deepEqual(secure.rows[3], { label: "Square receipt", value: "https://squareup.com/receipt/preview/abc" });
  for (const bad of ["http://squareup.com/r", "javascript:alert(1)", "", null, undefined]) {
    assert.equal(buildPaymentReceipt({ ...base, receiptUrl: bad }).rows.length, 3, String(bad));
  }
});

test("a name or title with line breaks cannot add lines to the email", () => {
  const mail = buildPaymentReceipt({ ...base, customerName: "Eve\nBcc: someone@example.test", title: "Boxes\r\nSubject: hi" });
  assert.ok(!/\n|\r/.test(mail.greeting));
  assert.ok(!/\n|\r/.test(mail.rows[0].value));
});

test("the team alert says who paid what, and whether the project moved", () => {
  const alert = buildStaffPaymentAlert({ kind: "deposit", amountCents: 50000, projectNumber: "DCL-00109", projectTitle: "Soft touch boxes", customerName: "Ghian Ladislao", movedToProof: true });
  assert.equal(alert.headline, "Ghian Ladislao paid the 50% deposit on DCL-00109");
  assert.deepEqual(alert.rows.map((r) => r.label), ["Project", "Payment", "Amount", "Stage"]);
  assert.equal(alert.rows[3].value, "Moved to Proof automatically");
  assert.match(alert.footer, /proof/i);
});

test("a balance alert has no stage row and says the order can ship", () => {
  const alert = buildStaffPaymentAlert({ kind: "balance", amountCents: 6172, projectNumber: "DCL-00109", projectTitle: null, customerName: null, movedToProof: false });
  assert.equal(alert.headline, "A customer paid the 50% balance on DCL-00109");
  assert.deepEqual(alert.rows.map((r) => r.label), ["Project", "Payment", "Amount"]);
  assert.match(alert.rows[0].value, /Untitled project/);
  assert.match(alert.footer, /ship/);
});

test("only a deposit or a balance has an email", () => {
  assert.equal(isEmailablePayment("deposit"), true);
  assert.equal(isEmailablePayment("balance"), true);
  for (const bad of ["refund", "", null, undefined, 5]) assert.equal(isEmailablePayment(bad), false, String(bad));
});
