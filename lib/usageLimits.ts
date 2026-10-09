import "server-only";

import { NextResponse } from "next/server";
import { createRateLimiter } from "./rateLimit";
import { getServiceRoleSupabase, isServiceRoleConfigured } from "./supabase/admin";

/* =========================================================
   DYE CUT LAB — limits on AI and upload requests
============================================================
   Every number that protects the site from abuse and runaway AI costs lives
   here, so changing a limit is a one-line edit.

   Two layers, both checked per signed-in account:
     1. a short burst limit (in memory, per server) — stops a stuck script or a
        double-click storm
     2. a daily limit (counted in the database, shared by every server) — one
        per account, plus one site-wide total as a hard ceiling on cost.

   If the daily counter can't be reached (the migration hasn't been run, or a
   network blip) we log it and fall back to the burst limit alone, so a counting
   problem never takes the chat or uploads down. */

export type UsageKind = "chat" | "analyze" | "preflight" | "upload";

type Rule = {
  /** Most uses in a one-minute window, per account. */
  perMinute: number;
  /** Most uses per UTC day, per account. */
  perDay: number;
  /** Most uses per UTC day across the whole site. */
  siteDay: number;
  /** Shown to the person when they hit the limit. */
  label: string;
};

export const USAGE_RULES: Record<UsageKind, Rule> = {
  chat: { perMinute: 12, perDay: 150, siteDay: 2000, label: "chat messages" },
  analyze: { perMinute: 5, perDay: 40, siteDay: 500, label: "file analyses" },
  preflight: { perMinute: 8, perDay: 100, siteDay: 1000, label: "file checks" },
  upload: { perMinute: 10, perDay: 100, siteDay: 2000, label: "uploads" },
};

/* Upload rules. */
export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const MAX_FILES_PER_PROJECT = 100;
export const UPLOAD_ALLOWED_EXTENSIONS = [
  // artwork and print files
  "pdf", "ai", "eps", "svg", "psd", "indd", "tif", "tiff",
  // images
  "png", "jpg", "jpeg", "webp", "gif", "heic",
  // references and bundles
  "zip", "doc", "docx", "xls", "xlsx", "csv", "txt",
];

/* Longest chat message accepted (characters). */
export const MAX_CHAT_CHARS = 2000;

const SITE_ID = "00000000-0000-0000-0000-000000000000";

const burstLimiters = Object.fromEntries(
  (Object.keys(USAGE_RULES) as UsageKind[]).map((kind) => [
    kind,
    createRateLimiter({ windowMs: 60_000, maxRequests: USAGE_RULES[kind].perMinute }),
  ])
) as Record<UsageKind, (key: string) => boolean>;

function tooMany(error: string, retryAfterSeconds: number) {
  return NextResponse.json(
    { error },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

/* Call right after the sign-in check. Returns a ready-made 429 response when
   the account is over a limit, or null when the request may go ahead. */
export async function checkUsage(userId: string, kind: UsageKind): Promise<NextResponse | null> {
  const rule = USAGE_RULES[kind];

  if (burstLimiters[kind](userId)) {
    return tooMany("You're going a little fast. Wait a minute and try again.", 60);
  }

  if (!isServiceRoleConfigured()) return null;

  try {
    const admin = getServiceRoleSupabase();
    const mine = await admin.rpc("bump_usage", { p_user: userId, p_kind: kind, p_limit: rule.perDay });
    if (mine.error) throw mine.error;
    if (mine.data === false) {
      return tooMany(
        `You've reached today's limit of ${rule.perDay} ${rule.label}. It resets tomorrow, or text us and we'll help.`,
        3600
      );
    }

    const site = await admin.rpc("bump_usage", { p_user: SITE_ID, p_kind: kind, p_limit: rule.siteDay });
    if (site.error) throw site.error;
    if (site.data === false) {
      console.error(`USAGE: site-wide daily limit hit for ${kind} (${rule.siteDay}).`);
      return tooMany("We're very busy right now. Please try again a little later.", 3600);
    }
  } catch (error) {
    console.error("USAGE COUNTER UNAVAILABLE (burst limit still applies):", error);
  }

  return null;
}

export function fileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}
