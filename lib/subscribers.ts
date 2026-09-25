/* =========================================================
   SUBSCRIBERS — shared validation + normalization
=========================================================

   Imported by both:
   - app/updates/SignupForm.tsx  (inline field errors)
   - app/api/subscribers/route.ts (server-side source of truth)

   Keep this module free of server-only APIs so the browser
   bundle can use the exact same rules.
*/

export const SUBSCRIBERS_SOURCE = "landing_page";

/* Compliance copy required on the landing page (see notes). */
export const SMS_CONSENT_COPY =
  "By providing your phone number, you agree to receive SMS updates from DYE CUT LAB. Message and data rates may apply. Reply STOP to unsubscribe.";

const NAME_MAX_LENGTH = 120;
const EMAIL_MAX_LENGTH = 254;
const SOURCE_MAX_LENGTH = 64;

/* Numbers without a country code are assumed to be US (+1). */
const DEFAULT_COUNTRY_CODE = "1";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export type SignupField = "name" | "email" | "phone";
export type FormErrorKey = SignupField | "form";
export type SignupErrors = Partial<Record<FormErrorKey, string>>;

export type SignupInput = {
  name: string | null;
  email: string | null;
  phone: string | null;
  emailOptIn: boolean;
  smsOptIn: boolean;
  source: string;
};

export type RawSignupInput = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  source?: unknown;
};

export type SignupValidation =
  | { ok: true; value: SignupInput }
  | { ok: false; errors: SignupErrors };

export function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(email);
}

/* Returns an E.164 number, or null when the value cannot be
   normalized. Accepted input: +1 917 555 0123, 19175550123,
   9175550123, 0091xxxxxxxxxx ... */
export function normalizePhone(raw: string): string | null {
  const compact = raw.replace(/[\s().-]/g, "");

  if (!compact) return null;

  let candidate: string;

  if (/^\+\d+$/.test(compact)) {
    candidate = compact;
  } else if (/^00\d+$/.test(compact)) {
    candidate = `+${compact.slice(2)}`;
  } else if (/^\d+$/.test(compact) && compact.length <= 10) {
    candidate = `+${DEFAULT_COUNTRY_CODE}${compact}`;
  } else if (/^\d+$/.test(compact)) {
    candidate = `+${compact}`;
  } else {
    return null;
  }

  return E164_PATTERN.test(candidate) ? candidate : null;
}

export function validateSignup(raw: RawSignupInput): SignupValidation {
  const name = asTrimmedString(raw.name);
  const emailRaw = asTrimmedString(raw.email);
  const phoneRaw = asTrimmedString(raw.phone);

  const errors: SignupErrors = {};

  if (name.length > NAME_MAX_LENGTH) {
    errors.name = `Keep your name under ${NAME_MAX_LENGTH} characters.`;
  }

  const email = emailRaw ? normalizeEmail(emailRaw) : "";

  if (email && !isValidEmail(email)) {
    errors.email = "Enter a valid email address, like you@brand.com.";
  }

  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

  if (phoneRaw && !phone) {
    errors.phone =
      "Enter a valid mobile number with country code, like +1 917 555 0123.";
  }

  if (!emailRaw && !phoneRaw) {
    errors.form = "Add an email address or a mobile number so we can reach you.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const source =
    asTrimmedString(raw.source).slice(0, SOURCE_MAX_LENGTH) ||
    SUBSCRIBERS_SOURCE;

  return {
    ok: true,
    value: {
      name: name || null,
      email: email || null,
      phone,
      emailOptIn: Boolean(email),
      smsOptIn: Boolean(phone),
      source,
    },
  };
}
