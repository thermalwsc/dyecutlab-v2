/* =========================================================
   DYE CUT LAB — the factory quote: its life, its total, its wording
============================================================
   Mirrors the rules the database enforces (supabase/migrations/
   20261102000000_factory_quotes.sql) so the screens can offer only the moves
   that will be accepted, and so the same words are used everywhere. Pure
   functions, no server-only imports, covered by tests/factoryQuote.test.ts.

   The database is the last line of defence: if these rules and the database ever
   disagree, the database wins and the screen shows its refusal in plain words. */

export const FACTORY_QUOTE_STATUSES = ["submitted", "approved", "rejected", "superseded"] as const;
export type FactoryQuoteStatus = (typeof FACTORY_QUOTE_STATUSES)[number];

export function isFactoryQuoteStatus(value: unknown): value is FactoryQuoteStatus {
  return typeof value === "string" && (FACTORY_QUOTE_STATUSES as readonly string[]).includes(value);
}

/* What the team can do with a quote that is waiting. Approved, rejected and
   superseded quotes are final. ("superseded" is never chosen by a person: it is
   set automatically when a newer quote arrives.) */
export function teamDecisions(from: FactoryQuoteStatus): ("approved" | "rejected")[] {
  return from === "submitted" ? ["approved", "rejected"] : [];
}

export function canDecide(from: FactoryQuoteStatus, to: string): boolean {
  return (teamDecisions(from) as string[]).includes(to);
}

export function isFinal(status: FactoryQuoteStatus): boolean {
  return status !== "submitted";
}

/* A rejection must say why. Approving does not need a note. */
export function decisionNoteRequired(to: string): boolean {
  return to === "rejected";
}

/* The decision as the screen will send it, or the sentence to show instead. */
export function checkDecision(
  from: FactoryQuoteStatus,
  to: string,
  note: string | null | undefined
): { ok: true; status: "approved" | "rejected"; note: string | null } | { ok: false; message: string } {
  if (!canDecide(from, to)) {
    return { ok: false, message: isFinal(from) ? "This quote has already been decided or replaced, so it cannot be changed." : "That is not a valid decision." };
  }
  const text = (note || "").trim();
  if (decisionNoteRequired(to) && !text) return { ok: false, message: "Write a short reason when you do not accept a quote." };
  if (text.length > 2000) return { ok: false, message: "The note is too long (up to 2,000 characters)." };
  return { ok: true, status: to as "approved" | "rejected", note: text || null };
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/* The total the database works out: quantity x price per piece + tooling, to the
   cent. Shown to the factory before it sends, so it sees what the team will see. */
export function quoteTotal(quantity: number, pricePerPiece: number, toolingCost = 0): number | null {
  if (!Number.isInteger(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(pricePerPiece) || pricePerPiece < 0) return null;
  if (!Number.isFinite(toolingCost) || toolingCost < 0) return null;
  return round2(quantity * pricePerPiece + toolingCost);
}

export type QuoteAudience = "team" | "factory";

export function factoryQuoteStatusLabel(status: FactoryQuoteStatus, audience: QuoteAudience): string {
  if (audience === "factory") {
    switch (status) {
      case "submitted":
        return "Waiting for DYE CUT LAB";
      case "approved":
        return "Approved";
      case "rejected":
        return "Not accepted";
      case "superseded":
        return "Replaced by a newer quote";
    }
  }
  switch (status) {
    case "submitted":
      return "Needs your review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "superseded":
      return "Replaced by a newer quote";
  }
}

/* ---------------------------------------------------------------------------
   The factory's quote form: what a factory may type, and when it may send one.
   --------------------------------------------------------------------------- */

/* A factory may send a quote while the project is still being priced, and not
   after it has been approved and moved on. */
export const QUOTE_OPEN_STATUSES = ["development", "quote_ready", "factory_review"] as const;

export function canQuoteInStatus(status: string | null | undefined): boolean {
  return (QUOTE_OPEN_STATUSES as readonly string[]).includes((status || "").trim().toLowerCase());
}

export type FactoryQuoteInput = {
  quantity: number;
  price_per_piece: number;
  tooling_cost: number;
  lead_days: number | null;
  notes: string | null;
};

export type ParsedFactoryQuote = { ok: true; value: FactoryQuoteInput } | { ok: false; message: string };

const MAX_AMOUNT = 10_000_000;

/* "$1,234.50" and "1234.5" are fine; "abc", "-5" and "1e3" are not. */
function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/* Checks what the factory typed. `get` reads a value by field name (FormData.get
   works). The same checks run again on the server before anything is saved, and
   the database has its own as the last line of defence. */
export function parseFactoryQuote(get: (name: string) => string | null | undefined): ParsedFactoryQuote {
  const text = (name: string) => (get(name) ?? "").toString().trim();

  const quantityRaw = text("quantity");
  if (!quantityRaw) return { ok: false, message: "Fill in the quantity." };
  const quantity = parseAmount(quantityRaw);
  if (quantity === null || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_AMOUNT) {
    return { ok: false, message: "The quantity must be a whole number of at least 1." };
  }

  const priceRaw = text("price_per_piece");
  if (!priceRaw) return { ok: false, message: "Fill in the price per piece." };
  const price = parseAmount(priceRaw);
  if (price === null) return { ok: false, message: "The price per piece must be a number." };
  if (price <= 0) return { ok: false, message: "The price per piece must be above zero." };
  if (price > 1_000_000) return { ok: false, message: "The price per piece looks too large. Check it and try again." };

  const toolingRaw = text("tooling_cost");
  let tooling = 0;
  if (toolingRaw) {
    const parsed = parseAmount(toolingRaw);
    if (parsed === null || parsed > MAX_AMOUNT) {
      return { ok: false, message: "The tooling cost must be a number (or leave it empty if there is none)." };
    }
    tooling = parsed;
  }

  const leadRaw = text("lead_days");
  let lead: number | null = null;
  if (leadRaw) {
    const parsed = parseAmount(leadRaw);
    if (parsed === null || !Number.isInteger(parsed) || parsed > 1000) {
      return { ok: false, message: "The lead time must be a whole number of days." };
    }
    lead = parsed;
  }

  const notes = text("notes");
  if (notes.length > 2000) return { ok: false, message: "The notes are too long (up to 2,000 characters)." };

  return {
    ok: true,
    value: {
      quantity,
      price_per_piece: Math.round((price + Number.EPSILON) * 10000) / 10000,
      tooling_cost: Math.round((tooling + Number.EPSILON) * 100) / 100,
      lead_days: lead,
      notes: notes || null,
    },
  };
}

/* A database refusal turned into one plain sentence, never the database's own words. */
export function quoteDatabaseMessage(error: { code?: string } | null | undefined): string {
  switch (error?.code) {
    case "42501":
      return "You can only send a quote for a project assigned to your factory.";
    case "23514":
      return "The database refused one of those numbers. Check the values and try again.";
    default:
      return "That did not save. Please try again.";
  }
}
