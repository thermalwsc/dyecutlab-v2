import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/* Server Supabase client bound to the signed-in user's cookies — for server
   components, route handlers and server actions. Create one per request;
   never share it. Server components cannot write cookies, so token
   refreshes there are ignored and handled by proxy.ts instead. */
export async function getServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            /* Called from a server component: proxy.ts refreshes instead. */
          }
        },
      },
    }
  );
}

/* Only allow redirects back to our own pages ("/account", "/start?x=1"),
   never to another site — the `next` value comes from the URL. */
export function safeNextPath(value: string | null | undefined, fallback = "/account") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
