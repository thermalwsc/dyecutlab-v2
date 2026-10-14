/* =========================================================
   DYE CUT LAB — how many pieces a customer's order becomes
============================================================
   One rule used by both chats and the AI prompts, so the same order never shows
   two different numbers. Confirmed by the client on Oct 15, 2026:
     - one unit is 128 finished pieces
     - bulk orders must be in multiples of 100, so the whole order is rounded UP
       to the next 100 (5 units = 640, ordered as 700; 10 units = 1,280, ordered
       as 1,300)
     - with flavors, every flavor must also be a whole multiple of 100 pieces, so
       the total rounds up to a multiple of (flavors x 100)
   Pure functions, covered by tests/production.test.ts. */

export const PIECES_PER_UNIT = 128;
export const ORDER_INCREMENT = 100;

export function roundOrderQuantity(quantity: number) {
  return Math.ceil(quantity / ORDER_INCREMENT) * ORDER_INCREMENT;
}

export function adjustQuantityForFlavors(rawPieces: number, flavorCount: number) {
  const safeFlavorCount = Math.max(1, Math.floor(flavorCount));
  const increment = safeFlavorCount * ORDER_INCREMENT;
  const total = Math.ceil(rawPieces / increment) * increment;

  return { total, perFlavor: total / safeFlavorCount };
}

export type Production = { rawPieces: number; total: number; perFlavor: number };

/* units: whole units the customer wants; flavorCount: 0 or null when not known yet.
   rawPieces is the plain 128-per-unit figure, total is what is ordered.
   Nothing usable gives zeros. perFlavor is 0 until flavors are known. */
export function calculateProduction(units: number | null | undefined, flavorCount?: number | null): Production {
  if (!units || !Number.isFinite(units) || units <= 0) return { rawPieces: 0, total: 0, perFlavor: 0 };

  const rawPieces = Math.ceil(units * PIECES_PER_UNIT);

  if (flavorCount && flavorCount > 0) {
    const adjusted = adjustQuantityForFlavors(rawPieces, flavorCount);
    return { rawPieces, total: adjusted.total, perFlavor: adjusted.perFlavor };
  }

  return { rawPieces, total: roundOrderQuantity(rawPieces), perFlavor: 0 };
}

/* The rule in words, with examples worked out by calculateProduction itself so
   the AI is never told something the app does not do. */
export function productionRuleText() {
  const raw = (units: number) => calculateProduction(units).rawPieces.toLocaleString("en-US");
  const ordered = (units: number, flavors?: number) => calculateProduction(units, flavors).total.toLocaleString("en-US");

  return [
    `One unit is ${PIECES_PER_UNIT} finished pieces. Bulk orders must be in multiples of ${ORDER_INCREMENT}, so the total is rounded up to the next ${ORDER_INCREMENT}.`,
    `Examples: 1 unit = ${raw(1)} pieces, ordered as ${ordered(1)}. 5 units = ${raw(5)} pieces, ordered as ${ordered(5)}. 10 units = ${raw(10)} pieces, ordered as ${ordered(10)}.`,
    `With flavors, each flavor must also be a whole multiple of ${ORDER_INCREMENT} pieces, so the total rounds up to a multiple of flavors x ${ORDER_INCREMENT}: 1 unit with 3 flavors = ${ordered(1, 3)}.`,
  ].join("\n");
}
