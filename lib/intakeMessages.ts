/* =========================================================
   DYE CUT LAB — saving the "start your project" conversation
============================================================
   The intake chat creates the project after BABA's first reply. From then on each
   exchange (what the customer said, what BABA asked next) is stored in
   project_messages, so the team can read it and the project chat can pick the
   conversation up. Pure function, covered by tests/intakeMessages.test.ts. */

import { MAX_CHAT_CHARS } from "./uploadRules.ts";

export type IntakeRow = { role: "user" | "baba"; message: string; created_at: string };

function clean(text: string | null | undefined) {
  return (text ?? "").trim().slice(0, MAX_CHAT_CHARS);
}

/* The customer's line first, then BABA's reply one millisecond later so the two
   always sort in the order they were spoken. Empty lines are left out. */
export function intakeRows(customerText: string, babaText?: string | null, now: Date = new Date()): IntakeRow[] {
  const rows: IntakeRow[] = [];

  const customer = clean(customerText);
  if (customer) rows.push({ role: "user", message: customer, created_at: now.toISOString() });

  const baba = clean(babaText);
  if (baba) rows.push({ role: "baba", message: baba, created_at: new Date(now.getTime() + 1).toISOString() });

  return rows;
}
