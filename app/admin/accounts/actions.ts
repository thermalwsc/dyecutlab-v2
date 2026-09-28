"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole } from "../../../lib/auth/guard";
import { isAppRole, type AppRole } from "../../../lib/auth/roles";
import { createRateLimiter } from "../../../lib/rateLimit";
import { getServiceRoleSupabase, isServiceRoleConfigured } from "../../../lib/supabase/admin";
import { getPublicSupabase } from "../../../lib/supabasePublic";
import { findAuthUserByEmail } from "./accountStatus";

/* =========================================================
   DYE CUT LAB — /admin/accounts server actions
============================================================
   Every action here:
     1. calls requireRole(["dcl_admin"]) — the acting admin is taken from the
        session cookie, never from the form, and a non-admin is redirected away
     2. validates the input shape (role from the enum, email, factory uuid)
     3. refuses self-lockout and "demote/deactivate the last admin" moves
     4. writes through the service role, then revalidates the list
   Results come back as ?ok=<code> / ?error=<code>; page.tsx turns them into
   copy, so the UI holds no duplicated rules. */

const ACCOUNTS_PATH = "/admin/accounts";

/* Same best-effort in-process limiter the public forms use: it stops a stuck
   resubmit or a leaked admin session from spamming invitations. */
const allowInvite = createRateLimiter({ windowMs: 10 * 60_000, maxRequests: 20 });
const allowChange = createRateLimiter({ windowMs: 60_000, maxRequests: 30 });

/* Roles an admin may hand out. "customer" is only reachable by demoting an
   existing account, never by invitation. */
const INVITABLE_ROLES: AppRole[] = ["dcl_staff", "dcl_admin", "factory"];

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function done(params: Record<string, string>): never {
  revalidatePath(ACCOUNTS_PATH);
  redirect(`${ACCOUNTS_PATH}?${new URLSearchParams(params).toString()}`);
}

function readEmail(value: FormDataEntryValue | null): string | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return raw.length <= 254 && EMAIL_RE.test(raw) ? raw : null;
}

function readUuid(value: FormDataEntryValue | null): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return UUID_RE.test(raw) ? raw : null;
}

function readLine(value: FormDataEntryValue | null, max: number): string | null {
  const raw = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!raw) return null;
  return raw.slice(0, max);
}

function readRole(value: FormDataEntryValue | null): AppRole | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return isAppRole(raw) ? raw : null;
}

/* How many active admins would be left if `excluding` lost admin access. */
async function otherActiveAdmins(
  admin: ReturnType<typeof getServiceRoleSupabase>,
  excluding: string
): Promise<number> {
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "dcl_admin")
    .is("disabled_at", null)
    .neq("id", excluding);

  return count ?? 0;
}

/* Links in emails must come back to whichever host is serving the request
   (localhost in dev, the real domain in production). Both must be listed under
   Supabase → Authentication → URL Configuration → Redirect URLs. */
async function siteOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = headerList.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

/* ---------------------------------------------------------
   Invite (or promote, when the email already has an account)
   --------------------------------------------------------- */

export async function inviteAccount(formData: FormData) {
  const { user } = await requireRole(["dcl_admin"]);

  if (!isServiceRoleConfigured()) done({ error: "service_key_missing" });
  if (allowInvite(user.id)) done({ error: "rate_limited" });

  const email = readEmail(formData.get("email"));
  const fullName = readLine(formData.get("full_name"), 120);
  const role = readRole(formData.get("role"));
  const factoryId = readUuid(formData.get("factory_id"));

  if (!email) done({ error: "bad_email" });
  if (!role || !INVITABLE_ROLES.includes(role)) done({ error: "bad_role" });
  /* A factory account with no factory would see nothing and belong to nothing. */
  if (role === "factory" && !factoryId) done({ error: "factory_required" });
  if (email === user.email) done({ error: "self_change" });

  const admin = getServiceRoleSupabase();

  /* Already a profile (they signed up, or another admin invited them): this is
     a role change, so don't send a second invite email. */
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("profiles")
      .update({
        role,
        factory_id: role === "factory" ? factoryId : null,
        ...(fullName ? { full_name: fullName } : {}),
      })
      .eq("id", existing.id);

    if (error) {
      console.error("ACCOUNT ROLE UPDATE ERROR:", error.message);
      done({ error: "update_failed" });
    }
    done({ ok: "role_updated", email });
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    /* Metadata only carries the display name: the sign-up trigger never reads a
       role out of it. */
    data: fullName ? { full_name: fullName } : undefined,
    redirectTo: `${await siteOrigin()}/set-password`,
  });

  /* An auth user can exist without a profile row (invited before the trigger,
     OAuth sign-up that failed midway). Promote instead of inviting twice. */
  if (inviteError) {
    const existingAuthUser = await findAuthUserByEmail(admin, email);
    if (!existingAuthUser) {
      console.error("INVITE ERROR:", inviteError.message);
      done({ error: inviteError.status === 429 ? "rate_limited_email" : "invite_failed" });
    }

    const { error } = await admin.from("profiles").upsert(
      {
        id: existingAuthUser.id,
        email,
        full_name: fullName,
        role,
        factory_id: role === "factory" ? factoryId : null,
        invited_by: user.id,
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("ACCOUNT PROFILE UPSERT ERROR:", error.message);
      done({ error: "update_failed" });
    }
    done({ ok: "role_updated", email });
  }

  const invitedId = invited?.user?.id;
  if (!invitedId) done({ error: "invite_failed" });

  /* The trigger has already created the row as "customer": fill in the rest. */
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: invitedId,
      email,
      full_name: fullName,
      role,
      factory_id: role === "factory" ? factoryId : null,
      invited_by: user.id,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error("ACCOUNT PROFILE UPSERT ERROR:", profileError.message);
    done({ ok: "invited", email, warning: "profile_incomplete" });
  }

  done({ ok: "invited", email });
}

