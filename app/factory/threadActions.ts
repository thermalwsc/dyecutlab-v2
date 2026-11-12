"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../../lib/auth/guard";
import { parseThreadMessage } from "../../lib/factoryThread";
import { sendThreadMessage } from "../../lib/factoryThreadServer";
import { createRateLimiter } from "../../lib/rateLimit";
import { getServerSupabase } from "../../lib/supabase/server";

/* =========================================================
   The factory writes to DYE CUT LAB
============================================================
   requireRole(["factory"]) first. The project is found through the factory's OWN session, so it must
   be assigned to this factory. The message is saved with that session (the database fills in the
   factory, the side and the writer), then translated into English for the team. */

const NUMBER_RE = /^[A-Za-z0-9-]{3,32}$/;
const isWriteLimited = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

function back(path: string, params: Record<string, string>): never {
  revalidatePath("/factory", "layout");
  revalidatePath("/admin", "layout");
  redirect(`${path}?${new URLSearchParams(params).toString()}#thread`);
}

export async function sendFactoryMessage(formData: FormData) {
  const number = String(formData.get("project_number") ?? "").trim();
  if (!NUMBER_RE.test(number)) redirect("/factory?error=invalid");
  const path = `/factory/projects/${encodeURIComponent(number)}`;

  const { user, profile } = await requireRole(["factory"], { next: path });
  if (isWriteLimited(user.id)) back(path, { error: "rate_limited" });
  if (!profile?.factory_id) redirect("/factory?error=not_found");

  const supabase = await getServerSupabase();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("project_number", number)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (!project) redirect("/factory?error=not_found");

  const parsed = parseThreadMessage((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  }, "factory");
  if (!parsed.ok) back(path, { error: "thread_failed", why: parsed.message });

  const result = await sendThreadMessage(supabase, project.id, "factory", parsed);
  if (!result.ok) back(path, { error: "thread_failed", why: result.message });
  back(path, { ok: `thread_${result.outcome}` });
}
