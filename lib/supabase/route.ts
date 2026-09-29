import "server-only";

import { NextResponse } from "next/server";
import { getServerSupabase } from "./server";

/* For API route handlers that read or write project data.

   Returns the Supabase client bound to the caller's session cookie, so Row
   Level Security decides what they can touch (own projects, the DCL team sees
   everything, a factory sees its assigned projects). Replaces the old
   per-route clients that used the bare publishable key — with RLS on, those
   see nothing. getUser() asks the Auth server, so a forged cookie fails. */
export async function getRouteSupabase() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

export function unauthorized() {
  return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
}