/* ---------------------------------------------------------
   Change a role
   --------------------------------------------------------- */

export async function updateAccount(formData: FormData) {
  const { user } = await requireRole(["dcl_admin"]);

  if (!isServiceRoleConfigured()) done({ error: "service_key_missing" });
  if (allowChange(user.id)) done({ error: "rate_limited" });

  const userId = readUuid(formData.get("user_id"));
  const role = readRole(formData.get("role"));
  const factoryId = readUuid(formData.get("factory_id"));

  if (!userId || !role) done({ error: "bad_request" });
  if (role === "factory" && !factoryId) done({ error: "factory_required" });
  if (userId === user.id) done({ error: "self_change" });

  const admin = getServiceRoleSupabase();
  const { data: target } = await admin
    .from("profiles")
    .select("id, role, email, disabled_at")
    .eq("id", userId)
    .maybeSingle();

  if (!target) done({ error: "not_found" });

  /* Lockout protection: the company must always keep one admin who can get in. */
  if (
    target.role === "dcl_admin" &&
    role !== "dcl_admin" &&
    !target.disabled_at &&
    (await otherActiveAdmins(admin, userId)) === 0
  ) {
    done({ error: "last_admin" });
  }

  const { error } = await admin
    .from("profiles")
    .update({ role, factory_id: role === "factory" ? factoryId : null })
    .eq("id", userId);

  if (error) {
    console.error("ACCOUNT ROLE UPDATE ERROR:", error.message);
    done({ error: "update_failed" });
  }

  done({ ok: "role_updated", email: target.email ?? "" });
}

/* ---------------------------------------------------------
   Switch an account on or off
   --------------------------------------------------------- */

export async function setAccountActive(formData: FormData) {
  const { user } = await requireRole(["dcl_admin"]);

  if (!isServiceRoleConfigured()) done({ error: "service_key_missing" });
  if (allowChange(user.id)) done({ error: "rate_limited" });

  const userId = readUuid(formData.get("user_id"));
  const disabled = formData.get("disabled") === "true";

  if (!userId) done({ error: "bad_request" });
  if (userId === user.id) done({ error: "self_change" });

  const admin = getServiceRoleSupabase();
  const { data: target } = await admin
    .from("profiles")
    .select("id, role, email, disabled_at")
    .eq("id", userId)
    .maybeSingle();

  if (!target) done({ error: "not_found" });

  /* Never lock the business out of its own admin console. */
  if (disabled && target.role === "dcl_admin" && !target.disabled_at) {
    if ((await otherActiveAdmins(admin, userId)) === 0) done({ error: "last_admin" });
  }

  const { error } = await admin
    .from("profiles")
    .update({ disabled_at: disabled ? new Date().toISOString() : null })
    .eq("id", userId);

  if (error) {
    console.error("ACCOUNT STATUS UPDATE ERROR:", error.message);
    done({ error: "update_failed" });
  }

  /* The flag above stops the app (every guard reads it) — the ban stops Supabase
     Auth from handing out sessions at all, including an already-open tab that
     refreshes its token. */
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: disabled ? "876000h" : "none",
  });

  if (banError) console.error("AUTH BAN UPDATE ERROR:", banError.message);

  done({ ok: disabled ? "disabled" : "enabled", email: target.email ?? "" });
}

/* ---------------------------------------------------------
   Factories
   --------------------------------------------------------- */

export async function createFactory(formData: FormData) {
  const { user } = await requireRole(["dcl_admin"]);

  if (!isServiceRoleConfigured()) done({ error: "service_key_missing" });
  if (allowChange(user.id)) done({ error: "rate_limited" });

  const name = readLine(formData.get("name"), 120);
  const contactEmail = readEmail(formData.get("contact_email"));

  if (!name) done({ error: "bad_factory_name" });
  /* Optional, but if something was typed it has to be a real address. */
  if (!contactEmail && readLine(formData.get("contact_email"), 254)) done({ error: "bad_factory_email" });

  const admin = getServiceRoleSupabase();
  const { error } = await admin.from("factories").insert({
    name,
    contact_name: readLine(formData.get("contact_name"), 120),
    contact_email: contactEmail,
    phone: readLine(formData.get("phone"), 40),
    notes: readLine(formData.get("notes"), 600),
    created_by: user.id,
  });

  if (error) {
    console.error("FACTORY INSERT ERROR:", error.message);
    /* 23505 = the lower(name) unique index. */
    done({ error: error.code === "23505" ? "factory_exists" : "update_failed" });
  }

  done({ ok: "factory_created", factory: name });
}

/* ---------------------------------------------------------
   Email an existing account a link (invite lost, or no password yet)
   --------------------------------------------------------- */

export async function sendSignInLink(formData: FormData) {
  const { user } = await requireRole(["dcl_admin"]);

  if (allowInvite(user.id)) done({ error: "rate_limited" });

  const email = readEmail(formData.get("email"));
  if (!email) done({ error: "bad_email" });

  /* Uses the publishable key: this is the ordinary "reset your password" email,
     which lands on /set-password and works for an invited account too. */
  const supabase = getPublicSupabase();
  if (!supabase) done({ error: "service_key_missing" });

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/set-password`,
  });

  if (error) {
    console.error("ACCOUNT LINK EMAIL ERROR:", error.message);
    done({ error: error.status === 429 ? "rate_limited_email" : "link_failed" });
  }

  done({ ok: "link_sent", email });
}


