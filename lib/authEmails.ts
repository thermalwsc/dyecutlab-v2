/* =========================================================
   DYE CUT LAB — the account emails Supabase sends (invite, reset, confirm)
============================================================
   Supabase sends these itself, with a plain default look, from its own address.
   Once Supabase is set to send through our Brevo account (Authentication ->
   Emails -> SMTP Settings), these templates replace its defaults so they match
   every other email we send. The link is Supabase's own placeholder,
   {{ .ConfirmationURL }}, which it fills in per email.

   Run `node scripts/build-auth-emails.mts` to write them to
   supabase/email-templates/; paste each into Authentication -> Emails ->
   Templates. Covered by tests/authEmails.test.ts. */

import { renderEmail } from "./emailLayout.ts";

export const SUPABASE_LINK = "{{ .ConfirmationURL }}";

export type AuthEmail = {
  /** Supabase's name for the template, shown in its dashboard. */
  template: string;
  file: string;
  subject: string;
  html: string;
};

const FOOTER = "Questions? Email dyecutlab@gmail.com.";

function make(
  template: string,
  file: string,
  subject: string,
  content: { eyebrow: string; headline: string; intro: string; cta: string; footer: string }
): AuthEmail {
  const { html } = renderEmail({
    eyebrow: content.eyebrow,
    headline: content.headline,
    intro: content.intro,
    cta: { label: content.cta, url: SUPABASE_LINK },
    footer: `${content.footer} ${FOOTER}`,
  });
  return { template, file, subject, html };
}

export const AUTH_EMAILS: AuthEmail[] = [
  make("Invite user", "invite.html", "You're invited to DYE CUT LAB", {
    eyebrow: "You're invited",
    headline: "Join DYE CUT LAB",
    intro: "You've been invited to DYE CUT LAB. Choose a password to get started.",
    cta: "Set my password",
    footer: "If you weren't expecting this, you can ignore this email.",
  }),
  make("Reset password", "recovery.html", "Reset your DYE CUT LAB password", {
    eyebrow: "Password reset",
    headline: "Choose a new password",
    intro: "We received a request to reset the password on your account. Use the button below to choose a new one.",
    cta: "Choose a new password",
    footer: "If you didn't ask for this, you can safely ignore this email. The link works once.",
  }),
  make("Confirm sign up", "confirmation.html", "Confirm your DYE CUT LAB account", {
    eyebrow: "Welcome",
    headline: "Confirm your email",
    intro: "Welcome to DYE CUT LAB. Confirm your email address to finish creating your account.",
    cta: "Confirm my email",
    footer: "If you didn't sign up, you can ignore this email.",
  }),
  make("Magic link", "magic-link.html", "Your DYE CUT LAB sign-in link", {
    eyebrow: "Sign in",
    headline: "Your sign-in link",
    intro: "Use the button below to sign in. It works once and expires soon.",
    cta: "Sign in",
    footer: "If you didn't ask for this, you can ignore this email.",
  }),
  make("Change email address", "email-change.html", "Confirm your new DYE CUT LAB email", {
    eyebrow: "Email change",
    headline: "Confirm your new email",
    intro: "Confirm this address to finish changing the email on your account.",
    cta: "Confirm new email",
    footer: "If you didn't ask for this, you can ignore this email.",
  }),
];
