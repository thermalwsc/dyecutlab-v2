/* =========================================================
   DYE CUT LAB — saving the "start your project" conversation
============================================================
   The intake chat creates the project after DICI's first reply. From then on each
   exchange (what the customer said, what DICI asked next) is stored in
   project_messages, so the team can read it and the project chat can pick the
   conversation up. Pure function, covered by tests/intakeMessages.test.ts. */

import { MAX_CHAT_CHARS } from "./uploadRules.ts";

export type IntakeRow = { role: "user" | "baba"; message: string; created_at: string };

function clean(text: string | null | undefined) {
  return (text ?? "").trim().slice(0, MAX_CHAT_CHARS);
}

export type ShownMessage = { id: string; role: "customer" | "baba"; text: string };

/* Saved rows (oldest first) back into what the chat screen shows, for when the
   customer comes back to a project that already exists. Rows with an unknown
   role or no text are skipped. */
export function savedToShown(rows: Array<{ id?: unknown; role?: unknown; message?: unknown }> | null | undefined): ShownMessage[] {
  if (!Array.isArray(rows)) return [];

  const shown: ShownMessage[] = [];
  rows.forEach((row, index) => {
    if (!row || typeof row.message !== "string" || !row.message.trim()) return;
    const role = row.role === "user" ? "customer" : row.role === "baba" ? "baba" : null;
    if (!role) return;
    shown.push({ id: typeof row.id === "string" ? row.id : `saved-${index}`, role, text: row.message });
  });
  return shown;
}

/* The customer's line first, then DICI's reply one millisecond later so the two
   always sort in the order they were spoken. Empty lines are left out. */
export function intakeRows(customerText: string, babaText?: string | null, now: Date = new Date()): IntakeRow[] {
  const rows: IntakeRow[] = [];

  const customer = clean(customerText);
  if (customer) rows.push({ role: "user", message: customer, created_at: now.toISOString() });

  const baba = clean(babaText);
  if (baba) rows.push({ role: "baba", message: baba, created_at: new Date(now.getTime() + 1).toISOString() });

  return rows;
}
