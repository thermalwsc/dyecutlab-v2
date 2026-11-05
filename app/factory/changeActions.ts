"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../../lib/auth/guard";
import { changeDatabaseMessage, parseFactoryChange } from "../../lib/factoryChange";
import { createRateLimiter } from "../../lib/rateLimit";
import { getServerSupabase } from "../../lib/supabase/server";

/* =========================================================
   The factory's change notes: server action
============================================================
   Recording a change (what the factory changed, and why):
     1. requireRole(["factory"]): the session decides who is asking
     2. the project is found through the factory's OWN client, so it must be assigned
        to this factory (Row Level Security + an explicit filter)
     3. what was typed is checked again here (lib/factoryChange.ts)
     4. the note is saved with the factory's own session. The database fills in the
        factory, the writer and the time, so none of those can be forged, and a note
        can never be edited or deleted afterwards. Nothing here uses the service role. */

const NUMBER_RE = /^[A-Za-z0-9-]{3,32}$/;
const isWriteLimited = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

function back(path: string, params: Record<string, string>): never {
  revalidatePath("/factory", "layout");
  revalidatePath("/admin", "layout");
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}

export async function recordFactoryChange(formData: FormData) {
  const number = String(formData.get("project_number") ?? "").trim();
  if (!NUMBER_RE.test(number)) back("/factory", { error: "invalid" });
  const path = `/factory/projects/${encodeURIComponent(number)}`;

  const { user, profile } = await requireRole(["factory"], { next: path });
  if (isWriteLimited(user.id)) back(path, { error: "rate_limited" });
  if (!profile?.factory_id) back("/factory", { error: "not_found" });

  const supabase = await getServerSupabase();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("project_number", number)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (!project) back("/factory", { error: "not_found" });

  const parsed = parseFactoryChange((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  });
  if (!parsed.ok) back(path, { error: "change_invalid", why: parsed.message });

  const { error } = await supabase.from("factory_change_notes").insert({
    project_id: project.id,
    kind: parsed.value.kind,
    what_changed: parsed.value.what_changed,
    reason: parsed.value.reason,
  });
  if (error) {
    console.error("FACTORY CHANGE NOTE ERROR:", error.code, error.message);
    back(path, { error: "change_invalid", why: changeDatabaseMessage(error) });
  }

  back(path, { ok: "change_recorded" });
}
