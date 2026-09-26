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

const NAME_MAX_LENGTH = 120;
const EMAIL_MAX_LENGTH = 254;
const SOURCE_MAX_LENGTH = 64;

/* Numbers without a country code are assumed to be US (+1). */
const DEFAULT_COUNTRY_CODE = "1";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export type SignupField = "name" | "email";
export type FormErrorKey = SignupField | "form";
export type SignupErrors = Partial<Record<FormErrorKey, string>>;

export type SignupInput = {
  name: string | null;
  email: string;
  source: string;
};

export type RawSignupInput = {
  name?: unknown;
  email?: unknown;
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

/* The landing page form collects email only — phone sign-ups go through
   "Text JOIN" instead — so email is required and phone is not accepted. */
export function validateSignup(raw: RawSignupInput): SignupValidation {
  const name = asTrimmedString(raw.name);
  const emailRaw = asTrimmedString(raw.email);

  const errors: SignupErrors = {};

  if (name.length > NAME_MAX_LENGTH) {
    errors.name = `Keep your name under ${NAME_MAX_LENGTH} characters.`;
  }

  const email = emailRaw ? normalizeEmail(emailRaw) : "";

  if (!email) {
    errors.email = "Add your email address so we can send you updates.";
  } else if (!isValidEmail(email)) {
    errors.email = "Enter a valid email address, like you@brand.com.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const source =
    asTrimmedString(raw.source).slice(0, SOURCE_MAX_LENGTH) ||
    SUBSCRIBERS_SOURCE;

  return {
    ok: true,
    value: { name: name || null, email, source },
  };
}
