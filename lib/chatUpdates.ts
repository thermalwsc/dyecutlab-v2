/* =========================================================
   DYE CUT LAB — checking what the AI wants to change on a project
============================================================
   The project chat asks the AI which project fields to change and to what. The
   AI is not trusted: every value is checked here before it reaches the database.
   A value that fails is DROPPED (and reported), it never aborts the reply, so a
   customer asking something odd still gets a normal answer.
   Pure functions, no server imports, covered by tests/chatUpdates.test.ts. */

/* The only project fields the chat may change. */
export const CHAT_EDITABLE_FIELDS = [
  "units",
  "flavor_count",
  "pouch_size",
  "box_dimensions",
  "material",
  "finish",
  "closure",
  "artwork_status",
  "size",
] as const;

export type ChatEditableField = (typeof CHAT_EDITABLE_FIELDS)[number];

/* Sensible ceilings. 1 unit = 128 finished pieces, so 100,000 units is 12.8
   million pieces, far beyond a real order and well inside the database's range. */
export const MAX_UNITS = 100_000;
export const MAX_FLAVORS = 50;
export const MAX_TEXT_LENGTH = 120;

const WHOLE_NUMBER_FIELDS: Record<string, number> = {
  units: MAX_UNITS,
  flavor_count: MAX_FLAVORS,
};

const FIELD_LABELS: Record<string, string> = {
  units: "units",
  flavor_count: "number of flavors",
  pouch_size: "pouch size",
  box_dimensions: "box dimensions",
  material: "material",
  finish: "finish",
  closure: "closure",
  artwork_status: "artwork status",
  size: "size",
};

export function fieldLabel(field: string) {
  return FIELD_LABELS[field] ?? field;
}

export type CleanedUpdates = {
  /** Values that passed every check, ready to save. */
  updates: Record<string, unknown>;
  /** Fields whose value was unusable and was left out. */
  rejected: string[];
};

/* Keep only editable fields with a usable value:
   - units and flavor_count: a whole number from 1 up to the ceiling above
     (a numeric string such as "50" is accepted, "0", "2.5", "lots" are not)
   - text fields: a non-empty string, trimmed, at most MAX_TEXT_LENGTH characters */
export function cleanChatUpdates(
  changedFields: unknown,
  values: Record<string, unknown> | null | undefined
): CleanedUpdates {
  const updates: Record<string, unknown> = {};
  const rejected: string[] = [];
  if (!Array.isArray(changedFields) || !values || typeof values !== "object") {
    return { updates, rejected };
  }

  for (const field of changedFields) {
    if (typeof field !== "string") continue;
    if (!(CHAT_EDITABLE_FIELDS as readonly string[]).includes(field)) continue;
    if (field in updates) continue;

    const value = values[field];
    if (value === null || value === undefined) continue;

    const ceiling = WHOLE_NUMBER_FIELDS[field];
    if (ceiling !== undefined) {
      const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof number === "number" && Number.isInteger(number) && number >= 1 && number <= ceiling) {
        updates[field] = number;
      } else {
        rejected.push(field);
      }
      continue;
    }

    if (typeof value === "string") {
      const text = value.trim();
      if (text && text.length <= MAX_TEXT_LENGTH) updates[field] = text;
      else rejected.push(field);
    } else {
      rejected.push(field);
    }
  }

  return { updates, rejected };
}

/* One short sentence appended to the AI's reply when something was left out. */
export function rejectedNote(rejected: string[]) {
  if (rejected.length === 0) return "";
  const names = rejected.map(fieldLabel);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `\n\n(I couldn't use that value for the ${list}, so I left it as it was. Please send a normal number or a short description.)`;
}
