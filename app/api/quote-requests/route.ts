import { NextRequest, NextResponse } from "next/server";
import {
  validateQuoteRequest,
  type RawQuoteInput,
} from "../../../lib/quoteRequests";
import { sendStaffQuoteEmail, sendStaffQuoteSms } from "../../../lib/brevo";
import { clientKey, createRateLimiter } from "../../../lib/rateLimit";
import { getPublicSupabase } from "../../../lib/supabasePublic";

/* ---------------------------------------------------------
   POST /api/quote-requests — "Start your project" (/start)

   TEMPORARY stand-in for the DICI chat; see lib/contact.ts.

   Order of operations (same shape as /api/subscribers):
   1. validate              → 400 with per-field errors
   2. save to Supabase      → source of truth, blocks the success state
   3. notify staff (Brevo)  → SMS + email in parallel, best effort

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

  const { error: insertError } = await supabase
    .from("quote_requests")
    .insert({ description, phone, source, sms_consent: true });

  if (insertError) {
    console.error("QUOTE REQUEST SAVE ERROR:", insertError);

    return NextResponse.json(
      { error: "We couldn't send that just now. Please try again in a moment." },
      { status: 500 }
    );
  }

  const [sms, email] = await Promise.all([
    sendStaffQuoteSms({ description, phone }),
    sendStaffQuoteEmail({ description, phone }),
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
