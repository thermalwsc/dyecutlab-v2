/* =========================================================
   SENDBLUE — server-side SMS / iMessage client
=========================================================

   Provider for ALL text messages. Brevo no longer sends any SMS
   (it stays the email provider — see lib/brevo.ts).

   Why Sendblue: most DYE CUT LAB customers are on iPhone, and
   Sendblue delivers as a native iMessage (blue bubble) instead of a
   generic SMS, which reads as more trustworthy to recipients.

   Uses the REST API directly with fetch (no SDK dependency), the
   same way lib/brevo.ts does. Server-only: never import this from a
   "use client" component — Sendblue blocks browser-originated calls
   and the API secret must stay on the server.

   Verified against Sendblue's own docs (docs.sendblue.com), not guessed:
   - Send:   POST https://api.sendblue.com/api/send-message
             headers: `sb-api-key-id` + `sb-api-secret-key`
             body:    { number, from_number, content }
   - Status: GET  https://api.sendblue.com/api/status?handle=<message_handle>
   - The send response carries `message_handle`, `status`
     (QUEUED / ACCEPTED / SENT / DELIVERED / ERROR), `error_code`,
     `error_message`, `service` ("iMessage" | "sms") and
     `was_downgraded` (true when the recipient is not on iMessage and
     Sendblue fell back to SMS).
   - `error_code`: per the docs "any code besides 0 or null is a
     failure". HTTP 429 = burst/rate limit (10 msg/sec/line).
   - SMS fallback for non-iMessage (e.g. Android) recipients is
     AUTOMATIC and free; it cannot be disabled. Only App Cards and
     inline replies are iMessage-only, and neither is used here.
   - Opt-out (STOP) is handled by Sendblue: it detects stop /
     unsubscribe / cancel / opt out / revoke / end / quit and blocks
     outbound messages to an opted-out number. No STOP logic of our
     own is needed (see LANDING_PAGE_NOTES.md §12).

   Every function resolves with a status instead of throwing so a
   provider failure can never block the user-facing success state.
*/

import { type ChannelResult, errorMessage } from "./channels";
import { CONTACT } from "./contact";

const SENDBLUE_API_BASE = "https://api.sendblue.com";
const SENDBLUE_TIMEOUT_MS = 8000;

/* Keep the pre-swap length budget so staff alerts read the same as
   they did through Brevo. */
const STAFF_SMS_DESCRIPTION_MAX = 280;

type SmsConfig = {
  keyId: string | null;
  secret: string | null;
  fromNumber: string | null;
};

/* Shape of a Sendblue message object (the send response and
   GET /api/status use the same fields; only the ones we read are typed). */
type SendblueMessage = {
  status?: string | null;
  error_code?: number | null;
  error_message?: string | null;
  message_handle?: string | null;
  service?: string | null;
  was_downgraded?: boolean | null;
};

function getSmsConfig(): SmsConfig {
  return {
    keyId: process.env.SENDBLUE_API_KEY_ID?.trim() || null,
    secret: process.env.SENDBLUE_API_KEY_SECRET?.trim() || null,
    fromNumber: process.env.SENDBLUE_FROM_NUMBER?.trim() || null,
  };
}

/* Where the staff SMS goes. Explicit STAFF_NOTIFY_PHONE only — it must
   never default to the public business number in lib/contact.ts, or
   Sendblue would text itself and the alert would never arrive. The email
   equivalent (STAFF_NOTIFY_EMAIL) is resolved in lib/brevo.ts. */
function getStaffPhone(): string | null {
  return process.env.STAFF_NOTIFY_PHONE?.trim() || null;
}

async function sendbluePost(
  path: string,
  config: { keyId: string; secret: string },
  body: unknown
) {
  const response = await fetch(`${SENDBLUE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "sb-api-key-id": config.keyId,
      "sb-api-secret-key": config.secret,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(SENDBLUE_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Sendblue ${path} responded ${response.status}: ${text.slice(0, 400)}`
    );
  }

  return response;
}

