"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../../../../lib/auth/guard";
import { parseThreadMessage } from "../../../../lib/factoryThread";
import { sendThreadMessage } from "../../../../lib/factoryThreadServer";
import { createRateLimiter } from "../../../../lib/rateLimit";
import { getServerSupabase } from "../../../../lib/supabase/server";

/* =========================================================
   The team writes to a project's factory
============================================================
   requireRole first (team only), then the message is checked and saved with the team member's own
   session, then translated for the factory (lib/factoryThreadServer.ts). */

const TEAM = ["dcl_staff", "dcl_admin"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isWriteLimited = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

function back(projectId: string, params: Record<string, string>): never {
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/factory", "layout");
  redirect(`/admin/projects/${projectId}?${new URLSearchParams(params).toString()}#thread`);
}

export async function sendTeamMessage(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!UUID_RE.test(projectId)) redirect("/admin/projects?error=invalid");

  const viewer = await requireRole(TEAM, { next: `/admin/projects/${projectId}` });
  if (isWriteLimited(viewer.user.id)) back(projectId, { error: "rate_limited" });

  const supabase = await getServerSupabase();
  const { data: project } = await supabase.from("projects").select("id, factory_id").eq("id", projectId).maybeSingle();
  if (!project) redirect("/admin/projects?error=not_found");
  if (!project.factory_id) back(projectId, { error: "thread_failed", why: "Assign a factory to this project first." });

  const parsed = parseThreadMessage((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  }, "team");
  if (!parsed.ok) back(projectId, { error: "thread_failed", why: parsed.message });

  const result = await sendThreadMessage(supabase, project.id, "team", parsed);
  if (!result.ok) back(projectId, { error: "thread_failed", why: result.message });
  back(projectId, { ok: `thread_${result.outcome}` });
}
