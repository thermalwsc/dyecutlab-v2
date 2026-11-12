"use server";

import { cookies } from "next/headers";
import { requireRole } from "../../lib/auth/guard";
import { PORTAL_LANG_COOKIE } from "../../lib/factoryI18n";

/* =========================================================
   The factory chooses its portal language
============================================================
   A plain cookie, one year, only "en" or "zh": it holds no personal data and decides nothing but
   wording. Setting it in a server action re-renders the page the factory is on. */

export async function setPortalLanguage(formData: FormData) {
  await requireRole(["factory"], { next: "/factory" });
  const value = formData.get("lang");
  if (value !== "en" && value !== "zh") return;

  const store = await cookies();
  store.set(PORTAL_LANG_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
}
