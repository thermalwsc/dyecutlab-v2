import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "../../../lib/supabase/server";

/* POST /auth/signout — clears the session cookie and returns home.
   POST only, so a link or prefetch can never sign someone out. */
export async function POST(request: NextRequest) {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303 });
}
