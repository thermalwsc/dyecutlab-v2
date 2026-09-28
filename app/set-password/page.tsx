import type { Metadata } from "next";
import Link from "next/link";
import { brandFont } from "../fonts";
import { Footer, Header } from "../updates/SiteChrome";
import { getViewer } from "../../lib/auth/viewer";
import { getServerSupabase } from "../../lib/supabase/server";
import InviteLanding from "./InviteLanding";
import SetPasswordForm from "./SetPasswordForm";

export const metadata: Metadata = {
  title: "Set your password — DYE CUT LAB",
  robots: { index: false },
};

/* /set-password is where both email flows end up:
     • an invite ("you've been added to DYE CUT LAB") — Supabase cannot use PKCE
       for invites, so the tokens arrive in the URL hash. Only the browser can
       read them, so InviteLanding picks the session up and reloads once, after
       which the server can render the form below.
     • a password reset / "set a password" link — a PKCE code, which
       /auth/callback has already exchanged for a session cookie. */

export default async function SetPasswordPage() {
  const supabase = await getServerSupabase();
  const viewer = await getViewer(supabase);

  /* Switched off while following a link: drop the session and say so rather
     than letting them set a password on a dead account. */
  const disabled = Boolean(viewer.user) && !viewer.role;
  if (disabled) await supabase.auth.signOut();

  const activeUser = !disabled && viewer.user ? viewer.user : null;

  return (
    <div className={`${brandFont.className} dcl-landing`}>
      <main className="flex min-h-screen flex-col overflow-x-hidden bg-white text-[#0a0a0a] antialiased">
        <Header />

        <section className="mx-auto grid w-full max-w-3xl flex-1 content-center gap-6 px-4 pb-14 pt-8 sm:px-6 sm:pt-12 lg:px-10 lg:pb-20 lg:pt-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border-2 border-black bg-white px-3 py-1 text-[12px] font-extrabold">
              <span className="h-2 w-2 rounded-full bg-[var(--dcl-lime-deep)]" />
              Your account
            </p>
            <h1 className="dcl-rise mt-4 text-[clamp(32px,8.4vw,56px)] font-black leading-[1.04] tracking-[-0.045em]">
              Set a password.
            </h1>
            <p className="mt-3 max-w-[46ch] text-[15px] font-semibold leading-snug text-zinc-900 sm:text-[17px]">
              {activeUser
                ? "Choose a password and you're in. It is also how you sign in next time."
                : "This page needs a valid link from your email. Links expire after an hour and only work once."}
            </p>
          </div>

          {disabled ? (
            <div role="alert" className="rounded-[28px] border-2 border-red-300 bg-red-50 p-6 sm:rounded-[32px] sm:p-8">
              <h2 className="text-[20px] font-black tracking-[-0.03em] text-red-800">
                That account has been switched off.
              </h2>
              <p className="mt-2 text-[14px] font-medium leading-relaxed text-red-700">
                If you think that&rsquo;s a mistake, contact DYE CUT LAB and we&rsquo;ll sort it out.
              </p>
            </div>
          ) : activeUser ? (
            <SetPasswordForm email={activeUser.email} />
          ) : (
            <InviteLanding />
          )}

          <p className="text-center text-[13px] text-zinc-600">
            Trouble with the link?{" "}
            <Link href="/signin" className="font-bold text-black underline underline-offset-2">
              Go back to sign in
            </Link>{" "}
            and ask for a new one.
          </p>
        </section>

        <Footer />
      </main>
    </div>
  );
}
