/* =========================================================
   BREVO (formerly Sendinblue) — server-side client
=========================================================

   Single provider for BOTH the email and the SMS confirmation.

   Uses the official REST API directly with fetch (no SDK
   dependency). Server-only: never import this from a
   "use client" component.

   Docs:
   - https://developers.brevo.com/docs/send-a-transactional-email
   - https://developers.brevo.com/reference/send-async-transactional-sms
   - https://developers.brevo.com/reference/create-contact

   Every function resolves with a status instead of throwing so a
   provider failure can never block the user-facing success state.
*/

import { CONTACT } from "./contact";

const BREVO_API_BASE = "https://api.brevo.com/v3";
const BREVO_TIMEOUT_MS = 8000;

const CONFIRMATION_SUBJECT = "You're on the DYE CUT LAB update list";

/* Required copy — kept identical to the landing page disclosure. */
export const SMS_CONFIRMATION_CONTENT =
  "Thanks for signing up for DYE CUT LAB updates! Reply STOP to unsubscribe.";

export type ChannelStatus = "sent" | "skipped" | "failed";

export type ChannelResult = {
  status: ChannelStatus;
  detail?: string;
};

type EmailConfig = {
  apiKey: string | null;
  senderEmail: string | null;
  senderName: string;
};

type SmsConfig = {
  apiKey: string | null;
  sender: string;
  type: "transactional" | "marketing";
};

function getEmailConfig(): EmailConfig {
  return {
    apiKey: process.env.BREVO_API_KEY?.trim() || null,
    senderEmail: process.env.BREVO_SENDER_EMAIL?.trim() || null,
    senderName: process.env.BREVO_SENDER_NAME?.trim() || "DYE CUT LAB",
  };
}

function getSmsConfig(): SmsConfig {
  /* Our confirmation SMS contains a STOP keyword. Per Brevo's docs a
     stop code reclassifies the message as Marketing SMS, so marketing
     is the honest default and can be overridden per-environment. */
  const type =
    process.env.BREVO_SMS_TYPE?.trim() === "transactional"
      ? "transactional"
      : "marketing";

  return {
    apiKey: process.env.BREVO_API_KEY?.trim() || null,
    sender: process.env.BREVO_SMS_SENDER?.trim() || "DYECUTLAB",
    type,
  };
}

