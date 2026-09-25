/* =========================================================
   DYE CUT LAB — public contact details + temporary routing
========================================================= */

/* Business contact details supplied by the client. Also the default
   destination for staff notifications (see lib/brevo.ts), overridable
   with STAFF_NOTIFY_PHONE / STAFF_NOTIFY_EMAIL. */
export const CONTACT = {
  /* The team member who texts customers back. First name only on the
     public site. */
  personName: "Gilbert",
  phoneE164: "+16469916338",
  phoneDisplay: "(646) 991-6338",
  email: "dyecutlab@gmail.com",
};

/* Where every "Start your project" link points.

   TEMPORARY: the DICI chat at /app has active bugs, so project requests
   go to the /start quote form for now. To switch back:
     1. set this to "/app"
     2. delete app/start/, app/api/quote-requests/ and lib/quoteRequests.ts
   (keep the quote_requests table — it holds real leads). */
export const START_PROJECT_HREF = "/start";
