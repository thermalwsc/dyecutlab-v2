/* =========================================================
   DYE CUT LAB — the factory's change notes: what may be typed, and the wording
============================================================
   A factory records each change it makes (artwork, price, material, finish,
   timing, other) with what changed and why. The blueprint calls this the knowledge
   base for future automation. The table is
   supabase/migrations/20261105000000_factory_change_notes.sql, and the database
   checks the same things again. Pure functions, no server-only imports, covered by
   tests/factoryChange.test.ts. */

export const CHANGE_KINDS = ["artwork", "price", "material", "finish", "timing", "other"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = {
  artwork: "Artwork",
  price: "Price",
  material: "Material",
  finish: "Finish",
  timing: "Timing",
  other: "Something else",
};

export function isChangeKind(value: unknown): value is ChangeKind {
  return typeof value === "string" && (CHANGE_KINDS as readonly string[]).includes(value);
}

/* What the reader sees: "Material", never a code. An unknown value shows as it is. */
export function changeKindLabel(kind: string | null | undefined): string {
  return isChangeKind(kind) ? CHANGE_KIND_LABELS[kind] : String(kind ?? "");
}

export const CHANGE_TEXT_MAX = 1000;

export type FactoryChangeInput = { kind: ChangeKind; what_changed: string; reason: string };
export type ParsedFactoryChange = { ok: true; value: FactoryChangeInput } | { ok: false; message: string };

/* Checks what the factory typed. `get` reads a value by field name (FormData.get works). */
export function parseFactoryChange(get: (name: string) => string | null | undefined): ParsedFactoryChange {
  const text = (name: string) => (get(name) ?? "").toString().replace(/\s+/g, " ").trim();

  const kind = (get("kind") ?? "").toString().trim();
  if (!isChangeKind(kind)) return { ok: false, message: "Choose what kind of change it was." };

  const what = text("what_changed");
  if (!what) return { ok: false, message: "Say what changed." };
  if (what.length > CHANGE_TEXT_MAX) return { ok: false, message: `"What changed" is too long (up to ${CHANGE_TEXT_MAX} characters).` };

  const reason = text("reason");
  if (!reason) return { ok: false, message: "Say why it changed. DYE CUT LAB keeps this to learn from." };
  if (reason.length > CHANGE_TEXT_MAX) return { ok: false, message: `"Why" is too long (up to ${CHANGE_TEXT_MAX} characters).` };

  return { ok: true, value: { kind, what_changed: what, reason } };
}

/* A database refusal turned into one plain sentence, never the database's own words. */
export function changeDatabaseMessage(error: { code?: string } | null | undefined): string {
  switch (error?.code) {
    case "42501":
      return "You can only record a change on a project assigned to your factory.";
    case "23514":
      return "The database refused that note. Check what you typed and try again.";
    default:
      return "That did not save. Please try again.";
  }
}
