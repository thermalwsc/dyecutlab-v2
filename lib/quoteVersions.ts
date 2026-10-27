/* =========================================================
   DYE CUT LAB — quote versions: what is saved, and what a customer reads back
============================================================
   Every estimate is saved as a numbered version of its project (see
   supabase/migrations/20261028000000_quote_versions.sql). Pure functions, no
   server-only imports, covered by tests/quoteVersions.test.ts.

   Two halves, because they have different readers:
   - the CUSTOMER-SAFE half: quantity, total, price per piece, lead time, what is
     included, and the estimate notice. A customer reads it only after the team
     shows that version to them.
   - the PRIVATE half, team only: the full inputs (with the price rows that were
     used, so a later price change never alters an old quote), the cost lines,
     the cost, the margin and the margin rule. */

import { ESTIMATE_NOTICE, type Estimate, type EstimateInput } from "./estimate.ts";

/* The arguments of the database function save_quote_version(). */
export type SaveQuoteVersionArgs = {
  p_project: string;
  p_quantity: number;
  p_sell_total: number;
  p_sell_per_piece: number;
  p_lead_days: number;
  p_includes: string[];
  p_excludes: string[];
  p_notice: string;
  p_inputs: unknown;
  p_lines: unknown;
  p_cost: number;
  p_margin: number;
  p_margin_rule: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProjectId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/* Turns a finished estimate and the inputs it was worked out from into the
   arguments of save_quote_version(). The inputs are copied as plain data so the
   saved version can never change if the objects are reused afterwards. */
export function buildQuoteVersionArgs(projectId: string, input: EstimateInput, estimate: Estimate): SaveQuoteVersionArgs {
  if (!isProjectId(projectId)) throw new Error("A quote version needs a valid project id.");

  return {
    p_project: projectId,
    p_quantity: estimate.quantity,
    p_sell_total: estimate.sellTotal,
    p_sell_per_piece: estimate.sellPerPiece,
    p_lead_days: estimate.leadDays.total,
    p_includes: [...estimate.includes],
    p_excludes: [...estimate.excludes],
    p_notice: estimate.notice || ESTIMATE_NOTICE,
    p_inputs: JSON.parse(JSON.stringify(input)),
    p_lines: JSON.parse(JSON.stringify(estimate.lines)),
    p_cost: estimate.cost,
    p_margin: estimate.margin,
    p_margin_rule: estimate.marginRule,
  };
}

/* One row of the customer-safe table, as the database returns it. */
export type QuoteVersionRow = {
  version: number;
  created_at: string;
  quantity: number;
  sell_total: number | string;
  sell_per_piece: number | string;
  lead_days: number | null;
  includes: string[] | null;
  excludes: string[] | null;
  notice: string | null;
};

export type CustomerQuoteVersion = {
  label: "Estimate";
  version: number;
  createdAt: string;
  notice: string;
  quantity: number;
  total: number;
  perPiece: number;
  currency: "USD";
  leadDays: number | null;
  includes: string[];
  excludes: string[];
};

/* The database returns numeric columns as text; this reads them back as numbers
   and always carries the estimate notice, even if an old row lacks one. A row
   that cannot be read gives null rather than a wrong price. */
export function toCustomerVersion(row: QuoteVersionRow | null | undefined): CustomerQuoteVersion | null {
  if (!row) return null;

  const total = Number(row.sell_total);
  const perPiece = Number(row.sell_per_piece);
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(perPiece) || perPiece < 0) return null;
  if (!Number.isInteger(row.quantity) || row.quantity <= 0) return null;
  if (!Number.isInteger(row.version) || row.version <= 0) return null;

  return {
    label: "Estimate",
    version: row.version,
    createdAt: row.created_at,
    notice: row.notice && row.notice.trim() ? row.notice : ESTIMATE_NOTICE,
    quantity: row.quantity,
    total,
    perPiece,
    currency: "USD",
    leadDays: typeof row.lead_days === "number" ? row.lead_days : null,
    includes: Array.isArray(row.includes) ? [...row.includes] : [],
    excludes: Array.isArray(row.excludes) ? [...row.excludes] : [],
  };
}

/* The newest version a customer may see, from the rows the database let them
   read (it already hides versions the team has not shown). */
export function latestCustomerVersion(rows: QuoteVersionRow[] | null | undefined): CustomerQuoteVersion | null {
  const readable = (Array.isArray(rows) ? rows : [])
    .map(toCustomerVersion)
    .filter((version): version is CustomerQuoteVersion => version !== null);
  if (readable.length === 0) return null;
  return readable.reduce((best, version) => (version.version > best.version ? version : best));
}
