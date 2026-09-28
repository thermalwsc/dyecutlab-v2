import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/* =========================================================
   DYE CUT LAB — what Supabase Auth knows about an account
============================================================
   public.profiles records who invited whom, but not whether the invitation was
   ever accepted: Supabase has no "pending invite" flag. What it does return per
   user is `invited_at`, `email_confirmed_at`, `last_sign_in_at` and
   `banned_until`, so "still pending" is derived as:

       invited by an admin + never confirmed + never signed in

   Only the Auth admin API can read auth.users, hence the service role. The code
   lives in the admin module on purpose: nothing outside app/admin/accounts uses
   it, and the list page degrades to profiles-only statuses when the key is
   missing. */

export type AuthAccountStatus = {
  invitedAt: string | null;
  confirmed: boolean;
  lastSignInAt: string | null;
  banned: boolean;
};

/* One page of 1000 covers a beta-sized team; the loop stops at the first short
   page and never walks more than five pages. */
const MAX_PAGES = 5;
const PER_PAGE = 1000;

function toStatus(user: {
  invited_at?: string;
  email_confirmed_at?: string;
  last_sign_in_at?: string;
  banned_until?: string;
}): AuthAccountStatus {
  const bannedUntil = user.banned_until ? new Date(user.banned_until) : null;

  return {
    invitedAt: user.invited_at ?? null,
    confirmed: Boolean(user.email_confirmed_at),
    lastSignInAt: user.last_sign_in_at ?? null,
    banned: Boolean(bannedUntil && bannedUntil.getTime() > Date.now()),
  };
}

export async function loadAuthStatuses(
  admin: SupabaseClient
): Promise<Map<string, AuthAccountStatus> | null> {
  const statuses = new Map<string, AuthAccountStatus>();

  try {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
      if (error) {
        console.error("AUTH LIST USERS ERROR:", error.message);
        return null;
      }

      data.users.forEach((user) => statuses.set(user.id, toStatus(user)));
      if (data.users.length < PER_PAGE) break;
    }
  } catch (error) {
    console.error("AUTH LIST USERS FAILED:", error);
    return null;
  }

  return statuses;
}

/* Used to tell "invite this email" apart from "this email already has an account
   but lost its profile row". */
export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string
): Promise<AuthAccountStatus & { id: string } | null> {
  const wanted = email.trim().toLowerCase();

  try {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
      if (error) {
        console.error("AUTH LIST USERS ERROR:", error.message);
        return null;
      }

      const match = data.users.find((user) => (user.email ?? "").toLowerCase() === wanted);
      if (match) return { id: match.id, ...toStatus(match) };
      if (data.users.length < PER_PAGE) break;
    }
  } catch (error) {
    console.error("AUTH LIST USERS FAILED:", error);
    return null;
  }

  return null;
}
