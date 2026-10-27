/* =========================================================
   DYE CUT LAB — the pricing screen (/admin/pricing): fields, checks, wording
============================================================
   One description of each pricing table (supabase/migrations/20261026000000_
   pricing_tables.sql) drives the form, the list, and the check of what the team
   types. Pure functions, no server-only imports, covered by
   tests/pricingAdmin.test.ts.

   The browser never names a table or a column: it sends a key such as
   "finishes", and only the keys listed here are accepted. Every value is
   checked again here before it reaches the database, and the database has its
   own checks as the last line of defence. */

export type FieldKind = "text" | "int" | "money" | "percent" | "select" | "bool" | "product";

export type PricingField = {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /* text: longest allowed; int: smallest allowed (defaults to 0); money: decimals kept */
  max?: number;
  min?: number;
  scale?: number;
  options?: { value: string; label: string }[];
  help?: string;
  defaultTrue?: boolean;
  wide?: boolean;
};

export type PricingTableDef = {
  key: string;
  table: string;
  label: string;
  intro: string;
  fields: PricingField[];
  order: string[];
  title: (row: Record<string, unknown>, products: Record<string, string>) => string;
  detail: (row: Record<string, unknown>) => string;
};

const MAX_NUMBER = 10_000_000;

const NOTES: PricingField = { name: "notes", label: "Notes", kind: "text", max: 1000, wide: true };
const IN_USE: PricingField = {
  name: "active",
  label: "In use",
  kind: "bool",
  defaultTrue: true,
  help: "Switch off to keep the row but stop using it in estimates.",
};

const METHODS = [
  { value: "sea", label: "Sea" },
  { value: "air", label: "Air" },
  { value: "express", label: "Express" },
];

const CHARGED_BY = [
  { value: "kilogram", label: "Per kilogram" },
  { value: "cubic_metre", label: "Per cubic metre" },
  { value: "pallet", label: "Per pallet" },
  { value: "order", label: "Flat, once per order" },
];

const CHARGE_TYPES = [
  { value: "per_piece", label: "Per piece" },
  { value: "per_order", label: "Once per order" },
];

export function usd(value: unknown): string {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);
}

