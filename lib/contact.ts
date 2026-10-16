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
  phoneE164: "+16464450026",
  phoneDisplay: "(646) 445-0026",
  email: "dyecutlab@gmail.com",
};

/* Where every "Start your project" link points: the AI chat at /app.

   It is signed-in only, so a visitor who is not signed in is sent to sign-in
   first and brought back (the proxy and the page both check).

   The old /start quote form is retired: next.config.ts redirects /start to
   /app, so old links and texts still work. The form's files (app/start/,
   app/api/quote-requests/, lib/quoteRequests.ts) are kept for now; delete
   them once nobody needs them. Keep the quote_requests table, it holds real
   leads. To switch the form back on, point this at the form's page again and
   remove the redirect in next.config.ts. */
export const START_PROJECT_HREF = "/app";
