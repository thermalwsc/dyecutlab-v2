/* =========================================================
   DYE CUT LAB — the contact details the start-your-project chat remembers
============================================================
   After someone gives a phone number once, the chat remembers it in their
   browser so they can skip that step next time. That memory used to belong to
   the browser, not the account. Signing in as someone else on the same browser
   (a customer after an admin, for instance) then reused the OTHER account's
   contact record and the database refused to save the project.

   Now the memory carries the id of the account that saved it, and is used only
   by that account. Anything older, or from another account, is ignored.
   Pure function, covered by tests/rememberedClient.test.ts. */

export type RememberedClient = {
  id: string;
  phone: string;
  email: string;
  marketingSms: boolean;
};

export function readRememberedClient(
  raw: string | null | undefined,
  currentUserId: string | null | undefined
): RememberedClient | null {
  if (!raw || !currentUserId) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const value = (parsed ?? {}) as Record<string, unknown>;
  if (value.userId !== currentUserId) return null;
  if (typeof value.id !== "string" || !value.id) return null;
  if (typeof value.phone !== "string" || !value.phone.trim()) return null;

  return {
    id: value.id,
    phone: value.phone,
    email: typeof value.email === "string" ? value.email : "",
    marketingSms: Boolean(value.marketingSms),
  };
}
