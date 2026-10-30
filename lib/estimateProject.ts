/* =========================================================
   DYE CUT LAB — from a project and the pricing tables to the estimate's inputs
============================================================
   The pricing tables hold rows (snake_case, as the database returns them). The
   estimate calculation (lib/estimate.ts) wants a small typed input. This is the
   bridge, kept pure so it can be tested: which pricing products fit a project,
   which finishes may be offered for it, and how the chosen rows become the
   engine's input. No server-only imports; covered by tests/estimateProject.test.ts.

   Nothing is invented here. If a row is missing or broken it is left out or the
   estimate is refused later by the engine; a missing price is never replaced by
   a guess. */

import type {
  EstimateInput,
  PricingFinish,
  PricingLeadTime,
  PricingMargin,
  PricingProduct,
  PricingTooling,
} from "./estimate.ts";

export type ProductRow = {
  id: string;
  product: string;
  style: string | null;
  min_order: number | null;
  active?: boolean | null;
};

export type TierRow = { product_id: string; min_quantity: number | string; price_per_piece: number | string };

export type FinishRow = {
  id: string;
  name: string;
  applies_to: string | null;
  charge_type: string;
  amount: number | string;
  min_order: number | null;
  active?: boolean | null;
};

export type ToolingRow = { id: string; name: string; cost: number | string; active?: boolean | null };

export type MarginRow = {
  name: string;
  applies_to: string | null;
  margin: number | string;
  min_quantity: number | null;
  max_quantity: number | null;
  active?: boolean | null;
};

export type LeadTimeRow = {
  product: string;
  proof_days: number | null;
  production_days: number | null;
  finish_days: number | null;
  active?: boolean | null;
};

function same(a: string | null | undefined, b: string | null | undefined) {
  return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
}

function isOn(row: { active?: boolean | null }) {
  return row.active !== false;
}

/* The pricing products that fit what the project says it is ("BOX" fits a pricing
   product called "Box", in any style). More than one means several styles exist
   and the team picks. None means there is no price list for it yet. */
export function matchProducts(productType: string | null | undefined, products: ProductRow[]): ProductRow[] {
  if (!productType || !productType.trim()) return [];
  return (Array.isArray(products) ? products : []).filter((row) => isOn(row) && same(row.product, productType));
}

/* The name a finish says it applies to: empty or "all" means every product. */
function appliesTo(value: string | null | undefined, productName: string) {
  const text = (value || "").trim().toLowerCase();
  return !text || text === "all" || text === "all products" || same(text, productName);
}

export function finishesFor(productName: string, rows: FinishRow[]): FinishRow[] {
  return (Array.isArray(rows) ? rows : []).filter((row) => isOn(row) && appliesTo(row.applies_to, productName));
}

export function toEngineProduct(row: ProductRow, tiers: TierRow[]): PricingProduct {
  return {
    product: row.product,
    style: row.style,
    minOrder: row.min_order,
    tiers: (Array.isArray(tiers) ? tiers : [])
      .filter((tier) => tier.product_id === row.id)
      .map((tier) => ({ minQuantity: Number(tier.min_quantity), pricePerPiece: Number(tier.price_per_piece) })),
  };
}

export function toEngineFinish(row: FinishRow): PricingFinish {
  return {
    name: row.name,
    chargeType: row.charge_type === "per_order" ? "per_order" : "per_piece",
    amount: Number(row.amount),
    minOrder: row.min_order,
  };
}

export function toEngineTooling(row: ToolingRow): PricingTooling {
  return { name: row.name, cost: Number(row.cost) };
}

export function toEngineMargin(row: MarginRow): PricingMargin {
  return {
    name: row.name,
    appliesTo: row.applies_to,
    margin: Number(row.margin),
    minQuantity: row.min_quantity,
    maxQuantity: row.max_quantity,
    active: row.active !== false,
  };
}

/* A lead-time row belongs to a product written as "Box" or "Box, Tuck-top mailer"
   (the template's example). The more specific one wins. */
export function pickLeadTime(rows: LeadTimeRow[], product: { product: string; style?: string | null }): PricingLeadTime | null {
  const candidates = (Array.isArray(rows) ? rows : []).filter(isOn);
  const style = (product.style || "").trim();

  const specific = style
    ? candidates.find((row) => same(row.product, `${product.product}, ${style}`) || same(row.product, `${product.product} ${style}`))
    : undefined;
  const general = candidates.find((row) => same(row.product, product.product));
  const row = specific ?? general;
  if (!row) return null;

  return { proofDays: row.proof_days, productionDays: row.production_days, finishDays: row.finish_days };
}

export type EstimateSelection = {
  productId: string;
  finishIds: string[];
  toolingIds: string[];
};

export type EstimateRows = {
  products: ProductRow[];
  tiers: TierRow[];
  finishes: FinishRow[];
  tooling: ToolingRow[];
  margins: MarginRow[];
  leadTimes: LeadTimeRow[];
};

export type BuildResult =
  | { ok: true; input: EstimateInput; product: ProductRow }
  | { ok: false; message: string };

/* Turns the project's quantity, the team's choices and the pricing rows into the
   engine's input. The chosen product must fit the project, and the chosen
   finishes must be ones offered for that product, so a forged form cannot add a
   finish that does not apply. */
export function buildProjectEstimateInput(
  project: { quantity: number | null; product_type: string | null },
  selection: EstimateSelection,
  rows: EstimateRows
): BuildResult {
  if (typeof project.quantity !== "number" || !Number.isInteger(project.quantity) || project.quantity <= 0) {
    return { ok: false, message: "This project has no quantity yet. Set one in its details first." };
  }

  const fitting = matchProducts(project.product_type, rows.products);
  const product = fitting.find((row) => row.id === selection.productId);
  if (!product) {
    return { ok: false, message: `There is no price list for "${project.product_type || "this product"}" yet. Add it under Pricing.` };
  }

  const offered = finishesFor(product.product, rows.finishes);
  const finishes: PricingFinish[] = [];
  for (const id of new Set(selection.finishIds)) {
    const row = offered.find((item) => item.id === id);
    if (!row) return { ok: false, message: "One of the chosen finishes is not available for this product." };
    finishes.push(toEngineFinish(row));
  }

  const tooling: PricingTooling[] = [];
  for (const id of new Set(selection.toolingIds)) {
    const row = (Array.isArray(rows.tooling) ? rows.tooling : []).find((item) => item.id === id && isOn(item));
    if (!row) return { ok: false, message: "One of the chosen tooling items is not available." };
    tooling.push(toEngineTooling(row));
  }

  const engineProduct = toEngineProduct(product, rows.tiers);

  return {
    ok: true,
    product,
    input: {
      quantity: project.quantity,
      product: engineProduct,
      finishes,
      tooling,
      margins: (Array.isArray(rows.margins) ? rows.margins : []).map(toEngineMargin),
      leadTime: pickLeadTime(rows.leadTimes, engineProduct),
      /* Shipping is added last, outside the instant estimate (client, Oct 29): no
         freight and no shipment are passed, so the estimate says it is excluded. */
    },
  };
}
