/* =========================================================
   QUOTE REQUESTS — shared validation for the /start form
=========================================================

   Imported by both:
   - app/start/StartForm.tsx            (inline field errors)
   - app/api/quote-requests/route.ts    (server-side source of truth)

   A quote request is NOT a newsletter sign-up: it lives in its own
   `quote_requests` table and never touches `subscribers`.
*/

import { asTrimmedString, normalizePhone } from "./subscribers";

export const QUOTE_REQUESTS_SOURCE = "start_page";

export const DESCRIPTION_MIN_LENGTH = 10;
export const DESCRIPTION_MAX_LENGTH = 1000;

/* Shown under the phone field. Staff will text this number back, so the
   visitor agrees to that specifically — not to marketing. */
export const QUOTE_SMS_CONSENT_COPY =
  "By sending this, you agree DYE CUT LAB can text you about your request. Message and data rates may apply. Reply STOP to opt out.";

export type QuoteField = "description" | "phone";
export type QuoteErrors = Partial<Record<QuoteField | "form", string>>;

export type RawQuoteInput = {
  description?: unknown;
  phone?: unknown;
};

export type QuoteInput = {
  description: string;
  phone: string;
  source: string;
};

export type QuoteValidation =
  | { ok: true; value: QuoteInput }
  | { ok: false; errors: QuoteErrors };

export function validateQuoteRequest(raw: RawQuoteInput): QuoteValidation {
  /* Collapse runs of blank lines/spaces so the staff SMS stays compact. */
  const description = asTrimmedString(raw.description)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  const phoneRaw = asTrimmedString(raw.phone);

  const errors: QuoteErrors = {};

  if (!description) {
    errors.description = "Tell us what you want made.";
  } else if (description.length < DESCRIPTION_MIN_LENGTH) {
    errors.description = "Give us a little more to go on — what, how many, any sizes?";
  } else if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Keep it under ${DESCRIPTION_MAX_LENGTH} characters — we'll get the rest over text.`;
  }

  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

  if (!phoneRaw) {
    errors.phone = "Add your mobile number so we can text you back.";
  } else if (!phone) {
    errors.phone = "Enter a valid mobile number, like +1 917 555 0123.";
  }

  if (Object.keys(errors).length > 0 || !phone) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: { description, phone, source: QUOTE_REQUESTS_SOURCE },
  };
}
