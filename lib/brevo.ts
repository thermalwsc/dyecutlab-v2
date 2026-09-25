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

