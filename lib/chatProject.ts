/* =========================================================
   DYE CUT LAB — which project fields the chat and project APIs may expose
============================================================
   The project row also holds internal columns (the owner account, the assigned
   factory, the client record, team notes). The AI doesn't need them and the
   browser shouldn't get them from the chat routes, so everything that leaves
   the server goes through pickChatProject. Pure functions, no server imports,
   so tests/chatProject.test.ts can cover them. */

export const CHAT_PROJECT_FIELDS = [
  "id",
  "project_number",
  "title",
  "request",
  "product_type",
  "use_type",
  "quantity",
  "units",
  "flavor_count",
  "flavor_split",
  "status",
  "artwork_status",
  "size",
  "closure",
  "pouch_size",
  "box_dimensions",
  "material",
  "finish",
  "created_at",
  "updated_at",
] as const;

export type ChatProject = Partial<Record<(typeof CHAT_PROJECT_FIELDS)[number], unknown>>;

/* A copy of the row with only the allowed fields. */
export function pickChatProject(row: Record<string, unknown> | null | undefined): ChatProject {
  const out: ChatProject = {};
  if (!row) return out;
  for (const key of CHAT_PROJECT_FIELDS) {
    if (key in row) out[key] = row[key];
  }
  return out;
}

/* What the AI is shown: the allowed fields without internal ids or timestamps. */
export function projectForModel(row: Record<string, unknown> | null | undefined): ChatProject {
  const { id, created_at, updated_at, ...rest } = pickChatProject(row);
  void id;
  void created_at;
  void updated_at;
  return rest;
}

/* The one message a customer ever sees for an unexpected server problem. The
   real error goes to the server log only. */
export const GENERIC_CHAT_ERROR = "Something went wrong on our side. Please try again in a moment.";
