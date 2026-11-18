import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { nextPayment, toCents, type NextPayment } from "./payments";

/* =========================================================
   What a customer sees about paying for one project
============================================================
   Loaded with the CALLER'S OWN session, so Row Level Security decides what they can read: their own
   project, the quote versions the team has shown them, and their own payments. */

export type PaymentRowView = {
  id: string;
  kind: string;
  status: string;
  amount_cents: number;
  receipt_url: string | null;
  checkout_url: string | null;
  paid_at: string | null;
  created_at: string;
};

export type PaymentContext = {
  project: { id: string; project_number: string; status: string | null; owner_id: string | null };
  quote: { id: string; version: number; sell_total: number } | null;
  totalCents: number | null;
  payments: PaymentRowView[];
  next: NextPayment;
};

export async function loadPaymentContext(supabase: SupabaseClient, projectNumber: string): Promise<PaymentContext | null> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, project_number, status, owner_id")
    .eq("project_number", projectNumber)
    .maybeSingle();
  if (!project) return null;

  /* the newest verified quote the customer has been shown: the one that is paid */
  const { data: quote } = await supabase
    .from("quote_versions")
    .select("id, version, sell_total")
    .eq("project_id", project.id)
    .eq("kind", "verified")
    .eq("shown_to_customer", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: rows, error } = await supabase
    .from("payments")
    .select("id, kind, status, amount_cents, receipt_url, checkout_url, paid_at, created_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) console.error("PAYMENTS LOAD ERROR:", error.code, error.message);
  const payments = (rows ?? []) as PaymentRowView[];

  const totalCents = quote ? toCents(quote.sell_total) : null;
  return {
    project,
    quote: quote ? { id: quote.id, version: quote.version, sell_total: Number(quote.sell_total) } : null,
    totalCents,
    payments,
    next: nextPayment(project.status, totalCents, payments),
  };
}
