/* =========================================================
   TEXT-A-KEYWORD CONFIG — landing page "Text JOIN / ORDER" CTAs
=========================================================

   The pills show the team's real number (lib/contact.ts), so tapping
   one opens the visitor's SMS app to text a real person.

   ⚠️ Keyword handling is MANUAL for now — see LANDING_PAGE_NOTES.md §10.
   Nothing reads inbound texts automatically: staff see "ORDER" / "JOIN"
   on their phone and act on it (reply / add the contact to Brevo by
   hand). That is why the web sign-up form stays open under the JOIN pill.

   - SMS_NUMBER_ACCEPTS_TEXTS: the number is real and staffed → pills are
     tappable `sms:` links. Set false to fall back to plain text.
   - SMS_KEYWORDS_LIVE: inbound keyword automation (JOIN → subscribe,
     ORDER → quote request) is built and tested. Only then does the form
     collapse behind a "Prefer a form?" toggle.
*/

import { CONTACT } from "./contact";

export const SMS_NUMBER_ACCEPTS_TEXTS = true;

export const SMS_KEYWORDS_LIVE = false;

export const SMS_NUMBER = {
  /* E.164, used for the `sms:` link. */
  e164: CONTACT.phoneE164,
  /* What visitors see. */
  display: CONTACT.phoneDisplay,
};

export const SMS_KEYWORDS = {
  join: "JOIN",
  order: "ORDER",
} as const;

/* Disclosure under the JOIN button. Wording to be confirmed by the
   client/counsel once the program (frequency, HELP reply, terms and
   privacy URLs) is registered with the carrier/provider. */
export const SMS_KEYWORD_CONSENT_COPY =
  "By texting JOIN, you agree to receive recurring SMS updates from DYE CUT LAB. Message and data rates may apply. Reply STOP to opt out, HELP for help.";

/* `sms:` URI with a prefilled body. `?&body=` is the form that works
   on both iOS and Android. */
export function smsHref(keyword: string) {
  return `sms:${SMS_NUMBER.e164}?&body=${encodeURIComponent(keyword)}`;
}
