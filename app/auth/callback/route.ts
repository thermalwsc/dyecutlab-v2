import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase, safeNextPath } from "../../../lib/supabase/server";

/* GET /auth/callback — where Google, Apple and the email sign-in link land.
   Exchanges the one-time `code` for a session cookie, then sends the user
   on to `next` (our own pages only). Must be listed under Supabase →
   Authentication → URL Configuration → Redirect URLs. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");

  /* The provider can send the user back with an error (e.g. they pressed
     Cancel on the Google or Apple screen). */
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");

  if (code && !providerError) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("AUTH CALLBACK ERROR:", error.message);
  } else if (providerError) {
    console.error("AUTH PROVIDER ERROR:", providerError);
  }

  const back = new URL("/signin", origin);
  back.searchParams.set("error", "signin_failed");
  if (next !== "/account") back.searchParams.set("next", next);
  return NextResponse.redirect(back);
}
