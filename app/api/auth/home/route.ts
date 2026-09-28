import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "../../../../lib/auth/viewer";
import { resolveLandingPath } from "../../../../lib/auth/roles";
import { getServerSupabase } from "../../../../lib/supabase/server";

/* GET /api/auth/home?next=/account
   "Where should this session land?" — answered on the server so the role, the
   account status and the allow-list live in one place. Used after password
   sign-in, after sign-up and after setting a password (all client-side calls
   that need a server decision before navigating).

   A client can't forge this: the answer is based on the session cookie, not on
   anything the caller sends. `next` is only honoured when it is inside the
   role's own area. */
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next");
  const supabase = await getServerSupabase();
  const viewer = await getViewer(supabase);

  if (!viewer.user) {
    return noStore({
      signedIn: false,
      path: viewer.banned ? "/signin?error=account_disabled" : "/signin",
    });
  }

  /* Disabled or banned: end the session and send them back with a reason. */
  if (!viewer.role) {
    await supabase.auth.signOut();
    return noStore({ signedIn: false, path: "/signin?error=account_disabled" });
  }

  return noStore({ signedIn: true, role: viewer.role, path: resolveLandingPath(viewer.role, next) });
}

function noStore(body: Record<string, unknown>) {
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
