"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../../lib/auth/guard";
import { sendStaffFactoryQuoteEmail } from "../../lib/brevo";
import { canQuoteInStatus, parseFactoryQuote, quoteDatabaseMessage } from "../../lib/factoryQuote";
import { createRateLimiter } from "../../lib/rateLimit";
import { getServerSupabase } from "../../lib/supabase/server";

/* =========================================================
   The factory's quote: server action
============================================================
   Sending a quote:
     1. requireRole(["factory"]): the session decides who is asking
     2. the project is found through the factory's OWN client, so it must be assigned
        to this factory (Row Level Security + an explicit filter)
     3. the project must still be open for quotes, and must not already have an
        approved one
     4. what was typed is checked again here (lib/factoryQuote.ts)
     5. the quote is saved with the factory's own session. The database fills in the
        version, the factory, the status and who sent it, so none of those can be
        forged, and it works out the total. Nothing here ever uses the service role. */

const NUMBER_RE = /^[A-Za-z0-9-]{3,32}$/;
const isWriteLimited = createRateLimiter({ windowMs: 60_000, maxRequests: 10 });

function back(path: string, params: Record<string, string>): never {
  revalidatePath("/factory", "layout");
  revalidatePath("/admin", "layout");
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}

export async function sendFactoryQuote(formData: FormData) {
  const number = String(formData.get("project_number") ?? "").trim();
  if (!NUMBER_RE.test(number)) back("/factory", { error: "invalid" });
  const path = `/factory/projects/${encodeURIComponent(number)}`;

  const { user, profile } = await requireRole(["factory"], { next: path });
  if (isWriteLimited(user.id)) back(path, { error: "rate_limited" });
  if (!profile?.factory_id) back("/factory", { error: "not_found" });

  const supabase = await getServerSupabase();
  const { data: project } = await supabase
    .from("projects")
    .select("id, status")
    .eq("project_number", number)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (!project) back("/factory", { error: "not_found" });

  if (!canQuoteInStatus(project.status)) back(path, { error: "quote_closed" });

  const { data: approved } = await supabase
    .from("factory_quotes")
    .select("id")
    .eq("project_id", project.id)
    .eq("status", "approved")
    .limit(1);
  if (approved && approved.length > 0) back(path, { error: "quote_approved" });

  const parsed = parseFactoryQuote((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  });
  if (!parsed.ok) back(path, { error: "quote_invalid", why: parsed.message });

  /* Only the columns a sender may choose. Version, factory, status and sender are
     set by the database. */
  const { error } = await supabase.from("factory_quotes").insert({
    project_id: project.id,
    quantity: parsed.value.quantity,
    price_per_piece: parsed.value.price_per_piece,
    tooling_cost: parsed.value.tooling_cost,
    lead_days: parsed.value.lead_days,
    notes: parsed.value.notes,
  });
  if (error) {
    console.error("FACTORY QUOTE ERROR:", error.code, error.message);
    back(path, { error: "quote_invalid", why: quoteDatabaseMessage(error) });
  }

  back(path, { ok: "quote_sent" });
}
