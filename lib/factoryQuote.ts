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