function getListId(): number | null {
  const parsed = Number.parseInt(process.env.BREVO_LIST_ID ?? "", 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function brevoPost(path: string, apiKey: string, body: unknown) {
  const response = await fetch(`${BREVO_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Brevo ${path} responded ${response.status}: ${text.slice(0, 400)}`
    );
  }

  return response;
}


/* Brevo contacts are only a mirror of our Supabase `subscribers` table;
   Supabase stays the source of truth. A missing BREVO_LIST_ID still
   syncs the contact, it just does not join a list. Blacklist flags are
   intentionally never set here so a STOP opt-out owned by Brevo is
   never overwritten by this form. */
export async function syncBrevoContact(input: {
  email: string | null;
  phone: string | null;
  name: string | null;
}): Promise<ChannelResult> {
  const { apiKey } = getEmailConfig();

  if (!apiKey) {
    return { status: "skipped", detail: "BREVO_API_KEY is not configured." };
  }

  if (!input.email && !input.phone) {
    return { status: "skipped", detail: "No email or phone to sync." };
  }

  const attributes: Record<string, string> = {};

  if (input.name) {
    attributes.FNAME = input.name.slice(0, 100);
  }

  if (input.phone) {
    attributes.SMS = input.phone;
  }

  const listId = getListId();
  const body: Record<string, unknown> = { updateEnabled: true };

  if (input.email) {
    body.email = input.email;
  }

  if (Object.keys(attributes).length > 0) {
    body.attributes = attributes;
  }

  if (listId) {
    body.listIds = [listId];
  }

  try {
    await brevoPost("/contacts", apiKey, body);
    return { status: "sent" };
  } catch (error) {
    console.error("BREVO CONTACT SYNC ERROR:", error);
    return { status: "failed", detail: errorMessage(error) };
  }
}

export async function sendBrevoConfirmationEmail(input: {
  email: string;
  name: string | null;
}): Promise<ChannelResult> {
  const { apiKey, senderEmail, senderName } = getEmailConfig();

  if (!apiKey) {
    return { status: "skipped", detail: "BREVO_API_KEY is not configured." };
  }

  if (!senderEmail) {
    return {
      status: "skipped",
      detail: "BREVO_SENDER_EMAIL is not configured.",
    };
  }

  const to = input.name
    ? { email: input.email, name: input.name }
    : { email: input.email };

  try {
    await brevoPost("/smtp/email", apiKey, {
      sender: { name: senderName, email: senderEmail },
      to: [to],
      subject: CONFIRMATION_SUBJECT,
      htmlContent: buildConfirmationEmail(input.name),
      textContent: buildConfirmationText(input.name),
      tags: ["landing_page_signup"],
    });

    return { status: "sent" };
  } catch (error) {
    console.error("BREVO EMAIL SEND ERROR:", error);
    return { status: "failed", detail: errorMessage(error) };
  }
}

export async function sendBrevoConfirmationSms(input: {
  phone: string;
}): Promise<ChannelResult> {
  const { apiKey, sender, type } = getSmsConfig();

  if (!apiKey) {
    return { status: "skipped", detail: "BREVO_API_KEY is not configured." };
  }

  try {
    await brevoPost("/transactionalSMS/send", apiKey, {
      recipient: input.phone,
      sender,
      content: SMS_CONFIRMATION_CONTENT,
      type,
      unicodeEnabled: false,
      tag: "landing_page_signup",
    });

    return { status: "sent" };
  } catch (error) {
    console.error("BREVO SMS SEND ERROR:", error);
    return { status: "failed", detail: errorMessage(error) };
  }
}

/* On-brand HTML confirmation — white background, black type,
   lime accent and the same wordmark used on the site. */
function buildConfirmationEmail(name: string | null) {
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi there,";

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
      <tr>
        <td align="center" style="padding:32px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:Arial,Helvetica,sans-serif;color:#090909;">
            <tr>
              <td style="font-size:22px;font-weight:900;line-height:0.9;letter-spacing:-0.06em;">DYE CUT<br />LAB</td>
            </tr>
            <tr>
              <td style="padding-top:28px;font-size:10px;letter-spacing:0.12em;color:#65a30d;">YOU&#39;RE ON THE LIST</td>
            </tr>
            <tr>
              <td style="padding-top:12px;font-size:30px;font-weight:500;line-height:1;letter-spacing:-0.045em;">Thanks for signing up.</td>
            </tr>
            <tr>
              <td style="padding-top:18px;font-size:15px;line-height:22px;color:#3f3f46;">
                ${greeting} We&#39;ll email you when DYE CUT LAB drops new packaging and when new DICI features go live.
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;border-top:1px solid #e4e4e7;font-size:11px;line-height:18px;color:#a1a1aa;">
                You&#39;re receiving this because you signed up for product updates at dyecutlab.com/updates.
                <br />Reply to this email to unsubscribe at any time.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildConfirmationText(name: string | null) {
  const greeting = name ? `Hi ${name},` : "Hi there,";

  return `${greeting}

Thanks for signing up for DYE CUT LAB updates. We'll let you know when new packaging drops and when new DICI features go live.

You're receiving this because you signed up for product updates at dyecutlab.com/updates. Reply to this email to unsubscribe at any time.`;
}


/* =========================================================
   STAFF NOTIFICATIONS — /start quote requests
=========================================================

   Sent to the team (not the customer) the moment a quote request is
   saved, so someone can text the customer back directly. SMS is the
   primary ping; email is a backup and a searchable record.

   Destinations default to the business contact details in
   lib/contact.ts and can be overridden per environment with
   STAFF_NOTIFY_PHONE / STAFF_NOTIFY_EMAIL.
*/

const STAFF_SMS_DESCRIPTION_MAX = 280;

export type QuoteNotification = {
  description: string;
  phone: string;
};

function getStaffDestinations() {
  return {
    phone: process.env.STAFF_NOTIFY_PHONE?.trim() || CONTACT.phoneE164,
    email: process.env.STAFF_NOTIFY_EMAIL?.trim() || CONTACT.email,
  };
}

export async function sendStaffQuoteSms(
  input: QuoteNotification
): Promise<ChannelResult> {
  const { apiKey, sender } = getSmsConfig();
  const { phone: staffPhone } = getStaffDestinations();

  if (!apiKey) {
    return { status: "skipped", detail: "BREVO_API_KEY is not configured." };
  }

  const summary =
    input.description.length > STAFF_SMS_DESCRIPTION_MAX
      ? `${input.description.slice(0, STAFF_SMS_DESCRIPTION_MAX - 1)}…`
      : input.description;

  try {
    await brevoPost("/transactionalSMS/send", apiKey, {
      recipient: staffPhone,
      sender,
      content: `Hi ${CONTACT.personName} - new DYE CUT LAB quote request.\nText them: ${input.phone}\n\n"${summary}"`,
      /* Internal alert with no opt-out keyword, so it stays transactional
         (no marketing sending-hour restrictions). */
      type: "transactional",
      /* Customer descriptions can contain emoji / accents. */
      unicodeEnabled: true,
      tag: "quote_request_staff",
    });

    return { status: "sent" };
  } catch (error) {
    console.error("BREVO STAFF SMS ERROR:", error);
    return { status: "failed", detail: errorMessage(error) };
  }
}

export async function sendStaffQuoteEmail(
  input: QuoteNotification
): Promise<ChannelResult> {
  const { apiKey, senderEmail, senderName } = getEmailConfig();
  const { email: staffEmail } = getStaffDestinations();

  if (!apiKey) {
    return { status: "skipped", detail: "BREVO_API_KEY is not configured." };
  }

  if (!senderEmail) {
    return {
      status: "skipped",
      detail: "BREVO_SENDER_EMAIL is not configured.",
    };
  }

  const phone = escapeHtml(input.phone);
  const description = escapeHtml(input.description).replace(/\n/g, "<br />");

  try {
    await brevoPost("/smtp/email", apiKey, {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: staffEmail }],
      subject: `New quote request — text ${input.phone}`,
      htmlContent: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#0a0a0a;">
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.12em;color:#65a30d;">HI ${escapeHtml(CONTACT.personName.toUpperCase())} — NEW QUOTE REQUEST</p>
    <p style="margin:0 0 18px;font-size:24px;font-weight:900;">Text them back: <a href="sms:${phone}" style="color:#0a0a0a;">${phone}</a></p>
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#71717a;">WHAT THEY WANT MADE</p>
    <p style="margin:0;padding:14px 16px;border-radius:14px;background:#f2fadf;font-size:15px;line-height:22px;">${description}</p>
    <p style="margin:18px 0 0;font-size:11px;color:#a1a1aa;">Sent from the /start page. Saved in Supabase → quote_requests.</p>
  </body>
</html>`,
      textContent: `Hi ${CONTACT.personName} — new quote request\n\nText them back: ${input.phone}\n\nWhat they want made:\n${input.description}\n\nSaved in Supabase → quote_requests.`,
      tags: ["quote_request_staff"],
    });

    return { status: "sent" };
  } catch (error) {
    console.error("BREVO STAFF EMAIL ERROR:", error);
    return { status: "failed", detail: errorMessage(error) };
  }
}

/* Team alert for a NEW beta sign-up (repeat sign-ups are not re-sent).
   Email only — the team asked for an inbox record, not a text. */
export async function sendStaffSignupEmail(input: {
  name: string | null;
  email: string | null;
  phone: string | null;
}): Promise<ChannelResult> {
  const { apiKey, senderEmail, senderName } = getEmailConfig();
  const { email: staffEmail } = getStaffDestinations();

  if (!apiKey) {
    return { status: "skipped", detail: "BREVO_API_KEY is not configured." };
  }

  if (!senderEmail) {
    return {
      status: "skipped",
      detail: "BREVO_SENDER_EMAIL is not configured.",
    };
  }

  const who = input.name || input.email || input.phone || "Someone";
  const rows = [
    ["Name", input.name],
    ["Email", input.email],
    ["Mobile", input.phone],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;font-size:12px;font-weight:700;color:#71717a;">${label.toUpperCase()}</td><td style="padding:6px 0;font-size:15px;">${escapeHtml(value)}</td></tr>`
    )
    .join("");

  try {
    await brevoPost("/smtp/email", apiKey, {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: staffEmail }],
      subject: `New beta sign-up — ${who}`,
      htmlContent: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#0a0a0a;">
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.12em;color:#65a30d;">HI ${escapeHtml(CONTACT.personName.toUpperCase())} — NEW BETA SIGN-UP</p>
    <p style="margin:0 0 18px;font-size:24px;font-weight:900;">${escapeHtml(who)} joined the beta list.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="padding:14px 16px;border-radius:14px;background:#f2fadf;">${htmlRows}</table>
    <p style="margin:18px 0 0;font-size:11px;color:#a1a1aa;">Sent from the landing page sign-up form. Saved in Supabase → subscribers and added to Brevo contacts.</p>
  </body>
</html>`,
      textContent: `Hi ${CONTACT.personName} — new beta sign-up\n\n${rows
        .map(([label, value]) => `${label}: ${value}`)
        .join("\n")}\n\nSaved in Supabase → subscribers and added to Brevo contacts.`,
      tags: ["beta_signup_staff"],
    });

    return { status: "sent" };
  } catch (error) {
    console.error("BREVO STAFF SIGNUP EMAIL ERROR:", error);
    return { status: "failed", detail: errorMessage(error) };
  }
}
