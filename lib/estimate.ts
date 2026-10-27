/* =========================================================
   DYE CUT LAB — the estimate calculation
============================================================
   Turns the pricing tables (supabase/migrations/20261026000000_pricing_tables.sql)
   into a price for one project. Pure functions, no server-only imports, covered
   by tests/estimate.test.ts. The caller reads the table rows (server only, the
   team's tables are private) and passes them in.

   How the price is built, all in US dollars:

     product    price per piece at the order quantity x quantity
   + finishes   per piece x quantity, or once per order
   + tooling    one-time costs
   + freight    rate x the shipment measure, never below the minimum charge
   = cost
   / (1 - margin)   margin is a share of the selling price (35% on a cost of
                    1.00 sells for 1.54)

   Rules that are on purpose:
   - Quantity is the ORDERED quantity (after the 128-piece unit and
     multiples-of-100 rules in lib/production.ts), not what the customer typed.
   - A price tier applies from its quantity upward: with tiers at 200 and 500, an
     order of 700 pays the 500 price. An order between the smallest order and the
     first tier pays the first tier's price.
   - Nothing is guessed. A missing price, a missing margin, a quantity below the
     smallest order, or a finish that needs more pieces gives no estimate (ok
     false) and the team prices it by hand.
   - Freight needs the shipment's weight, volume or pallets. Without it freight
     is left out and the estimate says so (excludes). The margin is applied to
     everything in the cost, freight included; confirm this with the client.
   - Every figure is rounded to the cent line by line, so the lines always add up
     to the total shown.
   - It is always an estimate: ESTIMATE_NOTICE travels with every result, and
     customerView() never carries costs or margins. */

export const ESTIMATE_NOTICE = "This is an estimate until a factory confirms it.";

export type PricingTier = { minQuantity: number; pricePerPiece: number };

export type PricingProduct = {
  product: string;
  style?: string | null;
  minOrder?: number | null;
  tiers: PricingTier[];
};

export type PricingFinish = {
  name: string;
  chargeType: "per_piece" | "per_order";
  amount: number;
  minOrder?: number | null;
};

export type PricingTooling = { name: string; cost: number };

export type PricingFreight = {
  method: string;
  destination: string;
  chargedBy: "kilogram" | "cubic_metre" | "pallet" | "order";
  rate: number;
  minCharge?: number | null;
  transitDays?: number | null;
};

export type Shipment = { kg?: number | null; cbm?: number | null; pallets?: number | null };

export type PricingMargin = {
  name: string;
  appliesTo?: string | null;
  margin: number;
  minQuantity?: number | null;
  maxQuantity?: number | null;
  active?: boolean;
};

export type PricingLeadTime = {
  proofDays?: number | null;
  productionDays?: number | null;
  finishDays?: number | null;
};

export type EstimateInput = {
  quantity: number;
  product: PricingProduct;
  finishes?: PricingFinish[];
  tooling?: PricingTooling[];
  freight?: PricingFreight | null;
  shipment?: Shipment;
  margins: PricingMargin[];
  leadTime?: PricingLeadTime | null;
};

export type EstimateLine = { label: string; amount: number };

export type Estimate = {
  ok: true;
  isEstimate: true;
  notice: string;
  quantity: number;
  tierMinQuantity: number;
  pricePerPiece: number;
  lines: EstimateLine[];
  cost: number;
  margin: number;
  marginRule: string;
  sellTotal: number;
  sellPerPiece: number;
  leadDays: { proof: number; production: number; finishes: number; transit: number; total: number };
  includes: string[];
  excludes: string[];
};

export type EstimateRefusal = {
  ok: false;
  reason:
    | "bad_quantity"
    | "below_minimum"
    | "no_pricing"
    | "finish_minimum"
    | "bad_number"
    | "no_margin";
  detail: string;
};

export type EstimateResult = Estimate | EstimateRefusal;

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function sameName(a: string | null | undefined, b: string | null | undefined) {
  return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
}

/* The tier that prices this quantity: the highest tier at or below it, or the
   lowest tier when the quantity is between the smallest order and that tier. */
export function pickTier(tiers: PricingTier[], quantity: number): PricingTier | null {
  const valid = (Array.isArray(tiers) ? tiers : []).filter(
    (tier) => tier && Number.isFinite(tier.minQuantity) && tier.minQuantity > 0 && isMoney(tier.pricePerPiece)
  );
  if (valid.length === 0) return null;

  const sorted = [...valid].sort((a, b) => a.minQuantity - b.minQuantity);
  let chosen = sorted[0];
  for (const tier of sorted) {
    if (tier.minQuantity <= quantity) chosen = tier;
  }
  return chosen;
}

/* The margin rule for this product and quantity. A rule written for this product
   beats a general one; a narrower quantity range beats a wider one. No matching
   rule means no margin, and the estimate is refused rather than guessed. */
export function pickMargin(margins: PricingMargin[], productName: string, quantity: number): PricingMargin | null {
  let best: { rule: PricingMargin; specific: number; width: number } | null = null;

  for (const rule of Array.isArray(margins) ? margins : []) {
    if (!rule || rule.active === false) continue;
    if (typeof rule.margin !== "number" || !Number.isFinite(rule.margin) || rule.margin < 0 || rule.margin >= 0.95) continue;

    const min = rule.minQuantity ?? 0;
    const max = rule.maxQuantity ?? Infinity;
    if (quantity < min || quantity > max) continue;

    const applies = (rule.appliesTo || "").trim().toLowerCase();
    let specific = 0;
    if (!applies || applies === "all" || applies === "all products") specific = 1;
    else if (sameName(applies, productName)) specific = 2;
    else continue;

    const width = max - min;
    if (
      !best ||
      specific > best.specific ||
      (specific === best.specific && width < best.width)
    ) {
      best = { rule, specific, width };
    }
  }

  return best ? best.rule : null;
}

