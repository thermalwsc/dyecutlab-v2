/* =========================================================
   DYE CUT LAB — site on/off switches
=========================================================
   Sections that are built but not ready to show. Flip one to true to bring
   it back; nothing else needs to change. */

/* "Join Our Beta!" panel (Text JOIN + email sign-up) on the landing page, its
   menu link, and the beta line in the page description.

   Hidden for now: the offer isn't strong enough yet, and a 3D video that
   explains the app is being produced. Turn back on once the video is ready.
   The sign-up API (/api/subscribers), the table and the staff alerts are
   untouched, so existing sign-ups and the text keyword keep working. */
export const SHOW_BETA_SIGNUP = false;

/* Estimates and proofs inside the app. Until week 5 builds the estimate view
   and week 9 the proof view, the team sends them to the customer by text, so
   the "Estimate ready" and "Proof ready" stages must not offer a button that
   opens something that does not exist. Flip each to true when its view is
   live; lib/projectJourney.ts then shows "Review estimate" / "Review proof". */
export const ESTIMATES_IN_APP = false;
export const PROOFS_IN_APP = false;

/* The four-icon strip (Fast Quotes, Trusted Factories, Great Quality,
   English & Spanish) under the /start form. The client asked to remove it, so
   it is hidden; the component stays in SiteChrome.tsx if it is wanted again. */
export const SHOW_TRUST_ROW = false;
