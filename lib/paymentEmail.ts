/* =========================================================
   DYE CUT LAB — the emails when a payment is received
============================================================
   Two small pure pieces, covered by tests/paymentEmail.test.ts:
     - buildPaymentReceipt: what the CUSTOMER reads (what we received, what happens next)
     - buildStaffPaymentAlert: what the TEAM reads (who paid what, and whether the project moved)
   Sending is in lib/brevo.ts; who gets it is decided in lib/paymentAlerts.ts. The words are kept
   apart from the sending so they can be tested, and a failed email never undoes a payment. */

import { formatCents, isPaymentKind, kindLabel, type PaymentKind } from "./payments.ts";
import { oneLine } from "./projectAlert.ts";

function firstName(name: string | null | undefined) {
  return oneLine(name, 80).split(" ")[0] || "";
}

export type PaymentReceiptInput = {
  kind: PaymentKind;
  amountCents: number;
  projectNumber: string;
  title?: string | null;
  customerName?: string | null;
  /* Square's own receipt, shown only when it is a secure link */
  receiptUrl?: string | null;
  projectUrl: string;
};

export function buildPaymentReceipt(input: PaymentReceiptInput) {
  const amount = formatCents(input.amountCents);
  const name = firstName(input.customerName);
  const deposit = input.kind === "deposit";
  const title = oneLine(input.title, 100);

  const rows = [
    { label: "Project", value: title ? `${input.projectNumber} · ${title}` : input.projectNumber },
    { label: "Payment", value: kindLabel(input.kind) },
    { label: "Amount", value: amount },
  ];
  if (input.receiptUrl && /^https:\/\//i.test(input.receiptUrl)) rows.push({ label: "Square receipt", value: input.receiptUrl });

  return {
    subject: `We received your ${deposit ? "deposit" : "balance"} for ${input.projectNumber}`,
    greeting: name ? `Hi ${name},` : "Hi,",
    headline: deposit ? "Your 50% deposit is paid. Thank you!" : "Your balance is paid. Thank you!",
    detail: deposit
      ? `We received ${amount}. Your project is now at the proof stage: the factory prepares a proof for you to approve before production starts.`
      : `We received ${amount}. Your order is now fully paid, and it can ship as soon as it passes its final check.`,
    rows,
    ctaLabel: "View your project",
    projectUrl: input.projectUrl,
  };
}

export type StaffPaymentAlertInput = {
  kind: PaymentKind;
  amountCents: number;
  projectNumber: string;
  projectTitle?: string | null;
  customerName?: string | null;
  /* true when this payment moved the project to Proof */
  movedToProof: boolean;
};

export function buildStaffPaymentAlert(input: StaffPaymentAlertInput) {
  const who = oneLine(input.customerName, 80) || "A customer";
  const what = input.kind === "deposit" ? "the 50% deposit" : "the 50% balance";
  const rows = [
    { label: "Project", value: `${input.projectNumber} · ${oneLine(input.projectTitle, 100) || "Untitled project"}` },
    { label: "Payment", value: kindLabel(input.kind) },
    { label: "Amount", value: formatCents(input.amountCents) },
  ];
  if (input.movedToProof) rows.push({ label: "Stage", value: "Moved to Proof automatically" });

  return {
    headline: `${who} paid ${what} on ${input.projectNumber}`,
    rows,
    footer:
      input.kind === "deposit"
        ? "The customer got a receipt. The project is at Proof, so the factory can prepare the proof."
        : "The customer got a receipt. The order is fully paid, so the factory can ship it.",
  };
}

/* Anything that is not a payment kind has no email. */
export function isEmailablePayment(kind: unknown): kind is PaymentKind {
  return isPaymentKind(kind);
}