function freightCharge(freight: PricingFreight, shipment: Shipment | undefined): number | null {
  if (!isMoney(freight.rate)) return null;

  let measure: number | null | undefined;
  if (freight.chargedBy === "order") measure = 1;
  else if (freight.chargedBy === "kilogram") measure = shipment?.kg;
  else if (freight.chargedBy === "cubic_metre") measure = shipment?.cbm;
  else if (freight.chargedBy === "pallet") measure = shipment?.pallets;

  if (typeof measure !== "number" || !Number.isFinite(measure) || measure <= 0) return null;

  const raw = freight.rate * measure;
  const min = isMoney(freight.minCharge) ? freight.minCharge : 0;
  return round2(Math.max(raw, min));
}

function days(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export function estimate(input: EstimateInput): EstimateResult {
  const quantity = input?.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, reason: "bad_quantity", detail: "The quantity must be a whole number above zero." };
  }

  const product = input.product;
  if (!product) {
    return { ok: false, reason: "no_pricing", detail: "There is no pricing for this product yet." };
  }

  if (isMoney(product.minOrder) && product.minOrder > 0 && quantity < product.minOrder) {
    return {
      ok: false,
      reason: "below_minimum",
      detail: `The smallest order for ${product.product} is ${product.minOrder.toLocaleString("en-US")} pieces.`,
    };
  }

  const tier = pickTier(product.tiers, quantity);
  if (!tier) {
    return { ok: false, reason: "no_pricing", detail: `There is no price list for ${product.product} yet.` };
  }

  const lines: EstimateLine[] = [];
  const productTotal = round2(tier.pricePerPiece * quantity);
  lines.push({ label: `${product.product}: ${quantity.toLocaleString("en-US")} pcs x $${tier.pricePerPiece}`, amount: productTotal });

  const finishes = input.finishes ?? [];
  for (const finish of finishes) {
    if (!finish || !isMoney(finish.amount)) {
      return { ok: false, reason: "bad_number", detail: `The charge for ${finish?.name || "a finish"} is missing or invalid.` };
    }
    if (isMoney(finish.minOrder) && finish.minOrder > 0 && quantity < finish.minOrder) {
      return {
        ok: false,
        reason: "finish_minimum",
        detail: `${finish.name} needs at least ${finish.minOrder.toLocaleString("en-US")} pieces.`,
      };
    }
    const amount = finish.chargeType === "per_piece" ? round2(finish.amount * quantity) : round2(finish.amount);
    lines.push({
      label: finish.chargeType === "per_piece" ? `${finish.name}: ${quantity.toLocaleString("en-US")} pcs x $${finish.amount}` : `${finish.name}: once per order`,
      amount,
    });
  }

  const tooling = input.tooling ?? [];
  for (const item of tooling) {
    if (!item || !isMoney(item.cost)) {
      return { ok: false, reason: "bad_number", detail: `The cost of ${item?.name || "a tool"} is missing or invalid.` };
    }
    lines.push({ label: `Tooling: ${item.name}`, amount: round2(item.cost) });
  }

  const includes = ["product"];
  if (finishes.length > 0) includes.push("finishes");
  if (tooling.length > 0) includes.push("tooling");
  const excludes: string[] = [];

  let transit = 0;
  if (input.freight) {
    const charge = freightCharge(input.freight, input.shipment);
    if (charge === null) {
      excludes.push("freight");
    } else {
      lines.push({ label: `Freight: ${input.freight.method} to ${input.freight.destination}`, amount: charge });
      includes.push("freight");
      transit = days(input.freight.transitDays);
    }
  } else {
    excludes.push("freight");
  }

  const cost = round2(lines.reduce((sum, line) => sum + line.amount, 0));

  const rule = pickMargin(input.margins, product.product, quantity);
  if (!rule) {
    return { ok: false, reason: "no_margin", detail: "No margin rule covers this product and quantity." };
  }

  const sellTotal = round2(cost / (1 - rule.margin));
  const sellPerPiece = Math.round((sellTotal / quantity) * 10000) / 10000;

  const lead = input.leadTime ?? null;
  const proof = days(lead?.proofDays);
  const production = days(lead?.productionDays);
  const finishDays = finishes.length > 0 ? days(lead?.finishDays) : 0;

  return {
    ok: true,
    isEstimate: true,
    notice: ESTIMATE_NOTICE,
    quantity,
    tierMinQuantity: tier.minQuantity,
    pricePerPiece: tier.pricePerPiece,
    lines,
    cost,
    margin: rule.margin,
    marginRule: rule.name,
    sellTotal,
    sellPerPiece,
    leadDays: { proof, production, finishes: finishDays, transit, total: proof + production + finishDays + transit },
    includes,
    excludes,
  };
}

/* What a customer may see: the price, the timing and what is and is not
   included. Never the cost lines, the tier, the margin or the rule's name. */
export type CustomerEstimate = {
  label: "Estimate";
  notice: string;
  quantity: number;
  total: number;
  perPiece: number;
  currency: "USD";
  leadDays: number;
  includes: string[];
  excludes: string[];
};

export function customerView(result: EstimateResult): CustomerEstimate | null {
  if (!result.ok) return null;
  return {
    label: "Estimate",
    notice: result.notice,
    quantity: result.quantity,
    total: result.sellTotal,
    perPiece: result.sellPerPiece,
    currency: "USD",
    leadDays: result.leadDays.total,
    includes: [...result.includes],
    excludes: [...result.excludes],
  };
}
