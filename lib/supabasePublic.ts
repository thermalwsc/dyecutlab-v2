import { createClient } from "@supabase/supabase-js";

/* Server-side client for the public form routes. Uses the publishable
   (anon) key, so RLS limits it to INSERT on the lead tables. Returns null
   instead of throwing when env vars are missing, so a route can answer
   with a friendly 503 rather than crashing at import time. */
export function getPublicSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey);
}
