import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { estimate, type EstimateResult } from "./estimate";
import {
  buildProjectEstimateInput,
  type EstimateRows,
  type EstimateSelection,
  type ProductRow,
} from "./estimateProject";
import type { EstimateInput } from "./estimate";

/* =========================================================
   Loading the pricing rows and working out a project's estimate (server only)
============================================================
   Use it with the SIGNED-IN team member's client (getServerSupabase()). The
   pricing tables are private to the DYE CUT LAB team, so for anyone else the
   rows come back empty and there is simply nothing to estimate. The numbers
   are always worked out here from the database, never taken from a form. */

export type ProjectForEstimate = { id: string; quantity: number | null; product_type: string | null };

export async function loadEstimateRows(supabase: SupabaseClient): Promise<EstimateRows> {
  const [products, tiers, finishes, tooling, margins, leadTimes] = await Promise.all([
    supabase.from("pricing_products").select("id, product, style, min_order, active").eq("active", true).order("product").order("style"),
    supabase.from("pricing_product_tiers").select("product_id, min_quantity, price_per_piece"),
    supabase.from("pricing_finishes").select("id, name, applies_to, charge_type, amount, min_order, active").eq("active", true).order("name"),
    supabase.from("pricing_tooling").select("id, name, cost, active").eq("active", true).order("name"),
    supabase.from("pricing_margins").select("name, applies_to, margin, min_quantity, max_quantity, active").eq("active", true),
    supabase.from("pricing_lead_times").select("product, proof_days, production_days, finish_days, active").eq("active", true),
  ]);

  for (const [name, result] of Object.entries({ products, tiers, finishes, tooling, margins, leadTimes })) {
    if (result.error) console.error("PRICING LOAD ERROR:", name, result.error.message);
  }

  return {
    products: (products.data ?? []) as ProductRow[],
    tiers: (tiers.data ?? []) as EstimateRows["tiers"],
    finishes: (finishes.data ?? []) as EstimateRows["finishes"],
    tooling: (tooling.data ?? []) as EstimateRows["tooling"],
    margins: (margins.data ?? []) as EstimateRows["margins"],
    leadTimes: (leadTimes.data ?? []) as EstimateRows["leadTimes"],
  };
}

export type ProjectEstimate =
  | { ok: true; input: EstimateInput; result: EstimateResult }
  | { ok: false; message: string };

export function computeProjectEstimate(project: ProjectForEstimate, selection: EstimateSelection, rows: EstimateRows): ProjectEstimate {
  const built = buildProjectEstimateInput(project, selection, rows);
  if (!built.ok) return { ok: false, message: built.message };
  return { ok: true, input: built.input, result: estimate(built.input) };
}
