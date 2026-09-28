import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "../../../lib/auth/viewer";
import { resolveLandingPath } from "../../../lib/auth/roles";
import { getServerSupabase, safeNextPath } from "../../../lib/supabase/server";

/* GET /auth/callback — where Google and the email links land.
   Exchanges the one-time `code` for a session cookie, then sends the account to
   wherever its ROLE belongs: a customer to /account, the DYE CUT LAB team to
   /admin, a factory account to /factory (the `next` value only wins when it is
   inside that area). Must be listed under Supabase → Authentication → URL
   Configuration → Redirect URLs. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");

  /* The provider can send the user back with an error (e.g. they pressed Cancel
     on the Google screen). */
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");

  if (code && !providerError) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const viewer = await getViewer(supabase);

      /* Switched off in the meantime (or banned): no session for them. */
      if (!viewer.role) {
        await supabase.auth.signOut();
        return NextResponse.redirect(signInUrl(origin, "account_disabled", next));
      }

      return NextResponse.redirect(`${origin}${resolveLandingPath(viewer.role, next)}`);
    }

    console.error("AUTH CALLBACK ERROR:", error.message);
  } else if (providerError) {
    console.error("AUTH PROVIDER ERROR:", providerError);
  }

  return NextResponse.redirect(signInUrl(origin, providerError && !code ? "oauth_cancelled" : "signin_failed", next));
}

/* Back to the form with a reason the card turns into copy. */
function signInUrl(origin: string, error: string, next: string) {
  const url = new URL("/signin", origin);
  url.searchParams.set("error", error);
  if (next !== "/account") url.searchParams.set("next", next);
  return url;
}

