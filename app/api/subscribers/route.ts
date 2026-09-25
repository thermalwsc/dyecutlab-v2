import { NextRequest, NextResponse } from "next/server";
import { validateSignup, type RawSignupInput } from "../../../lib/subscribers";
import {
  sendBrevoConfirmationEmail,
  sendBrevoConfirmationSms,
  sendStaffSignupEmail,
  syncBrevoContact,
  type ChannelResult,
} from "../../../lib/brevo";
import { clientKey, createRateLimiter } from "../../../lib/rateLimit";
import { getPublicSupabase } from "../../../lib/supabasePublic";

/* ---------------------------------------------------------
   POST /api/subscribers — landing page lead capture

   Order of operations (deliberate):
   1. validate            → 400 with per-field errors
   2. save to Supabase    → source of truth, blocks the success state
   3. notify through Brevo → confirmation to the subscriber + team alert
                              email; best effort, never blocks success

   The route talks to Supabase with the publishable (anon) key, so the
   subscribers RLS policy allows INSERT only. Duplicates are detected
   through the unique indexes on email / phone (Postgres 23505) rather
   than a read, because anon has no SELECT grant.
--------------------------------------------------------- */

/* 5 submissions / 10 minutes per client. */
const isRateLimited = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 5,
});

export async function POST(request: NextRequest) {
  if (isRateLimited(clientKey(request))) {
    return NextResponse.json(
      {
        error:
          "Too many sign-ups from this connection. Please try again in a few minutes.",
      },
      { status: 429 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that request. Please try again." },
      { status: 400 }
    );
  }

  const validation = validateSignup((body ?? {}) as RawSignupInput);

  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "Please check the highlighted fields.",
        errors: validation.errors,
      },
      { status: 400 }
    );
  }

  const { name, email, phone, emailOptIn, smsOptIn, source } =
    validation.value;

  const supabase = getPublicSupabase();

  if (!supabase) {
    console.error(
      "SUBSCRIBER SAVE ERROR: Supabase environment variables are not configured."
    );

    return NextResponse.json(
      {
        error:
          "We couldn't save your sign-up right now. Please try again in a moment.",
      },
      { status: 503 }
    );
  }

  let alreadySubscribed = false;

  try {
    const { error: insertError } = await supabase
      .from("subscribers")
      .insert({
        name,
        email,
        phone,
        email_opt_in: emailOptIn,
        sms_opt_in: smsOptIn,
        source,
      });

    /* 23505 = unique_violation on subscribers_email_unique_idx /
       subscribers_phone_unique_idx: the same person already signed up. */
    if (insertError?.code === "23505") {
      alreadySubscribed = true;
    } else if (insertError) {
      throw insertError;
    }
  } catch (saveError) {
    console.error("SUBSCRIBER SAVE ERROR:", saveError);

    return NextResponse.json(
      {
        error:
          "We couldn't save your sign-up right now. Please try again in a moment.",
      },
      { status: 500 }
    );
  }

  /* Confirmations are skipped for a repeat sign-up so the form cannot be
     used to spam a contact that is already on the list. */
  const duplicateDetail = alreadySubscribed
    ? "Already subscribed - no confirmation re-sent."
    : null;

  const channels: { email: ChannelResult; sms: ChannelResult } = {
    email: { status: "skipped", detail: duplicateDetail ?? "No email provided." },
    sms: { status: "skipped", detail: duplicateDetail ?? "No phone provided." },
  };

  if (!alreadySubscribed) {
    if (email || phone) {
      await syncBrevoContact({ email, phone, name });
    }

    /* The team alert is internal only, so it is not reported back in
       `channels`; a failure is logged inside sendStaffSignupEmail. */
    const [emailResult, smsResult] = await Promise.all([
      email
        ? sendBrevoConfirmationEmail({ email, name })
        : Promise.resolve(channels.email),
      phone
        ? sendBrevoConfirmationSms({ phone })
        : Promise.resolve(channels.sms),
      sendStaffSignupEmail({ name, email, phone }),
    ]);

    channels.email = emailResult;
    channels.sms = smsResult;
  }

  return NextResponse.json({
    ok: true,
    alreadySubscribed,
    channels,
  });
}
