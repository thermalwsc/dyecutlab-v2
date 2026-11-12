import "server-only";

import { cookies } from "next/headers";
import { PORTAL_LANG_COOKIE, parsePortalLang } from "./factoryI18n";
import type { Lang } from "./translationGuard";

/* The language the signed-in factory chose for its portal. Chinese until it picks English. */
export async function getPortalLang(): Promise<Lang> {
  const store = await cookies();
  return parsePortalLang(store.get(PORTAL_LANG_COOKIE)?.value);
}
