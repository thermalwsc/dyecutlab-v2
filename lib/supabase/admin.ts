import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* =========================================================
   DYE CUT LAB — service-role Supabase client
============================================================
   Bypasses RLS, so it is used ONLY by the admin account module
   (app/admin/accounts) for the things the public API deliberately cannot do:

     • auth.admin.inviteUserByEmail / listUsers / updateUserById (ban)
     • writing public.profiles.role, factory_id, disabled_at, invited_by
     • creating rows in public.factories

   Safety rails:
     • `server-only` makes importing this from a client component a build error.
     • The variable has no NEXT_PUBLIC_ prefix, so it is never inlined into the
       browser bundle.
     • Callers run their own requireRole(["dcl_admin"]) first and take the
       acting user id from the session, never from form input. */

export function isServiceRoleConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);
}

export function getServiceRoleSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  /* SUPABASE_SECRET_KEY is the newer name for the same key (sb_secret_…).
     Either works; the docs in AUTH_SETUP.md use SERVICE_ROLE_KEY. */
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "Account management needs SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL. See AUTH_SETUP.md → Environment variables."
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
