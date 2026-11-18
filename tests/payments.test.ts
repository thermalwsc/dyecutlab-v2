import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BALANCE_OPEN_STATUSES,
  DEPOSIT_OPEN_STATUSES,
  PAYMENT_KINDS,
  PAYMENT_STATUSES,
  STATUS_LABELS,
  amountFor,
  balancePaid,
  depositPaid,
  formatCents,
  isPaymentKind,
  isPaymentStatus,
  kindLabel,
  nextPayment,
  paymentDatabaseMessage,
  paymentStatusLabel,
  splitCents,
  toCents,
  type PaymentRow,
} from "../lib/payments.ts";

/* Every amount here is made up. */

test("the kinds and statuses are the ones the database knows", () => {
  assert.deepEqual([...PAYMENT_KINDS], ["deposit", "balance"]);
  assert.deepEqual([...PAYMENT_STATUSES], ["pending", "paid", "failed", "canceled", "refunded"]);
  assert.equal(isPaymentKind("deposit"), true);
  assert.equal(isPaymentKind("Deposit"), false);
  assert.equal(isPaymentStatus("paid"), true);
  assert.equal(isPaymentStatus("maybe"), false);
  assert.equal(isPaymentStatus(null), false);
});

test("a quote total becomes whole cents without a floating point slip", () => {
  assert.equal(toCents(1000), 100000);
  assert.equal(toCents(123.45), 12345);
  assert.equal(toCents("123.45"), 12345);
  assert.equal(toCents(" 19.99 "), 1999);
  assert.equal(toCents(0.1 + 0.2), 30, "0.30000000000000004 still gives 30 cents");
  assert.equal(toCents(1.005), 101, "rounds to the nearest cent");
});

test("a total that is not a usable amount gives nothing, never a guess", () => {
  for (const bad of [0, -5, NaN, Infinity, "", "abc", "1e400", null, undefined, 1e12]) {
    assert.equal(toCents(bad as number), null, String(bad));
  }
});

test("the deposit is half rounded up, the balance is the rest, and they always add up", () => {
  assert.deepEqual(splitCents(100000), { deposit: 50000, balance: 50000 });
  assert.deepEqual(splitCents(12345), { deposit: 6173, balance: 6172 });
  assert.deepEqual(splitCents(1), { deposit: 1, balance: 0 });
  assert.deepEqual(splitCents(2), { deposit: 1, balance: 1 });
  for (let total = 1; total <= 5000; total++) {
    const { deposit, balance } = splitCents(total);
    assert.equal(deposit + balance, total, `total ${total}`);
    assert.ok(deposit >= balance && deposit - balance <= 1, `total ${total}`);
  }
  assert.equal(amountFor("deposit", 12345), 6173);
  assert.equal(amountFor("balance", 12345), 6172);
});

test("amounts read as dollars for a person", () => {
  assert.equal(formatCents(50000), "$500.00");
  assert.equal(formatCents(6173), "$61.73");
  assert.equal(formatCents(5), "$0.05");
});

test("the words are plain, and an unknown value shows as it is", () => {
  assert.equal(kindLabel("deposit"), "Deposit (50%)");
  assert.equal(kindLabel("balance"), "Balance (50%)");
  assert.equal(kindLabel("mystery"), "mystery");
  for (const status of PAYMENT_STATUSES) {
    const text = paymentStatusLabel(status);
    assert.ok(text && !text.includes("_") && text === text.trim(), status);
    assert.equal(text, STATUS_LABELS[status]);
  }
  assert.equal(paymentStatusLabel(null), "");
});

const row = (kind: string, status: string, amount = 50000): PaymentRow => ({ kind, status, amount_cents: amount });

test("the deposit is due once the quote is approved, and only then", () => {
  assert.deepEqual(nextPayment("approved", 100000, []), { due: "deposit", amountCents: 50000, resume: false });
  assert.deepEqual(nextPayment("payment", 100000, []), { due: "deposit", amountCents: 50000, resume: false });
  for (const stage of ["lead", "development", "quote_ready", "factory_review", "proof", "production", "shipping", "", null]) {
    const result = nextPayment(stage, 100000, []);
    assert.equal(result.due, null, String(stage));
  }
});

test("no payment is asked for without a quote to base it on", () => {
  assert.deepEqual(nextPayment("approved", null, []), { due: null, why: "no_quote" });
});

test("a deposit link that is still waiting is resumed, not duplicated", () => {
  assert.deepEqual(nextPayment("approved", 100000, [row("deposit", "pending")]), { due: "deposit", amountCents: 50000, resume: true });
});

test("a failed or cancelled deposit can be tried again from scratch", () => {
  for (const status of ["failed", "canceled"]) {
    assert.deepEqual(nextPayment("approved", 100000, [row("deposit", status)]), { due: "deposit", amountCents: 50000, resume: false }, status);
  }
});

test("after the deposit, the balance is due while the order is made and checked", () => {
  const paid = [row("deposit", "paid")];
  assert.deepEqual(nextPayment("production", 12345, paid), { due: "balance", amountCents: 6172, resume: false });
  assert.deepEqual(nextPayment("qc", 12345, paid), { due: "balance", amountCents: 6172, resume: false });
  assert.deepEqual(nextPayment("qc", 12345, [...paid, row("balance", "pending", 6172)]), { due: "balance", amountCents: 6172, resume: true });
  for (const stage of ["approved", "payment", "proof", "shipping", "delivered"]) {
    assert.equal(nextPayment(stage, 12345, paid).due, null, stage);
  }
});

test("when both halves are paid nothing more is due", () => {
  const both = [row("deposit", "paid"), row("balance", "paid")];
  for (const stage of ["approved", "production", "qc", "shipping"]) {
    assert.deepEqual(nextPayment(stage, 100000, both), { due: null, why: "all_paid" }, stage);
  }
});

test("a project may ship only once the balance is paid", () => {
  assert.equal(balancePaid([]), false);
  assert.equal(balancePaid([row("deposit", "paid")]), false);
  assert.equal(balancePaid([row("deposit", "paid"), row("balance", "pending")]), false);
  assert.equal(balancePaid([row("deposit", "paid"), row("balance", "failed")]), false);
  assert.equal(balancePaid([row("deposit", "paid"), row("balance", "paid")]), true);
  assert.equal(balancePaid([row("balance", "refunded")]), false);
  assert.equal(depositPaid([row("deposit", "paid")]), true);
  assert.equal(depositPaid([row("deposit", "pending")]), false);
});

test("the stages that open each payment are separate and do not overlap", () => {
  for (const stage of DEPOSIT_OPEN_STATUSES) assert.ok(!(BALANCE_OPEN_STATUSES as readonly string[]).includes(stage), stage);
});

test("a database refusal becomes a plain sentence and never leaks the database words", () => {
  assert.match(paymentDatabaseMessage({ code: "23505" }), /already waiting or paid/);
  for (const error of [{ code: "23514" }, { code: "XX000" }, null, undefined]) {
    const text = paymentDatabaseMessage(error);
    assert.ok(!/relation|constraint|payments|violates|trigger/.test(text), text);
  }
});