/* 0.35 -> "35%", 0.125 -> "12.5%" */
export function percentText(fraction: unknown): string {
  const n = typeof fraction === "string" ? Number(fraction) : (fraction as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return `${Math.round(n * 10000) / 100}%`;
}

function pieces(value: unknown): string {
  return typeof value === "number" || (typeof value === "string" && value !== "") ? `${Number(value).toLocaleString("en-US")} pcs` : "";
}

function join(parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(" · ");
}

function dayText(label: string, value: unknown) {
  return typeof value === "number" ? `${label} ${value} d` : "";
}

export const PRICING_TABLES: PricingTableDef[] = [
  {
    key: "products",
    table: "pricing_products",
    label: "Products",
    intro: "One row per product and style. Add its price levels next, under Price levels.",
    order: ["product", "style"],
    fields: [
      { name: "product", label: "Product", kind: "text", required: true, max: 120, help: "For example Box, Pouch, Jar." },
      { name: "style", label: "Style or variant", kind: "text", max: 120 },
      { name: "min_size_mm", label: "Smallest size (mm, L x W x H)", kind: "text", max: 60 },
      { name: "max_size_mm", label: "Largest size (mm, L x W x H)", kind: "text", max: 60 },
      { name: "material", label: "Material", kind: "text", max: 120 },
      { name: "min_order", label: "Smallest order (pieces)", kind: "int", min: 1 },
      NOTES,
      IN_USE,
    ],
    title: (row) => join([String(row.product ?? ""), row.style ? String(row.style) : ""]),
    detail: (row) => join([row.material ? String(row.material) : "", row.min_order ? `from ${pieces(row.min_order)}` : "", row.active === false ? "Switched off" : ""]),
  },
  {
    key: "tiers",
    table: "pricing_product_tiers",
    label: "Price levels",
    intro: "The price per piece from a given quantity upward. 200 pieces at $1.80 and 500 at $1.20 means 700 pieces pays $1.20.",
    order: ["product_id", "min_quantity"],
    fields: [
      { name: "product_id", label: "Product", kind: "product", required: true },
      { name: "min_quantity", label: "From this quantity (pieces)", kind: "int", required: true, min: 1 },
      { name: "price_per_piece", label: "Price per piece (USD)", kind: "money", required: true, scale: 4 },
    ],
    title: (row, products) => `${products[String(row.product_id)] ?? "Unknown product"}: from ${pieces(row.min_quantity)}`,
    detail: (row) => `${usd(row.price_per_piece)} per piece`,
  },
  {
    key: "finishes",
    table: "pricing_finishes",
    label: "Finishes",
    intro: "Extra charges for finishes and special features.",
    order: ["name"],
    fields: [
      { name: "name", label: "Finish or feature", kind: "text", required: true, max: 120, help: "For example Matte lamination, Foil, Window." },
      { name: "applies_to", label: "Applies to (product)", kind: "text", max: 120 },
      { name: "charge_type", label: "Charged", kind: "select", required: true, options: CHARGE_TYPES },
      { name: "amount", label: "Amount (USD)", kind: "money", required: true, scale: 4 },
      { name: "min_order", label: "Smallest order for this feature (pieces)", kind: "int", min: 1 },
      NOTES,
      IN_USE,
    ],
    title: (row) => join([String(row.name ?? ""), row.applies_to ? String(row.applies_to) : ""]),
    detail: (row) => join([`${usd(row.amount)} ${row.charge_type === "per_order" ? "once per order" : "per piece"}`, row.min_order ? `from ${pieces(row.min_order)}` : "", row.active === false ? "Switched off" : ""]),
  },
  {
    key: "tooling",
    table: "pricing_tooling",
    label: "Tooling",
    intro: "One-time costs such as dies and plates.",
    order: ["name"],
    fields: [
      { name: "name", label: "Product or tooling type", kind: "text", required: true, max: 160 },
      { name: "cost", label: "One-time cost (USD)", kind: "money", required: true, scale: 2 },
      { name: "reusable", label: "Reusable for reorders", kind: "bool", defaultTrue: true },
      { name: "production_days", label: "Typical production time (days)", kind: "int" },
      NOTES,
      IN_USE,
    ],
    title: (row) => String(row.name ?? ""),
    detail: (row) => join([usd(row.cost), row.reusable === false ? "not reusable" : "reusable", dayText("make", row.production_days), row.active === false ? "Switched off" : ""]),
  },
  {
    key: "freight",
    table: "pricing_freight",
    label: "Freight",
    intro: "Shipping cost by method and destination.",
    order: ["destination", "method"],
    fields: [
      { name: "method", label: "Method", kind: "select", required: true, options: METHODS },
      { name: "origin", label: "From", kind: "text", max: 120, help: "For example Shenzhen, CN." },
      { name: "destination", label: "Destination region", kind: "text", required: true, max: 120, help: "For example US West Coast." },
      { name: "charged_by", label: "Charged by", kind: "select", required: true, options: CHARGED_BY },
      { name: "rate", label: "Rate (USD per unit)", kind: "money", required: true, scale: 4 },
      { name: "min_charge", label: "Minimum charge (USD)", kind: "money", scale: 2 },
      { name: "transit_days", label: "Transit time (days)", kind: "int" },
      NOTES,
      IN_USE,
    ],
    title: (row) => `${String(row.method ?? "").replace(/^./, (c) => c.toUpperCase())} to ${String(row.destination ?? "")}`,
    detail: (row) =>
      join([
        `${usd(row.rate)} ${CHARGED_BY.find((o) => o.value === row.charged_by)?.label.toLowerCase() ?? ""}`.trim(),
        row.min_charge !== null && row.min_charge !== undefined ? `min ${usd(row.min_charge)}` : "",
        dayText("transit", row.transit_days),
        row.active === false ? "Switched off" : "",
      ]),
  },
  {
    key: "margins",
    table: "pricing_margins",
    label: "Margins",
    intro: "DYE CUT LAB margin as a share of the selling price. 35 means a cost of 1.00 sells for 1.54.",
    order: ["name"],
    fields: [
      { name: "name", label: "Rule", kind: "text", required: true, max: 120, help: "For example Default margin." },
      { name: "applies_to", label: "Applies to", kind: "text", max: 120, help: "A product name, or leave empty for all products." },
      { name: "margin", label: "Margin (%)", kind: "percent", required: true, help: "Between 0 and 94.99." },
      { name: "min_quantity", label: "Order size from (pieces)", kind: "int", min: 1 },
      { name: "max_quantity", label: "Order size up to (pieces)", kind: "int", min: 1 },
      NOTES,
      IN_USE,
    ],
    title: (row) => join([String(row.name ?? ""), row.applies_to ? String(row.applies_to) : "all products"]),
    detail: (row) =>
      join([
        percentText(row.margin),
        row.min_quantity || row.max_quantity ? `${row.min_quantity ? pieces(row.min_quantity) : "any"} to ${row.max_quantity ? pieces(row.max_quantity) : "any"}` : "",
        row.active === false ? "Switched off" : "",
      ]),
  },
  {
    key: "lead-times",
    table: "pricing_lead_times",
    label: "Lead times",
    intro: "Working days, so an estimate can include timing.",
    order: ["product"],
    fields: [
      { name: "product", label: "Product or style", kind: "text", required: true, max: 160 },
      { name: "proof_days", label: "Proof or sample (days)", kind: "int" },
      { name: "production_days", label: "Production (days)", kind: "int" },
      { name: "finish_days", label: "Extra days for finishes", kind: "int" },
      NOTES,
      IN_USE,
    ],
    title: (row) => String(row.product ?? ""),
    detail: (row) => join([dayText("proof", row.proof_days), dayText("production", row.production_days), dayText("finishes", row.finish_days), row.active === false ? "Switched off" : ""]),
  },
];

export function findPricingTable(key: unknown): PricingTableDef | null {
  return PRICING_TABLES.find((def) => def.key === key) ?? null;
}

export type ParsedRow = Record<string, string | number | boolean | null>;
export type ParseResult = { ok: true; row: ParsedRow } | { ok: false; message: string };

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/%$/, "");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/* Checks what the team typed, against one table's fields. `get` reads a value
   by field name (FormData.get works). Percent fields are typed as 35 and stored
   as 0.35. Money is rounded to the table's decimals. */
