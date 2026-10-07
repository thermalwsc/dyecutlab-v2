import { NextRequest, NextResponse } from "next/server";
import {
  validateQuoteRequest,
  type RawQuoteInput,
} from "../../../lib/quoteRequests";
import { sendStaffQuoteEmail } from "../../../lib/brevo";
import { sendStaffQuoteSms } from "../../../lib/sendblue";
import { clientKey, createRateLimiter } from "../../../lib/rateLimit";
import { getPublicSupabase } from "../../../lib/supabasePublic";
import { getViewer, viewerName } from "../../../lib/auth/viewer";
import { getServerSupabase } from "../../../lib/supabase/server";
import { getServiceRoleSupabase, isServiceRoleConfigured } from "../../../lib/supabase/admin";

/* ---------------------------------------------------------
   POST /api/quote-requests — "Start your project" (/start)

   TEMPORARY stand-in for the DICI chat; see lib/contact.ts.

   Order of operations (same shape as /api/subscribers):
   1. validate              → 400 with per-field errors
   2. save to Supabase      → source of truth, blocks the success state
   3. notify staff          → Sendblue SMS (iMessage) + Brevo email in
                              parallel, best effort

   Signed-in customers: the sender is identified from the session cookie on
   the server (never from the request body) and their account id, name and
   email are saved with the request, so the team sees who it is. Those
   columns are written with the service role only; see
   supabase/migrations/20261006000000_quote_requests_customer.sql. Guests
   work exactly as before.

   Nothing is sent to the customer automatically — a real person texts
   them back. Every accepted request texts staff, so the throttle is
   tighter than the newsletter form's and a honeypot drops obvious bots.
--------------------------------------------------------- */

/* 3 requests / 10 minutes per client. */
const isRateLimited = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 3,
});

export async function POST(request: NextRequest) {
  if (isRateLimited(clientKey(request))) {
    return NextResponse.json(
      {
        error:
          "We already have your request — hang tight, we'll text you shortly.",
      },
      { status: 429 }
    );
  }

  let body: (RawQuoteInput & { website?: unknown }) | null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that request. Please try again." },
      { status: 400 }
    );
  }

  /* Honeypot: a hidden field people never see. Bots that fill it get a
     normal-looking success and nothing is saved or sent. */
  if (typeof body?.website === "string" && body.website.trim()) {
    return NextResponse.json({ ok: true });
  }

  const validation = validateQuoteRequest(body ?? {});

  if (!validation.ok) {
    return NextResponse.json(
      { error: "Please check the highlighted fields.", errors: validation.errors },
      { status: 400 }
    );
  }

  const { description, phone, source } = validation.value;
  const sender = await identifySender();
  const supabase = getPublicSupabase();

  if (!supabase) {
    console.error(
      "QUOTE REQUEST SAVE ERROR: Supabase environment variables are not configured."
    );

    return NextResponse.json(
      { error: "We couldn't send that just now. Please try again in a moment." },
      { status: 503 }
    );
  }

  const base = { description, phone, source, sms_consent: true };
  let insertError: { message?: string } | null = null;
  let saved = false;

  /* Signed in: save who sent it. If that can't be done (service key missing,
     or the migration hasn't been run yet) fall back to the plain guest insert
     so the request is never lost. */
  if (sender && isServiceRoleConfigured()) {
    const { error } = await getServiceRoleSupabase()
      .from("quote_requests")
      .insert({ ...base, user_id: sender.id, customer_name: sender.name, customer_email: sender.email });
    if (!error) saved = true;
    else console.error("QUOTE REQUEST SAVE (with customer) ERROR:", error.message);
  }

  if (!saved) {
    const { error } = await supabase.from("quote_requests").insert(base);
    insertError = error;
  }

  if (insertError) {
    console.error("QUOTE REQUEST SAVE ERROR:", insertError);

    return NextResponse.json(
      { error: "We couldn't send that just now. Please try again in a moment." },
      { status: 500 }
    );
  }

  const [sms, email] = await Promise.all([
    sendStaffQuoteSms({ description, phone, customer: sender }),
    sendStaffQuoteEmail({ description, phone, customer: sender }),
  ]);

  /* The request is saved either way, but if neither alert went out nobody
     knows it's waiting — make that loud in the logs. */
  if (sms.status !== "sent" && email.status !== "sent") {
    console.error("QUOTE REQUEST STAFF NOT NOTIFIED — check quote_requests:", {
      phone,
      sms,
      email,
    });
  }

  return NextResponse.json({ ok: true });
}

/* The verified signed-in sender, or null for a guest. Name falls back to the
   email's first part so the team always sees something readable. */
async function identifySender(): Promise<{ id: string; name: string; email: string } | null> {
  try {
    const viewer = await getViewer(await getServerSupabase());
    if (!viewer.user?.email) return null;
    return { id: viewer.user.id, name: viewerName(viewer), email: viewer.user.email };
  } catch (error) {
    console.error("QUOTE REQUEST SENDER LOOKUP ERROR:", error);
    return null;
  }
}
