/* =========================================================
   DYE CUT LAB — public contact details + temporary routing
========================================================= */

/* Public business contact details — the Sendblue business line.
   Customers text this number; staff reply from Sendblue, so the
   personal number never appears on the site. This is the single
   source of truth for the public number: everything else
   (sms: links, pills, footer, /privacy, /terms, /start) reads from
   here. Staff alerts use STAFF_NOTIFY_PHONE / STAFF_NOTIFY_EMAIL
   and must never fall back to this number. */
export const CONTACT = {
  /* First name used in internal staff alerts only — never shown as
     the sender on the public /start flow (that uses "our team"). */
  personName: "Gilbert",
  phoneE164: "+14055635396",
  phoneDisplay: "(405) 563-5396",
  email: "dyecutlab@gmail.com",
};

/* Where every "Start your project" link points.

   TEMPORARY: the DICI chat at /app has active bugs, so project requests
   go to the /start quote form for now. To switch back:
     1. set this to "/app"
     2. delete app/start/, app/api/quote-requests/ and lib/quoteRequests.ts
   (keep the quote_requests table — it holds real leads). */
export const START_PROJECT_HREF = "/start";
