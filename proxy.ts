import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/* Next.js 16 Proxy (formerly Middleware).

   1. Keeps the Supabase sign-in session fresh: refreshed tokens are written
      back to the response cookies on every page request.
   2. Optimistic guard: signed-out visitors to the signed-in areas are sent to
      /signin. The pages themselves re-check the session AND the role with
      lib/auth/guard.ts — this is only a fast path, never the decision. */

/* Signed-in areas. /set-password is deliberately NOT here: an invite or reset
   link must be able to land on it without a session. */
/* /app and /project are the legacy DICI chat + project pages: their data is
   now account-scoped (20260929000000_lock_project_tables.sql), so they need a
   session too. */
const SIGNED_IN_ONLY = ["/account", "/admin", "/factory", "/app", "/project"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            response.headers.set(key, value)
          );
        },
      },
    }
  );

  /* Verifies the JWT and refreshes the session if needed. Must run before
     any redirect decision. */
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  if (!signedIn && SIGNED_IN_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  /* Pages only: skip API routes, Next internals and static files. */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
