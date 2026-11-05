import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Estimate, EstimateInput } from "./estimate";
import { buildQuoteVersionArgs, type SaveQuoteVersionArgs } from "./quoteVersions";

/* =========================================================
   Saving a quote version (server only)
============================================================
   Call this with the SIGNED-IN team member's client (getServerSupabase()), not
   the service role: save_quote_version() runs as the caller, so the database's
   own rules refuse anyone who is not on the DYE CUT LAB team. A saved version
   cannot be edited or deleted afterwards. */

export type SaveQuoteVersionResult =
  | { ok: true; version: number; id: string }
  | { ok: false; reason: "invalid" | "not_allowed" | "duplicate" | "failed" };

export async function saveQuoteVersion(
  supabase: SupabaseClient,
  projectId: string,
  input: EstimateInput,
  estimate: Estimate
): Promise<SaveQuoteVersionResult> {
  let args;
  try {
    args = buildQuoteVersionArgs(projectId, input, estimate);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  return saveQuoteVersionArgs(supabase, args);
}

/* The same save, from arguments that are already built (a verified quote). A
   second verified quote for the same factory quote is refused by the database
   (unique_violation); it is reported as "duplicate" so a retry can treat it as
   already done. */
export async function saveQuoteVersionArgs(
  supabase: SupabaseClient,
  args: SaveQuoteVersionArgs
): Promise<SaveQuoteVersionResult> {
  const { data, error } = await supabase.rpc("save_quote_version", args);
  if (error) {
    console.error("QUOTE VERSION SAVE ERROR:", error.code, error.message);
    if (error.code === "23505") return { ok: false, reason: "duplicate" };
    return { ok: false, reason: error.code === "42501" ? "not_allowed" : "failed" };
  }

  const row = (Array.isArray(data) ? data[0] : data) as { id?: string; version?: number } | null;
  if (!row || typeof row.id !== "string" || typeof row.version !== "number") {
    return { ok: false, reason: "failed" };
  }
  return { ok: true, version: row.version, id: row.id };
}