export function parsePricingRow(
  def: PricingTableDef,
  get: (name: string) => string | null | undefined,
  productIds: readonly string[] = []
): ParseResult {
  const row: ParsedRow = {};

  for (const field of def.fields) {
    const raw = (get(field.name) ?? "").toString().trim();

    if (field.kind === "bool") {
      row[field.name] = ["on", "1", "true", "yes"].includes(raw.toLowerCase());
      continue;
    }

    if (!raw) {
      if (field.required) return { ok: false, message: `Fill in "${field.label}".` };
      row[field.name] = null;
      continue;
    }

    if (field.kind === "text") {
      const max = field.max ?? 200;
      if (raw.length > max) return { ok: false, message: `"${field.label}" is too long (up to ${max} characters).` };
      row[field.name] = raw;
      continue;
    }

    if (field.kind === "select") {
      if (!field.options?.some((option) => option.value === raw)) {
        return { ok: false, message: `Pick one of the choices for "${field.label}".` };
      }
      row[field.name] = raw;
      continue;
    }

    if (field.kind === "product") {
      if (!productIds.includes(raw)) return { ok: false, message: `Pick a product for "${field.label}".` };
      row[field.name] = raw;
      continue;
    }

    const n = parseNumber(raw);
    if (n === null) return { ok: false, message: `"${field.label}" must be a number.` };

    if (field.kind === "int") {
      const min = field.min ?? 0;
      if (!Number.isInteger(n) || n < min || n > MAX_NUMBER) {
        return { ok: false, message: `"${field.label}" must be a whole number${min > 0 ? ` of at least ${min}` : ""}.` };
      }
      row[field.name] = n;
      continue;
    }

    if (field.kind === "money") {
      if (n > MAX_NUMBER) return { ok: false, message: `"${field.label}" is too large.` };
      const scale = field.scale ?? 2;
      const factor = 10 ** scale;
      row[field.name] = Math.round((n + Number.EPSILON) * factor) / factor;
      continue;
    }

    /* percent */
    if (n < 0 || n >= 95) return { ok: false, message: `"${field.label}" must be between 0 and 94.99.` };
    row[field.name] = Math.round((n / 100 + Number.EPSILON) * 10000) / 10000;
  }

  const min = row.min_quantity;
  const max = row.max_quantity;
  if (def.key === "margins" && typeof min === "number" && typeof max === "number" && max < min) {
    return { ok: false, message: `"Order size up to" must be at least "Order size from".` };
  }

  return { ok: true, row };
}

/* What goes back into a form field when a row is edited. */
export function fieldValue(field: PricingField, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (field.kind === "percent") return String(Math.round(Number(value) * 10000) / 100);
  return String(value);
}

/* Database error codes turned into one plain sentence. */
export function databaseErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  switch (error?.code) {
    case "23505":
      return "That row already exists (same product and style, or the same quantity level for this product).";
    case "23514":
      return "The database refused one of those numbers. Check the values and try again.";
    case "23503":
      return "That product no longer exists. Reload the page and try again.";
    case "42501":
      return "You don't have access to change pricing.";
    default:
      return "That didn't save. Please try again.";
  }
}
