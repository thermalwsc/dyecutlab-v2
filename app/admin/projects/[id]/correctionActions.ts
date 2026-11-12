"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../../../../lib/auth/guard";
import { createRateLimiter } from "../../../../lib/rateLimit";
import { getServerSupabase } from "../../../../lib/supabase/server";
import { parseCorrection } from "../../../../lib/translationCorrection";
import { saveCorrection } from "../../../../lib/translationCorrectionServer";

/* =========================================================
   The team corrects a translation it reads (a factory message, read in English)
============================================================
   requireRole first (team only). The message must belong to the project on screen. The correction is
   saved with the team member's own session; the database decides what may be corrected. */

const TEAM = ["dcl_staff", "dcl_admin"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isWriteLimited = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

function back(projectId: string, params: Record<string, string>): never {
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/factory", "layout");
  redirect(`/admin/projects/${projectId}?${new URLSearchParams(params).toString()}#thread`);
}

export async function correctTeamTranslation(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!UUID_RE.test(projectId)) redirect("/admin/projects?error=invalid");

  const viewer = await requireRole(TEAM, { next: `/admin/projects/${projectId}` });
  if (isWriteLimited(viewer.user.id)) back(projectId, { error: "rate_limited" });

  const parsed = parseCorrection((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  });
  if (!parsed.ok) back(projectId, { error: "correction_failed", why: parsed.message });

  const supabase = await getServerSupabase();
  const { data: message } = await supabase
    .from("factory_messages")
    .select("id")
    .eq("id", parsed.value.message_id)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!message) back(projectId, { error: "correction_failed", why: "That message could not be found." });

  const result = await saveCorrection(supabase, parsed.value);
  if (!result.ok) back(projectId, { error: "correction_failed", why: result.message });
  back(projectId, { ok: `correction_${result.outcome}` });
}
