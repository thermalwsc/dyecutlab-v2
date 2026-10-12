/* =========================================================
   DYE CUT LAB — the recent conversation shown to the project chat AI
============================================================
   The AI is stateless: it only knows what we send with each request. Sending
   the last few messages lets it follow up ("make it 100 instead") and stop
   greeting the customer every time. Cost is bounded three ways: a count, a
   per-message length and a total length, because every character is billed as
   input on every future message. Pure functions, covered by tests/chatHistory.test.ts. */

export const HISTORY_MAX_MESSAGES = 10;
export const HISTORY_MAX_CHARS_EACH = 500;
export const HISTORY_MAX_CHARS_TOTAL = 3000;

export type StoredMessage = { role?: unknown; message?: unknown };
export type HistoryTurn = { speaker: "customer" | "baba"; text: string };

type Limits = { maxMessages?: number; maxCharsEach?: number; maxCharsTotal?: number };

function shorten(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/* rows: saved messages, OLDEST FIRST, as stored (role "user" or "baba").
   Returns the newest ones that fit the limits, still oldest first, so the AI
   reads them in order. Rows that are empty or have an unknown role are skipped. */
export function buildHistory(rows: StoredMessage[] | null | undefined, limits: Limits = {}): HistoryTurn[] {
  const maxMessages = limits.maxMessages ?? HISTORY_MAX_MESSAGES;
  const maxEach = limits.maxCharsEach ?? HISTORY_MAX_CHARS_EACH;
  const maxTotal = limits.maxCharsTotal ?? HISTORY_MAX_CHARS_TOTAL;
  if (!Array.isArray(rows)) return [];

  const picked: HistoryTurn[] = [];
  let total = 0;

  for (let i = rows.length - 1; i >= 0 && picked.length < maxMessages; i--) {
    const row = rows[i];
    if (!row || typeof row.message !== "string") continue;
    const speaker = row.role === "user" ? "customer" : row.role === "baba" ? "baba" : null;
    if (!speaker) continue;

    const text = shorten(row.message, maxEach);
    if (!text) continue;
    if (total + text.length > maxTotal) break;

    picked.push({ speaker, text });
    total += text.length;
  }

  return picked.reverse();
}
