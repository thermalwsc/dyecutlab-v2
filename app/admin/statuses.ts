/* Lifecycle of a /start quote request, as the team works it.
   Matches the CHECK constraint on public.quote_requests.status. */
export const QUOTE_STATUSES = ["new", "contacted", "quoted", "won", "lost"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

/* Project stages from the DICI blueprint (Lead → … → Delivered). projects.status
   is free text in the database, so legacy values (e.g. "development") still
   display; the team picks from this list when editing. */
export const PROJECT_STATUSES = [
  "lead",
  "development",
  "quote_ready",
  "factory_review",
  "approved",
  "payment",
  "proof",
  "production",
  "qc",
  "shipping",
  "delivered",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  lead: "Lead",
  development: "Development",
  quote_ready: "Quote ready",
  factory_review: "Factory review",
  approved: "Approved",
  payment: "Payment",
  proof: "Proof",
  production: "Production",
  qc: "QC",
  shipping: "Shipping",
  delivered: "Delivered",
};

export function projectStatusLabel(value: string) {
  return (PROJECT_STATUS_LABELS as Record<string, string>)[value] ?? value.replace(/_/g, " ");
}
