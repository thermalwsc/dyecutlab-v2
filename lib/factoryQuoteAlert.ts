/* =========================================================
   DYE CUT LAB — the team's email when a factory sends a quote
============================================================
   The words of the alert, kept apart from the sending (lib/brevo.ts) so they can be
   tested. It names the factory, the project and the amounts, and links to the
   project, where the team reviews and approves it. It carries only what the team
   already sees on that page. Pure functions, no server-only imports, covered by
   tests/factoryQuoteAlert.test.ts. */

export type FactoryQuoteAlertInput = {
  projectNumber: string;
  projectTitle: string;
  factoryName: string;
  version: number;
  quantity: number;
  pricePerPiece: number;
  total: number;
  leadDays: number | null;
};

export type FactoryQuoteAlert = {
  headline: string;
  rows: { label: string; value: string }[];
  footer: string;
};

const usd = (value: number, digits: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: 4 }).format(value);

export function buildFactoryQuoteAlert(input: FactoryQuoteAlertInput): FactoryQuoteAlert {
  const factory = input.factoryName.trim() || "A factory";
  const rows = [
    { label: "Project", value: `${input.projectNumber} · ${input.projectTitle.trim() || "Untitled project"}` },
    { label: "Quote", value: `Version ${input.version} · ${usd(input.total, 2)}` },
    { label: "Price", value: `${input.quantity.toLocaleString("en-US")} pcs × ${usd(input.pricePerPiece, 2)} per piece` },
  ];
  if (typeof input.leadDays === "number") rows.push({ label: "Lead time", value: `${input.leadDays} days` });

  return {
    headline: `${factory} sent a quote for ${input.projectNumber}`,
    rows,
    footer: "Nothing goes to the customer until you review it. Approving it works out the customer's price and saves a verified quote.",
  };
}
