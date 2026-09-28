/* =========================================================
   DYE CUT LAB — role model shared by server guards and the UI
============================================================
   Imported from client components too (account menu, admin form), so this
   file must stay free of `next/*` and Supabase imports. The database side is
   the `app_role` enum in supabase/migrations/20260928120000_accounts_and_roles.sql. */

export const APP_ROLES = ["customer", "dcl_staff", "dcl_admin", "factory"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  customer: "Customer",
  dcl_staff: "DCL staff",
  dcl_admin: "DCL admin",
  factory: "Factory",
};

/* What each role gets in the account menu, and where they land after signing
   in. dcl_staff and dcl_admin share /admin; only an admin sees /admin/accounts. */
export const ROLE_HOME: Record<AppRole, { path: string; label: string; blurb: string }> = {
  customer: {
    path: "/account",
    label: "My account",
    blurb: "Your projects, quotes and orders.",
  },
  dcl_staff: {
    path: "/admin",
    label: "Team workspace",
    blurb: "Quotes, projects and accounts for the DYE CUT LAB team.",
  },
  dcl_admin: {
    path: "/admin",
    label: "Team workspace",
    blurb: "Quotes, projects and accounts for the DYE CUT LAB team.",
  },
  factory: {
    path: "/factory",
    label: "Factory portal",
    blurb: "Work sent to your factory.",
  },
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

/* Anything unknown, missing or misspelled becomes "customer" — the
   lowest-privilege value, so a broken row can never hand out team access. */
export function normalizeRole(value: unknown): AppRole {
  return isAppRole(value) ? value : "customer";
}

export function homePathForRole(role: AppRole): string {
  return ROLE_HOME[role].path;
}

/* True for the role's own area and anything under it ("/admin", "/admin/accounts").
   /admin/accounts is still dcl_admin-only: the page guard decides that, this
   only keeps the sign-in redirect from fighting it. */
export function isPathAllowedForRole(role: AppRole, path: string): boolean {
  const home = homePathForRole(role);
  if (path === home) return true;
  return path.startsWith(`${home}/`) || path.startsWith(`${home}?`);
}

/* Only our own pages: "/account", "/start?x=1" — never "//evil.com". */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

/* Where a signed-in role should land: `next` when it belongs to their area,
   otherwise their own home. One function for the sign-in form, the OAuth
   callback, /api/auth/home and the guards, so they cannot disagree. */
export function resolveLandingPath(role: AppRole, next?: string | null): string {
  const path = safeInternalPath(next);
  if (path && isPathAllowedForRole(role, path)) return path;
  return homePathForRole(role);
}
