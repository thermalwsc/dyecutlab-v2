/* =========================================================
   DYE CUT LAB — the latest chat message, as a short preview
============================================================
   The project page and the dashboard cards show the newest message of a
   project's chat in one line, with a link into the chat. Pure functions, no
   server-only imports, covered by tests/messagePreview.test.ts. */

export type PreviewMessage = {
  role: string;
  message: string;
  created_at: string;
};

export type MessagePreview = {
  from: string;
  text: string;
  createdAt: string;
};

/* Who said it, in the words the chat uses: the assistant is DICI. */
export function previewSender(role: string | null | undefined): string {
  return role === "user" ? "You" : "DICI";
}

/* One tidy line: markdown marks and line breaks removed, runs of spaces
   collapsed, cut at a word boundary with an ellipsis when too long. */
export function previewText(text: string | null | undefined, max = 90): string {
  const plain = (text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>]+/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= max) return plain;

  const cut = plain.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s.,;:!?-]+$/, "")}…`;
}

/* The newest message of a list in any order, or null when there is none or no
   message has a readable date. */
export function latestMessage<T extends { created_at: string }>(rows: T[] | null | undefined): T | null {
  if (!Array.isArray(rows)) return null;

  let best: T | null = null;
  let bestTime = -Infinity;
  for (const row of rows) {
    const time = Date.parse(row?.created_at);
    if (Number.isNaN(time)) continue;
    if (time > bestTime) {
      best = row;
      bestTime = time;
    }
  }
  return best;
}

export function toPreview(row: PreviewMessage | null): MessagePreview | null {
  if (!row) return null;
  const text = previewText(row.message);
  if (!text) return null;
  return { from: previewSender(row.role), text, createdAt: row.created_at };
}

/* The newest message of every project, from one list of messages that carry a
   project_id. */
export function latestByProject(
  rows: (PreviewMessage & { project_id: string })[] | null | undefined
): Record<string, MessagePreview> {
  const grouped: Record<string, (PreviewMessage & { project_id: string })[]> = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.project_id !== "string") continue;
    (grouped[row.project_id] ||= []).push(row);
  }

  const result: Record<string, MessagePreview> = {};
  for (const [projectId, list] of Object.entries(grouped)) {
    const preview = toPreview(latestMessage(list));
    if (preview) result[projectId] = preview;
  }
  return result;
}
