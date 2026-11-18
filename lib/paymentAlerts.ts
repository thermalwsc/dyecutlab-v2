import "server-only";

import { sendCustomerPaymentEmail, sendStaffPaymentEmail } from "./brevo";
import { isEmailablePayment } from "./paymentEmail";
import { getServiceRoleSupabase, isServiceRoleConfigured } from "./supabase/admin";

/* =========================================================
   DYE CUT LAB — telling the customer and the team a payment arrived
============================================================
   Called by the Square webhook right after a payment is recorded as paid.

   It never throws and never blocks or undoes the payment: if anything is missing or an email fails, it is
   logged and the payment stands. The customer's receipt goes only to the project's owner, and only when
   the owner is an active customer with an email. The team alert goes to the usual team address. */

export async function notifyPaymentPaid(input: { paymentId: string; movedToProof: boolean }) {
  try {
    if (!isServiceRoleConfigured()) return;
    const admin = getServiceRoleSupabase();

    const { data: payment } = await admin
      .from("payments")
      .select("id, kind, amount_cents, receipt_url, project_id")
      .eq("id", input.paymentId)
      .maybeSingle();
    if (!payment || !isEmailablePayment(payment.kind)) return;

    const { data: project } = await admin
      .from("projects")
      .select("project_number, title, owner_id")
      .eq("id", payment.project_id)
      .maybeSingle();
    if (!project) return;

    const { data: owner } = project.owner_id
      ? await admin.from("profiles").select("full_name, email, role, disabled_at").eq("id", project.owner_id).maybeSingle()
      : { data: null };

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://dyecutlab.com").replace(/\/$/, "");
    const projectNumber = project.project_number as string;
    const customerUrl = `${siteUrl}/project/${encodeURIComponent(projectNumber)}`;

    if (owner?.email && owner.role === "customer" && !owner.disabled_at) {
      const receipt = await sendCustomerPaymentEmail({
        to: owner.email as string,
        kind: payment.kind,
        amountCents: payment.amount_cents as number,
        projectNumber,
        title: project.title as string | null,
        customerName: owner.full_name as string | null,
        receiptUrl: payment.receipt_url as string | null,
        projectUrl: customerUrl,
      });
      if (receipt.status === "failed") console.error("CUSTOMER PAYMENT EMAIL NOT SENT:", { project: projectNumber, receipt });
    }

    const staff = await sendStaffPaymentEmail({
      kind: payment.kind,
      amountCents: payment.amount_cents as number,
      projectNumber,
      projectTitle: project.title as string | null,
      customerName: (owner?.full_name as string | null) ?? null,
      movedToProof: input.movedToProof,
      projectUrl: `${siteUrl}/admin/projects/${payment.project_id}`,
    });
    if (staff.status === "failed") console.error("STAFF PAYMENT EMAIL NOT SENT:", { project: projectNumber, staff });
  } catch (error) {
    console.error("PAYMENT ALERT ERROR:", error);
  }
}
