import "server-only";

import { sendCustomerStageEmail } from "./brevo";
import { buildStageEmail, shouldEmailStageChange } from "./stageEmail";
import { getServiceRoleSupabase, isServiceRoleConfigured } from "./supabase/admin";

/* =========================================================
   DYE CUT LAB — telling a customer their project moved on
============================================================
   Called by the two places that change a stage: the team's project form and the
   factory's status buttons, right after the change is saved.

   It never throws and never blocks the change: if anything is missing or the
   email fails, it is logged and the stage change stands. It emails only the
   project's owner, only when the owner is an active customer with an email, and
   only for a real step forward (see lib/stageEmail.ts). */

export async function notifyCustomerOfStageChange(input: {
  projectId: string;
  fromStatus: string | null | undefined;
  toStatus: string | null | undefined;
}) {
  try {
    if (!input.toStatus || !shouldEmailStageChange(input.fromStatus, input.toStatus)) return;
    if (!isServiceRoleConfigured()) return;

    const admin = getServiceRoleSupabase();
    const { data: project } = await admin
      .from("projects")
      .select("project_number, title, owner_id")
      .eq("id", input.projectId)
      .maybeSingle();
    if (!project?.owner_id) return;

    const { data: owner } = await admin
      .from("profiles")
      .select("full_name, email, role, disabled_at")
      .eq("id", project.owner_id)
      .maybeSingle();
    if (!owner?.email || owner.role !== "customer" || owner.disabled_at) return;

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://dyecutlab.com").replace(/\/$/, "");
    const email = buildStageEmail({
      projectNumber: project.project_number as string,
      title: project.title as string | null,
      toStatus: input.toStatus,
      customerName: owner.full_name as string | null,
      projectUrl: `${siteUrl}/project/${encodeURIComponent(project.project_number as string)}`,
    });

    const result = await sendCustomerStageEmail({ ...email, to: owner.email as string });
    if (result.status === "failed") {
      console.error("CUSTOMER STAGE EMAIL NOT SENT:", { project: project.project_number, result });
    }
  } catch (error) {
    console.error("CUSTOMER STAGE EMAIL ERROR:", error);
  }
}
