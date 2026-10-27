"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../../../lib/auth/guard";
import { createRateLimiter } from "../../../lib/rateLimit";
import { getServerSupabase } from "../../../lib/supabase/server";
import { databaseErrorMessage, findPricingTable, parsePricingRow } from "../../../lib/pricingAdmin";

/* =========================================================
   Pricing screen (/admin/pricing) server actions
============================================================
   Every action:
     1. requireRole first — the acting user comes from the session cookie
     2. takes a table KEY ("finishes"), never a table or column name, and maps it
        through lib/pricingAdmin.ts
     3. checks every value again (lib/pricingAdmin.ts), then writes with the
        signed-in user's own client. The pricing tables' rules allow only the
        DYE CUT LAB team, so even a forged request from anyone else changes
        nothing.
     4. redirects back with ?ok= / ?error= for an inline message. */

const TEAM = ["dcl_staff", "dcl_admin"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isWriteLimited = createRateLimiter({ windowMs: 60_000, maxRequests: 60 });

function uuid(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return UUID_RE.test(s) ? s : null;
}

function go(key: string, params: Record<string, string>): never {
  revalidatePath("/admin/pricing");
  const query = new URLSearchParams({ table: key, ...params });
  redirect(`/admin/pricing?${query.toString()}`);
}

export async function savePricingRow(formData: FormData) {
  const def = findPricingTable(String(formData.get("table") ?? ""));
  if (!def) redirect("/admin/pricing?error=invalid");

  const viewer = await requireRole(TEAM, { next: `/admin/pricing?table=${def.key}` });
  if (isWriteLimited(viewer.user.id)) go(def.key, { error: "rate_limited" });

  const supabase = await getServerSupabase();

  let productIds: string[] = [];
  if (def.key === "tiers") {
    const { data } = await supabase.from("pricing_products").select("id");
    productIds = (data ?? []).map((row) => String(row.id));
  }

  const parsed = parsePricingRow(def, (name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  }, productIds);
  if (!parsed.ok) go(def.key, { error: "pricing_invalid", why: parsed.message });

  const rawId = formData.get("id");
  const id = uuid(rawId);
  if (rawId && !id) go(def.key, { error: "invalid" });

  if (id) {
    const { data, error } = await supabase.from(def.table).update(parsed.row).eq("id", id).select("id");
    if (error) {
      console.error("PRICING UPDATE ERROR:", def.table, error.code, error.message);
      go(def.key, { error: "pricing_invalid", why: databaseErrorMessage(error) });
    }
    if (!data || data.length === 0) go(def.key, { error: "not_found" });
    go(def.key, { ok: "pricing_saved" });
  }

  const { error } = await supabase.from(def.table).insert(parsed.row);
  if (error) {
    console.error("PRICING INSERT ERROR:", def.table, error.code, error.message);
    go(def.key, { error: "pricing_invalid", why: databaseErrorMessage(error) });
  }
  go(def.key, { ok: "pricing_added" });
}

export async function deletePricingRow(formData: FormData) {
  const def = findPricingTable(String(formData.get("table") ?? ""));
  if (!def) redirect("/admin/pricing?error=invalid");

  const viewer = await requireRole(TEAM, { next: `/admin/pricing?table=${def.key}` });
  if (isWriteLimited(viewer.user.id)) go(def.key, { error: "rate_limited" });

  const id = uuid(formData.get("id"));
  if (!id) go(def.key, { error: "invalid" });
  if (formData.get("confirm") !== "yes") go(def.key, { error: "pricing_need_confirm" });

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.from(def.table).delete().eq("id", id).select("id");
  if (error) {
    console.error("PRICING DELETE ERROR:", def.table, error.code, error.message);
    go(def.key, { error: "pricing_invalid", why: databaseErrorMessage(error) });
  }
  if (!data || data.length === 0) go(def.key, { error: "not_found" });
  go(def.key, { ok: "pricing_deleted" });
}