/* A 2xx with `error_code` 0/null and a non-ERROR status means Sendblue
   accepted the message (QUEUED is the normal first state; SENT is the
   terminal state for SMS, DELIVERED for iMessage). Anything else is a
   failure the caller has to be able to report. */
function describeFailure(message: SendblueMessage | null) {
  const code = message?.error_code ?? null;
  const reason = message?.error_message?.trim();

  if (reason) {
    return `Sendblue error ${code ?? "?"}: ${reason}`;
  }

  return `Sendblue error ${code ?? "?"} (status ${message?.status ?? "unknown"}).`;
}

/* Low-level send. `to` must be E.164, and `from_number` must be a
   number registered on the Sendblue account (SENDBLUE_FROM_NUMBER). */
export async function sendSms(input: {
  to: string;
  content: string;
}): Promise<ChannelResult> {
  const { keyId, secret, fromNumber } = getSmsConfig();

  if (!keyId || !secret) {
    return {
      status: "skipped",
      detail:
        "SENDBLUE_API_KEY_ID / SENDBLUE_API_KEY_SECRET are not configured.",
    };
  }

  if (!fromNumber) {
    return {
      status: "skipped",
      detail:
        "SENDBLUE_FROM_NUMBER is not configured (must be a line on the Sendblue account).",
    };
  }

  try {
    const response = await sendbluePost(
      "/api/send-message",
      { keyId, secret },
      {
        number: input.to,
        from_number: fromNumber,
        content: input.content,
      }
    );

    const message = (await response.json().catch(() => null)) as
      | SendblueMessage
      | null;

    const errorCode = message?.error_code ?? null;
    const isError =
      (errorCode !== null && errorCode !== 0) || message?.status === "ERROR";

    if (isError) {
      return { status: "failed", detail: describeFailure(message) };
    }

    /* The handle is what GET /api/status and the Sendblue dashboard key
       off, so it is worth keeping in the logs. */
    const notes = [message?.status || "QUEUED"];

    if (message?.message_handle) {
      notes.push(`handle ${message.message_handle}`);
    }

    if (message?.service) {
      notes.push(message.service);
    }

    if (message?.was_downgraded) {
      notes.push("SMS fallback (recipient is not on iMessage)");
    }

    return { status: "sent", detail: notes.join(" · ") };
  } catch (error) {
    console.error("SENDBLUE SMS ERROR:", error);
    return { status: "failed", detail: errorMessage(error) };
  }
}

/* ---------------------------------------------------------
   Staff alerts — /start quote requests

   Sent to the team (not the customer) the moment a quote request is
   saved, so someone can text the customer back directly. Same copy the
   Brevo version sent: this is a provider swap, not a copy change.

   ⚠️ Operational prerequisite: Sendblue only lets a line message a
   contact that has texted it first (free shared-line plans require the
   recipient to be a verified contact, and every plan blocks messages to
   a contact who has never replied). Staff must open the thread once
   from the phone STAFF_NOTIFY_PHONE points at.
--------------------------------------------------------- */

export async function sendStaffQuoteSms(input: {
  description: string;
  phone: string;
  /** Set when a signed-in customer sent the request. */
  customer?: { name: string; email: string } | null;
}): Promise<ChannelResult> {
  const staffPhone = getStaffPhone();

  if (!staffPhone) {
    return {
      status: "skipped",
      detail: "STAFF_NOTIFY_PHONE is not configured.",
    };
  }

  const summary =
    input.description.length > STAFF_SMS_DESCRIPTION_MAX
      ? `${input.description.slice(0, STAFF_SMS_DESCRIPTION_MAX - 1)}…`
      : input.description;

  return sendSms({
    to: staffPhone,
    content: `Hi ${CONTACT.personName} - new DYE CUT LAB quote request${input.customer ? ` from ${input.customer.name}` : ""}.\nText them: ${input.phone}${input.customer ? `\n${input.customer.email}` : ""}\n\n"${summary}"`,
  });
}
