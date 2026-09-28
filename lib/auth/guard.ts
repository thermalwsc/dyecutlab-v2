import "server-only";

import { redirect } from "next/navigation";
import { getServerSupabase } from "../supabase/server";
import { resolveLandingPath, type AppRole } from "./roles";
import { getViewer, type ProfileRecord, type SessionUser, type Viewer } from "./viewer";

/* =========================================================
   DYE CUT LAB — server-side role gate
============================================================
   requireRole() is the only way a protected page, server action or route
   handler should ask "is this person allowed here". It fails closed:

     • no session            → /signin (remembering where they were headed)
     • account switched off  → signed out, then /signin?error=account_disabled
     • banned by Supabase    → same as switched off
     • wrong role            → their own area, never an error page

   Pages call it per role: /account → ["customer"], /factory → ["factory"],
   /admin → staff + admin, /admin/accounts → ["dcl_admin"]. proxy.ts does a
   cheap signed-in check first; the real decision is always here. */

export type AuthorizedViewer = {
  viewer: Viewer;
  user: SessionUser;
  profile: ProfileRecord | null;
  role: AppRole;
};

export async function requireRole(
  allowed: readonly AppRole[],
  options: { next?: string } = {}
): Promise<AuthorizedViewer> {
  const supabase = await getServerSupabase();
  const viewer = await getViewer(supabase);

  if (!viewer.user) {
    if (viewer.banned) redirect("/signin?error=account_disabled");

    const target = options.next ? `/signin?next=${encodeURIComponent(options.next)}` : "/signin";
    redirect(target);
  }

  /* role is null for a disabled account: "disabled counts as having no role". */
  if (!viewer.role) {
    await supabase.auth.signOut();
    redirect("/signin?error=account_disabled");
  }

  if (!allowed.includes(viewer.role)) {
    redirect(resolveLandingPath(viewer.role));
  }

  return { viewer, user: viewer.user, profile: viewer.profile, role: viewer.role };
}
