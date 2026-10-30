"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../../../../lib/auth/guard";
import { createRateLimiter } from "../../../../lib/rateLimit";
import { getServerSupabase } from "../../../../lib/supabase/server";
import { computeProjectEstimate, loadEstimateRows } from "../../../../lib/estimateServer";
import { saveQuoteVersion } from "../../../../lib/quoteSave";

/* =========================================================
   Estimate actions on the team's project page
============================================================
   Every action:
     1. requireRole first — only the DYE CUT LAB team
     2. takes ids only (project, product, finishes, tooling, version). No price or
        total ever comes from the browser: the estimate is worked out again here
        from the pricing tables, then saved through the signed-in user's own
        session, so the database's team-only rules apply as well
     3. redirects back to the project with ?ok= / ?error= for an inline message. */

const TEAM = ["dcl_staff", "dcl_admin"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isWriteLimited = createRateLimiter({ windowMs: 60_000, maxRequests: 30 });

function uuid(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return UUID_RE.test(s) ? s : null;
}

function uuids(values: FormDataEntryValue[]): string[] {
  return values.map((value) => uuid(value)).filter((id): id is string => id !== null);
}

function back(projectId: string, params: Record<string, string>): never {
  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/admin/projects/${projectId}?${new URLSearchParams(params).toString()}`);
}

export async function saveEstimateVersion(formData: FormData) {
  const projectId = uuid(formData.get("project_id"));
  if (!projectId) redirect("/admin/projects?error=invalid");

  const viewer = await requireRole(TEAM, { next: `/admin/projects/${projectId}` });
  if (isWriteLimited(viewer.user.id)) back(projectId, { error: "rate_limited" });

  const productId = uuid(formData.get("product"));
  if (!productId) back(projectId, { error: "estimate_failed", why: "Choose a product first." });

  const supabase = await getServerSupabase();
  const { data: project } = await supabase.from("projects").select("id, quantity, product_type").eq("id", projectId).maybeSingle();
  if (!project) back(projectId, { error: "not_found" });

  const rows = await loadEstimateRows(supabase);
  const computed = computeProjectEstimate(
    project,
    { productId, finishIds: uuids(formData.getAll("finish")), toolingIds: uuids(formData.getAll("tooling")) },
    rows
  );
  if (!computed.ok) back(projectId, { error: "estimate_failed", why: computed.message });
  if (!computed.result.ok) back(projectId, { error: "estimate_failed", why: computed.result.detail });

  const saved = await saveQuoteVersion(supabase, projectId, computed.input, computed.result);
  if (!saved.ok) {
    back(projectId, {
      error: "estimate_failed",
      why: saved.reason === "not_allowed" ? "You don't have access to save an estimate." : "The estimate could not be saved. Please try again.",
    });
  }
  back(projectId, { ok: "estimate_saved", version: String(saved.version) });
}

export async function setEstimateShown(formData: FormData) {
  const projectId = uuid(formData.get("project_id"));
  if (!projectId) redirect("/admin/projects?error=invalid");

  const viewer = await requireRole(TEAM, { next: `/admin/projects/${projectId}` });
  if (isWriteLimited(viewer.user.id)) back(projectId, { error: "rate_limited" });

  const versionId = uuid(formData.get("version_id"));
  if (!versionId) back(projectId, { error: "invalid" });
  const shown = formData.get("shown") === "1";

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("quote_versions")
    .update({ shown_to_customer: shown })
    .eq("id", versionId)
    .eq("project_id", projectId)
    .select("id");
  if (error) {
    console.error("ESTIMATE SHOWN ERROR:", error.code, error.message);
    back(projectId, { error: "save_failed" });
  }
  if (!data || data.length === 0) back(projectId, { error: "not_found" });
  back(projectId, { ok: shown ? "estimate_shown" : "estimate_hidden" });
}
