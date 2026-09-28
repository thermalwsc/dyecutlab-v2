import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "../supabase/server";
import { normalizeRole, type AppRole } from "./roles";

/* =========================================================
   DYE CUT LAB — who is making this request, on the server
============================================================
   One place that answers: is there a session, is the account switched off,
   and what row do they have in public.profiles. Pages, server actions and
   route handlers all read the viewer through here so the rules can't drift.

   Reads go through the caller's own client, so RLS still applies: the viewer
   can only see its own profiles row (the DCL team can see all of them, which
   the admin pages rely on). */

export type ProfileRecord = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  factory_id: string | null;
  language: string;
  invited_by: string | null;
  disabled_at: string | null;
  created_at: string | null;
};

export type SessionUser = {
  id: string;
  email: string | null;
  /** "email" (password) or "google" — for the "signed in with" line. */
  provider: string | null;
};

export type Viewer = {
  user: SessionUser | null;
  profile: ProfileRecord | null;
  /** null when signed out, disabled or banned — mirrors public.current_app_role(). */
  role: AppRole | null;
  /** Signed in, but the account is switched off in profiles.disabled_at. */
  disabled: boolean;
  /** Signed in as far as the cookie goes, but Supabase refuses the session. */
  banned: boolean;
  /** Signed in with no profiles row (migration/trigger not applied yet). */
  missingProfile: boolean;
};

export const PROFILE_COLUMNS =
  "id, email, full_name, role, factory_id, language, invited_by, disabled_at, created_at";

export function toProfileRecord(row: unknown): ProfileRecord | null {
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  if (typeof value.id !== "string") return null;

  return {
    id: value.id,
    email: typeof value.email === "string" ? value.email : null,
    full_name: typeof value.full_name === "string" ? value.full_name : null,
    role: normalizeRole(value.role),
    factory_id: typeof value.factory_id === "string" ? value.factory_id : null,
    language: typeof value.language === "string" && value.language ? value.language : "en",
    invited_by: typeof value.invited_by === "string" ? value.invited_by : null,
    disabled_at: typeof value.disabled_at === "string" ? value.disabled_at : null,
    created_at: typeof value.created_at === "string" ? value.created_at : null,
  };
}

/* Supabase answers with an error — not a user — for a banned account (or a
   deleted one). The message is a user-facing hint, not something to show. */
function isBannedError(error: { status?: number; code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "user_banned" || error.status === 403 || /banned/i.test(error.message ?? "");
}

/** The signed-in viewer, or a "nobody" viewer when there is no valid session. */
export async function getViewer(client?: SupabaseClient): Promise<Viewer> {
  const supabase = client ?? (await getServerSupabase());

  /* getUser() asks the Auth server, so a stale or forged cookie can't get in. */
  const { data, error } = await supabase.auth.getUser();
  const authUser = data?.user ?? null;

  if (!authUser) {
    return {
      user: null,
      profile: null,
      role: null,
      disabled: false,
      banned: isBannedError(error),
      missingProfile: false,
    };
  }

  const { data: row } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", authUser.id)
    .maybeSingle();

  const profile = toProfileRecord(row);
  const disabled = Boolean(profile?.disabled_at);

  return {
    user: {
      id: authUser.id,
      email: authUser.email ?? null,
      provider:
        typeof authUser.app_metadata?.provider === "string" ? authUser.app_metadata.provider : null,
    },
    profile,
    /* A missing row means the migration/trigger has not run yet. Treat it as
       "customer": that grants nothing, and it keeps the site usable instead of
       locking every account out with a misleading "disabled" message. */
    role: disabled ? null : (profile?.role ?? "customer"),
    disabled,
    banned: false,
    missingProfile: !profile,
  };
}

/** Display name for a viewer, falling back to the email local part. */
export function viewerName(viewer: Viewer): string {
  return (
    viewer.profile?.full_name ||
    viewer.user?.email?.split("@")[0] ||
    "there"
  );
}
