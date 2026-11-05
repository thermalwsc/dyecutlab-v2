/* =========================================================
   DYE CUT LAB — the verified quote built from an approved factory quote
============================================================
   When the team approves a factory's quote, the customer's price is worked out
   from it: the factory's price plus tooling is our COST, and the customer's price
   is that cost plus our margin (the same margin rules as an estimate, so 35% on a
   cost of 1.00 sells for 1.54). Shipping is added last, outside this price, as the
   client decided. The result is saved as a "verified" quote version (see
   supabase/migrations/20261104000000_quote_version_kind.sql).

   Pure functions, no server-only imports, covered by tests/verifiedQuote.test.ts.
   Nothing is guessed: with no margin rule that fits, there is no verified quote and
   the team is told to add one. The customer-facing half never holds the factory's
   price, the cost or the margin; those stay in the private details. */

import { pickMargin, type PricingMargin } from "./estimate.ts";
import { VERIFIED_NOTICE, type SaveQuoteVersionArgs } from "./quoteVersions.ts";

export type ApprovedFactoryQuote = {
  id: string;
  quantity: number;
  price_per_piece: number | string;
  tooling_cost: number | string;
  lead_days: number | null;
};

export type VerifiedQuoteResult =
  | { ok: true; args: SaveQuoteVersionArgs & { p_kind: "verified"; p_factory_quote: string }; cost: number; margin: number; sellTotal: number; sellPerPiece: number }
  | { ok: false; message: string };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildVerifiedQuoteArgs(
  projectId: string,
  productName: string,
  quote: ApprovedFactoryQuote,
  margins: PricingMargin[]
): VerifiedQuoteResult {
  if (!UUID_RE.test(projectId) || !UUID_RE.test(quote.id)) {
    return { ok: false, message: "That quote could not be found." };
  }

  const quantity = quote.quantity;
  const price = Number(quote.price_per_piece);
  const tooling = Number(quote.tooling_cost);
  if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(tooling) || tooling < 0) {
    return { ok: false, message: "The factory quote has a number that cannot be used. Ask the factory to send it again." };
  }

  const rule = pickMargin(margins, productName, quantity);
  if (!rule) {
    return { ok: false, message: "No margin rule covers this product and quantity. Add one under Pricing, then approve the quote again." };
  }

  const productCost = round2(quantity * price);
  const toolingCost = round2(tooling);
  const cost = round2(productCost + toolingCost);
  const sellTotal = round2(cost / (1 - rule.margin));
  const sellPerPiece = Math.round((sellTotal / quantity) * 10000) / 10000;

  const lines = [{ label: `Factory quote: ${quantity.toLocaleString("en-US")} pcs x $${price}`, amount: productCost }];
  if (toolingCost > 0) lines.push({ label: "Tooling", amount: toolingCost });

  return {
    ok: true,
    cost,
    margin: rule.margin,
    sellTotal,
    sellPerPiece,
    args: {
      p_project: projectId,
      p_quantity: quantity,
      p_sell_total: sellTotal,
      p_sell_per_piece: sellPerPiece,
      p_lead_days: typeof quote.lead_days === "number" ? quote.lead_days : null,
      p_includes: toolingCost > 0 ? ["product", "tooling"] : ["product"],
      p_excludes: ["freight"],
      p_notice: VERIFIED_NOTICE,
      /* the private snapshot: where it came from and the margin rules used, so a later
         change to either never alters this quote */
      p_inputs: JSON.parse(JSON.stringify({ source: "factory_quote", product: productName, factoryQuote: quote, margins })),
      p_lines: lines,
      p_cost: cost,
      p_margin: rule.margin,
      p_margin_rule: rule.name,
      p_kind: "verified",
      p_factory_quote: quote.id,
    },
  };
}
