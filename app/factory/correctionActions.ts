"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../../lib/auth/guard";
import { createRateLimiter } from "../../lib/rateLimit";
import { getServerSupabase } from "../../lib/supabase/server";
import { parseCorrection } from "../../lib/translationCorrection";
import { saveCorrection } from "../../lib/translationCorrectionServer";

/* =========================================================
   The factory corrects a translation it reads (a team message, read in Chinese)
============================================================
   requireRole(["factory"]) first. The project is found through the factory's OWN session, so it must be
   assigned to this factory, and the message must belong to it. The correction is saved with the
   factory's own session; the database decides what may be corrected. */

const NUMBER_RE = /^[A-Za-z0-9-]{3,32}$/;
const isWriteLimited = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

function back(path: string, params: Record<string, string>): never {
  revalidatePath("/factory", "layout");
  revalidatePath("/admin", "layout");
  redirect(`${path}?${new URLSearchParams(params).toString()}#thread`);
}

export async function correctFactoryTranslation(formData: FormData) {
  const number = String(formData.get("project_number") ?? "").trim();
  if (!NUMBER_RE.test(number)) redirect("/factory?error=invalid");
  const path = `/factory/projects/${encodeURIComponent(number)}`;

  const { user, profile } = await requireRole(["factory"], { next: path });
  if (isWriteLimited(user.id)) back(path, { error: "rate_limited" });
  if (!profile?.factory_id) redirect("/factory?error=not_found");

  const parsed = parseCorrection((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  });
  if (!parsed.ok) back(path, { error: "correction_failed", why: parsed.message });

  const supabase = await getServerSupabase();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("project_number", number)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (!project) redirect("/factory?error=not_found");

  const { data: message } = await supabase
    .from("factory_messages")
    .select("id")
    .eq("id", parsed.value.message_id)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!message) back(path, { error: "correction_failed", why: "That message could not be found." });

  const result = await saveCorrection(supabase, parsed.value);
  if (!result.ok) back(path, { error: "correction_failed", why: result.message });
  back(path, { ok: `correction_${result.outcome}` });
}
