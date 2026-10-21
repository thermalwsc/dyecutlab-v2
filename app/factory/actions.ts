"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../../lib/auth/guard";
import { sendStaffFactoryUpdateEmail } from "../../lib/brevo";
import { notifyCustomerOfStageChange } from "../../lib/customerAlerts";
import { factoryMoveFor } from "../../lib/factoryWork";
import { sendStaffFactoryUpdateSms } from "../../lib/sendblue";
import { projectStatusLabel } from "../admin/statuses";
import { createRateLimiter } from "../../lib/rateLimit";
import { getServiceRoleSupabase, isServiceRoleConfigured } from "../../lib/supabase/admin";
import { getServerSupabase } from "../../lib/supabase/server";

/* =========================================================
   Factory portal server actions
============================================================
   A factory may only move a project through the two floor steps
   (production → quality check → shipped; see FACTORY_MOVES). The database
   deliberately does NOT let factory accounts update projects, so the write is
   done here with the service role, and only after:
     1. requireRole(["factory"]) — the session decides who is asking
     2. the project is found through the factory's OWN client, i.e. it is
        assigned to this factory (Row Level Security + an explicit filter)
     3. the move is one the factory is allowed from the project's CURRENT status
        (the form's "from" must match, so a stale page can't skip a stage)
     4. the update itself repeats the factory and status in its WHERE clause,
        so two clicks or a concurrent team change can't double-apply. */

const NUMBER_RE = /^[A-Za-z0-9-]{3,32}$/;
const isWriteLimited = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

function back(path: string, params: Record<string, string>): never {
  revalidatePath("/factory", "layout");
  revalidatePath("/account");
  revalidatePath("/admin", "layout");
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}

export async function moveFactoryProject(formData: FormData) {
  const number = String(formData.get("project_number") ?? "").trim();
  if (!NUMBER_RE.test(number)) back("/factory", { error: "invalid" });
  const path = `/factory/projects/${encodeURIComponent(number)}`;

  const { user, profile } = await requireRole(["factory"], { next: path });
  if (isWriteLimited(user.id)) back(path, { error: "rate_limited" });
  if (!profile?.factory_id) back("/factory", { error: "not_found" });

  const supabase = await getServerSupabase();
  const { data: project } = await supabase
    .from("projects")
    .select("id, status, title")
    .eq("project_number", number)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (!project) back("/factory", { error: "not_found" });

  const move = factoryMoveFor(project.status);
  if (!move || String(formData.get("from") ?? "") !== project.status) back(path, { error: "stale" });

  if (!isServiceRoleConfigured()) back(path, { error: "no_service_key" });
  /* acting_user_id tells the activity history who pressed the button: this write
     uses the service role, so the database cannot see the user itself. The
     trigger records it and clears it again. If the activity migration has not
     been applied yet the column does not exist; then the move is saved without
     it, so the factory's buttons never depend on deploy order. */
  const writeMove = (withActor: boolean) =>
    getServiceRoleSupabase()
      .from("projects")
      .update({
        status: move.to,
        ...(withActor ? { acting_user_id: user.id } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", project.id)
      .eq("factory_id", profile.factory_id)
      .eq("status", project.status)
      .select("id");

  let { data: updated, error } = await writeMove(true);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    ({ data: updated, error } = await writeMove(false));
  }

  if (error || !updated?.length) {
    if (error) console.error("FACTORY MOVE ERROR:", error.message);
    back(path, { error: error ? "save_failed" : "stale" });
  }

  /* Tell the customer their order moved on (never blocks or undoes the update). */
  await notifyCustomerOfStageChange({ projectId: project.id, fromStatus: project.status, toStatus: move.to });

  /* Tell the team (best effort: a failed alert never undoes the update). */
  const admin = getServiceRoleSupabase();
  const { data: factory } = await admin.from("factories").select("name").eq("id", profile.factory_id).maybeSingle();
  const factoryName = factory?.name ?? "A factory";
  const toLabel = projectStatusLabel(move.to);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://dyecutlab.com").replace(/\/$/, "");
  const [sms, email] = await Promise.all([
    sendStaffFactoryUpdateSms({ projectNumber: number, factoryName, toLabel }),
    sendStaffFactoryUpdateEmail({
      projectNumber: number,
      projectTitle: project.title?.trim() || "Untitled project",
      factoryName,
      toLabel,
      projectUrl: `${siteUrl}/admin/projects/${project.id}`,
    }),
  ]);
  if (sms.status !== "sent" && email.status !== "sent") {
    console.error("FACTORY UPDATE STAFF NOT NOTIFIED:", { number, sms, email });
  }

  back(path, { ok: move.ok });
}
