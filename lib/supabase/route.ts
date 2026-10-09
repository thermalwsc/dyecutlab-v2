import "server-only";

import { NextResponse } from "next/server";
import { normalizeRole, type AppRole } from "../auth/roles";
import { getServerSupabase } from "./server";

/* For API route handlers that read or write project data.

   Returns the Supabase client bound to the caller's session cookie, so Row
   Level Security decides what they can touch (own projects, the DCL team sees
   everything, a factory sees its assigned projects). getUser() asks the Auth
   server, so a forged cookie fails.

   Also returns the account's role, and treats a switched-off account as signed
   out (the pages do the same through requireRole). Factories use their own
   portal (/factory), so project chat, files and AI routes check `role` and
   answer 403 for them: a factory must never read customer conversations. */
export async function getRouteSupabase() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: AppRole | null = null;
  let activeUser = user;

  if (user) {
    const { data: row } = await supabase
      .from("profiles")
      .select("role, disabled_at")
      .eq("id", user.id)
      .maybeSingle();

    if (row?.disabled_at) activeUser = null;
    else role = normalizeRole(row?.role);
  }

  return { supabase, user: activeUser, role };
}

export function unauthorized() {
  return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json(
    { error: "This isn't available for your account. Factories use the factory portal." },
    { status: 403 }
  );
}
